import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import multer from "multer";
import { Server } from "socket.io";
import { validateSupabaseConnection } from "./db.js";
import { attachSocialFeatures } from "./social.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data");
const uploadsPath = path.join(root, "uploads");
const distPath = path.join(root, "dist");
const indexPath = path.join(distPath, "index.html");
const envPath = path.join(root, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const port = Number(process.env.PORT) || 3001;
mkdirSync(dataPath, { recursive: true });
mkdirSync(uploadsPath, { recursive: true });

const database = new DatabaseSync(path.join(dataPath, "bright-mind.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, room TEXT NOT NULL, sender TEXT NOT NULL, text TEXT,
    file_name TEXT, file_url TEXT, file_size INTEGER, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_room_created ON messages(room, created_at);
  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_low TEXT NOT NULL, user_high TEXT NOT NULL, requested_by TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (user_low, user_high)
  );
  CREATE TABLE IF NOT EXISTS chat_groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (group_id, user_id)
  );
`);
try {
  database.exec("ALTER TABLE messages ADD COLUMN sender_id TEXT");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}
const insertMessage = database.prepare(`
  INSERT INTO messages (id, room, sender, sender_id, text, file_name, file_url, file_size, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const listMessages = database.prepare(`
  SELECT messages.id, messages.room, messages.sender, messages.sender_id AS senderId,
    profiles.avatar AS senderAvatar, messages.text, messages.file_name AS fileName, messages.file_url AS fileUrl,
    messages.file_size AS fileSize, messages.created_at AS createdAt
  FROM messages LEFT JOIN profiles ON profiles.user_id = messages.sender_id
  WHERE messages.room = ? ORDER BY messages.created_at DESC LIMIT 150
`);

function cleanName(value) {
  return stripControls(String(value || ""))
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function stripControls(value) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
}

function saveMessage({
  room,
  sender,
  senderId = null,
  senderAvatar = null,
  text = null,
  fileName = null,
  fileUrl = null,
  fileSize = null,
}) {
  const message = {
    id: randomUUID(),
    room,
    sender,
    senderId,
    senderAvatar,
    text,
    fileName,
    fileUrl,
    fileSize,
    createdAt: new Date().toISOString(),
  };
  insertMessage.run(
    message.id,
    room,
    sender,
    senderId,
    text,
    fileName,
    fileUrl,
    fileSize,
    message.createdAt,
  );
  return message;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const supabaseStatus = await validateSupabaseConnection();
if (supabaseStatus.enabled) {
  console.log(`Supabase connected: ${supabaseStatus.message}`);
} else {
  console.warn(`Supabase not connected: ${supabaseStatus.message}`);
}

const social = attachSocialFeatures(io, database, {
  publicRooms: new Set(),
  listMessages,
  saveMessage,
  cleanName,
});
const storage = multer.diskStorage({
  destination: uploadsPath,
  filename: (_request, file, callback) => {
    const candidate = path.extname(file.originalname).slice(0, 12);
    const extension = /^\.[a-z0-9]{1,10}$/i.test(candidate)
      ? candidate.toLowerCase()
      : "";
    callback(null, `${randomUUID()}${extension}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(
  "/uploads",
  express.static(uploadsPath, {
    fallthrough: false,
    index: false,
    maxAge: "1h",
    setHeaders: (response) => {
      response.setHeader("Content-Disposition", "attachment");
      response.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);
app.get("/api/health", (_request, response) => response.json({ ok: true }));

app.post(
  "/api/upload",
  (request, response, next) => {
    const room = String(request.get("x-chat-room") || "");
    const userId = String(request.get("x-chat-user") || "");
    const profile = social.getProfile(userId);
    if (room === "lobby" || !profile || !social.canAccessRoom(userId, room))
      return response
        .status(400)
        .json({ error: "ឈ្មោះ ឬបន្ទប់ chat មិនត្រឹមត្រូវទេ។" });
    request.chatIdentity = {
      room,
      sender: profile.name,
      senderId: userId,
      senderAvatar: profile.avatar,
    };
    return next();
  },
  upload.single("file"),
  (request, response) => {
    if (!request.file)
      return response.status(400).json({ error: "សូមជ្រើសរើសឯកសារមួយ។" });
    const fileName =
      stripControls(path.basename(request.file.originalname)).slice(0, 180) ||
      "shared-file";
    const message = saveMessage({
      ...request.chatIdentity,
      fileName,
      fileUrl: `/uploads/${request.file.filename}`,
      fileSize: request.file.size,
    });
    io.to(message.room).emit("message:new", message);
    response.status(201).json({ ok: true, message });
  },
);

app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return response
      .status(tooLarge ? 413 : 400)
      .json({
        error: tooLarge
          ? "ឯកសារធំពេក។ អតិបរមា 20 MB។"
          : "មិនអាចផ្ញើឯកសារនេះបានទេ។",
      });
  }
  if (error.status === 404)
    return response.status(404).json({ error: "រកមិនឃើញឯកសារនេះទេ។" });
  console.error(error);
  return response
    .status(500)
    .json({ error: "មានបញ្ហាលើ server។ សូមសាកល្បងម្ដងទៀត។" });
});

if (existsSync(indexPath)) {
  app.use(express.static(distPath, { index: false }));
  app.use((request, response, next) => {
    if (
      request.method === "GET" &&
      !request.path.startsWith("/api/") &&
      !request.path.startsWith("/uploads/")
    )
      return response.sendFile(indexPath);
    return next();
  });
}
app.use((_request, response) =>
  response.status(404).json({ error: "រកមិនឃើញទំព័រនេះទេ។" }),
);

httpServer.listen(port, "0.0.0.0", () =>
  console.log(`Bright Mind Chat listening on http://0.0.0.0:${port}`),
);
