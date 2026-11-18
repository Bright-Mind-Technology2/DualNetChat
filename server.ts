import express from 'express';
import http from 'http';
import https from 'https';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializePersistence, loadPersistedState, savePersistedState } from './server-storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const certFile = process.env.HTTPS_CERT_FILE;
const keyFile = process.env.HTTPS_KEY_FILE;
if (Boolean(certFile) !== Boolean(keyFile)) {
  throw new Error('Set both HTTPS_CERT_FILE and HTTPS_KEY_FILE to enable HTTPS.');
}
const isHttps = Boolean(certFile && keyFile);
const app = express();
const server = isHttps
  ? https.createServer({
      cert: fs.readFileSync(path.resolve(certFile!)),
      key: fs.readFileSync(path.resolve(keyFile!)),
    }, app)
  : http.createServer(app);

// Configure Socket.io with CORS allowing local LAN connections
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e7, // 50MB for file sharing over local Wi-Fi
});

const isProd = process.env.NODE_ENV === 'production';

type AsyncRouteHandler = (
  req: express.Request,
  res: express.Response
) => Promise<unknown>;

function asyncRoute(handler: AsyncRouteHandler): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const uploadsDir = process.env.DATA_DIR
  ? path.join(dataDir, 'uploads')
  : path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
const usersFilePath = path.join(dataDir, 'users.json');
const directMessagesFilePath = path.join(dataDir, 'direct-messages.json');
const channelStateFilePath = path.join(dataDir, 'channels.json');

interface StoredAccount {
  id: string; // usr_...
  username: string; // unique lowercase handle
  displayName: string;
  salt: string;
  passwordHash: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarImage?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'laptop';
  role: 'admin' | 'user';
  friends?: string[];
  blockedUsers?: string[];
  createdAt: number;
}

await initializePersistence();
let storedAccounts = await loadPersistedState<StoredAccount[]>('users', usersFilePath, []);
let migratedAccountRoles = false;
storedAccounts.forEach((account) => {
  if (!account.role) {
    account.role = account.username === 'admin' ? 'admin' : 'user';
    migratedAccountRoles = true;
  }
});
if (migratedAccountRoles) await savePersistedState('users', storedAccounts);

function loadStoredAccounts(): StoredAccount[] {
  return storedAccounts;
}

function saveStoredAccounts(accounts: StoredAccount[]): Promise<void> {
  storedAccounts = accounts;
  return savePersistedState('users', accounts);
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function areFriends(firstUserId: string, secondUserId: string): boolean {
  const accounts = loadStoredAccounts();
  const first = accounts.find((account) => account.id === firstUserId);
  const second = accounts.find((account) => account.id === secondUserId);
  return Boolean(
    first?.friends?.includes(secondUserId) &&
    second?.friends?.includes(firstUserId) &&
    !first.blockedUsers?.includes(secondUserId) &&
    !second.blockedUsers?.includes(firstUserId)
  );
}

// Seed or ensure a default admin account exists
async function ensureDefaultAdminAccount() {
  const accounts = loadStoredAccounts();
  const hasAdmin = accounts.some((acc) => acc.role === 'admin' || acc.username === 'admin');
  if (!hasAdmin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword('admin123', salt);
    const adminAccount: StoredAccount = {
      id: `usr_admin_${Date.now().toString(36)}`,
      username: 'admin',
      displayName: 'System Admin',
      salt,
      passwordHash,
      avatarColor: '#f43f5e',
      avatarEmoji: '👑',
      deviceType: 'desktop',
      role: 'admin',
      createdAt: Date.now(),
    };
    accounts.push(adminAccount);
    await saveStoredAccounts(accounts);
    console.log('👑 Default Admin created: username="admin".');
  } else {
    // Ensure the existing admin account has role = 'admin'
    const adminAcc = accounts.find((a) => a.username === 'admin');
    if (adminAcc && adminAcc.role !== 'admin') {
      adminAcc.role = 'admin';
      await saveStoredAccounts(accounts);
    }
  }
}
await ensureDefaultAdminAccount();

// Active session tokens: token -> userId
const activeTokens = new Map<string, string>();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const userId = typeof token === 'string' ? activeTokens.get(token) : undefined;
  if (!userId) return next(new Error('Unauthorized'));
  socket.data.authUserId = userId;
  next();
});

// Serve uploaded local files
app.use('/uploads', express.static(uploadsDir));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Authentication REST APIs
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  try {
    const { username, password, displayName, avatarColor, avatarEmoji, deviceType, role } = req.body;

    const trimmedUsername = (username || '').trim().toLowerCase();
    if (!trimmedUsername || trimmedUsername.length < 3 || /\s/.test(trimmedUsername)) {
      return res.status(400).json({ success: false, error: 'usernameError' });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'passwordError' });
    }

    const accounts = loadStoredAccounts();
    if (accounts.some((acc) => acc.username === trimmedUsername)) {
      return res.status(409).json({ success: false, error: 'registerFailed' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const userId = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    // If username is "admin" or role is specified as admin
    const assignedRole: 'admin' | 'user' =
      trimmedUsername === 'admin' || role === 'admin' ? 'admin' : 'user';

    const newAccount: StoredAccount = {
      id: userId,
      username: trimmedUsername,
      displayName: (displayName || trimmedUsername).trim().slice(0, 30),
      salt,
      passwordHash,
      avatarColor: avatarColor || (assignedRole === 'admin' ? '#f43f5e' : '#6366f1'),
      avatarEmoji: avatarEmoji || (assignedRole === 'admin' ? '👑' : '⚡'),
      deviceType: deviceType || 'laptop',
      role: assignedRole,
      createdAt: Date.now(),
    };

    accounts.push(newAccount);
    await saveStoredAccounts(accounts);

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    activeTokens.set(token, userId);

    const safeUser = {
      id: userId,
      userId,
      username: newAccount.displayName,
      handle: newAccount.username,
      avatarColor: newAccount.avatarColor,
      avatarEmoji: newAccount.avatarEmoji,
      avatarImage: newAccount.avatarImage,
      deviceType: newAccount.deviceType,
      role: newAccount.role,
      status: 'online' as const,
    };

    res.json({ success: true, token, user: safeUser });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}));

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const trimmedUsername = (username || '').trim().toLowerCase();

    if (!trimmedUsername || !password) {
      return res.status(400).json({ success: false, error: 'loginFailed' });
    }

    const accounts = loadStoredAccounts();
    const account = accounts.find((acc) => acc.username === trimmedUsername);
    if (!account) {
      return res.status(401).json({ success: false, error: 'loginFailed' });
    }

    const checkHash = hashPassword(password, account.salt);
    if (checkHash !== account.passwordHash) {
      return res.status(401).json({ success: false, error: 'loginFailed' });
    }

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    activeTokens.set(token, account.id);

    const safeUser = {
      id: account.id,
      userId: account.id,
      username: account.displayName,
      handle: account.username,
      avatarColor: account.avatarColor,
      avatarEmoji: account.avatarEmoji,
      avatarImage: account.avatarImage,
      deviceType: account.deviceType,
      role: account.role || (account.username === 'admin' ? 'admin' : 'user'),
      status: 'online' as const,
    };

    res.json({ success: true, token, user: safeUser });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/verify', (req, res) => {
  try {
    const token = req.body.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false });
    }

    const userId = activeTokens.get(token);
    if (!userId) {
      return res.status(401).json({ success: false });
    }

    const accounts = loadStoredAccounts();
    const account = accounts.find((acc) => acc.id === userId);
    if (!account) {
      return res.status(401).json({ success: false });
    }

    const safeUser = {
      id: account.id,
      userId: account.id,
      username: account.displayName,
      handle: account.username,
      avatarColor: account.avatarColor,
      avatarEmoji: account.avatarEmoji,
      avatarImage: account.avatarImage,
      deviceType: account.deviceType,
      role: account.role || (account.username === 'admin' ? 'admin' : 'user'),
      status: 'online' as const,
    };

    res.json({ success: true, user: safeUser });
  } catch (err: any) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.body.token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    activeTokens.delete(token);
  }
  res.json({ success: true });
});

app.get('/api/friends', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  if (!account) return res.status(401).json({ success: false, error: 'unauthorized' });

  const friends = accounts
    .filter((item) => account.friends?.includes(item.id))
    .map((friend) => ({
      id: friend.id,
      userId: friend.id,
      username: friend.displayName,
      handle: friend.username,
      avatarColor: friend.avatarColor,
      avatarEmoji: friend.avatarEmoji,
      avatarImage: friend.avatarImage,
      deviceType: friend.deviceType,
      role: friend.role,
    }));

  const blockedUsers = accounts
    .filter((item) => account.blockedUsers?.includes(item.id))
    .map((blockedUser) => ({
      id: blockedUser.id,
      userId: blockedUser.id,
      username: blockedUser.displayName,
      handle: blockedUser.username,
      avatarColor: blockedUser.avatarColor,
      avatarEmoji: blockedUser.avatarEmoji,
      avatarImage: blockedUser.avatarImage,
      deviceType: blockedUser.deviceType,
      role: blockedUser.role,
    }));

  res.json({ success: true, friends, blockedUsers });
});

app.get('/api/users/search', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const query = typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : '';
  if (query.length < 2) {
    return res.status(400).json({ success: false, error: 'searchUsernameTooShort' });
  }

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  if (!account) return res.status(401).json({ success: false, error: 'unauthorized' });

  const matches = accounts
    .filter((item) => item.id !== userId && item.username.includes(query))
    .slice(0, 10)
    .map((item) => ({
      userId: item.id,
      username: item.displayName,
      handle: item.username,
      avatarColor: item.avatarColor,
      avatarEmoji: item.avatarEmoji,
      avatarImage: item.avatarImage,
      deviceType: item.deviceType,
      role: item.role,
      isFriend: Boolean(account.friends?.includes(item.id) && item.friends?.includes(account.id)),
    }));

  res.json({ success: true, users: matches });
});

app.post('/api/friends', asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  if (!username) return res.status(400).json({ success: false, error: 'friendUsernameRequired' });

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  if (!account) return res.status(401).json({ success: false, error: 'unauthorized' });

  const friend = accounts.find((item) => item.username === username);
  if (!friend) return res.status(404).json({ success: false, error: 'friendNotFound' });
  if (friend.id === account.id) return res.status(400).json({ success: false, error: 'cannotAddSelf' });
  if (account.blockedUsers?.includes(friend.id) || friend.blockedUsers?.includes(account.id)) {
    return res.status(403).json({ success: false, error: 'friendBlocked' });
  }

  const alreadyFriends =
    account.friends?.includes(friend.id) && friend.friends?.includes(account.id);
  if (alreadyFriends) {
    return res.json({
      success: true,
      friend: {
        id: friend.id,
        userId: friend.id,
        username: friend.displayName,
        handle: friend.username,
        avatarColor: friend.avatarColor,
        avatarEmoji: friend.avatarEmoji,
        avatarImage: friend.avatarImage,
        deviceType: friend.deviceType,
        role: friend.role,
      },
      alreadyFriends: true,
    });
  }
  account.friends = [...new Set([...(account.friends || []), friend.id])];
  friend.friends = [...new Set([...(friend.friends || []), account.id])];
  await saveStoredAccounts(accounts);

  const safeFriend = {
    id: friend.id,
    userId: friend.id,
    username: friend.displayName,
    handle: friend.username,
    avatarColor: friend.avatarColor,
    avatarEmoji: friend.avatarEmoji,
    avatarImage: friend.avatarImage,
    deviceType: friend.deviceType,
    role: friend.role,
  };

  for (const [socketId, connectedUser] of connectedUsers) {
    if (connectedUser.userId === account.id || connectedUser.userId === friend.id) {
      io.to(socketId).emit('friends:updated');
    }
  }

  res.json({ success: true, friend: safeFriend, alreadyFriends: Boolean(alreadyFriends) });
}));

app.delete('/api/friends/:friendId', asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const friendId = req.params.friendId;
  if (typeof friendId !== 'string' || friendId === userId) {
    return res.status(400).json({ success: false, error: 'invalidFriend' });
  }

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  const friend = accounts.find((item) => item.id === friendId);
  if (!account || !friend) return res.status(404).json({ success: false, error: 'friendNotFound' });

  account.friends = (account.friends || []).filter((id) => id !== friendId);
  friend.friends = (friend.friends || []).filter((id) => id !== userId);
  await saveStoredAccounts(accounts);

  for (const [socketId, connectedUser] of connectedUsers) {
    if (connectedUser.userId === userId || connectedUser.userId === friendId) {
      io.to(socketId).emit('friends:updated');
    }
  }

  res.json({ success: true });
}));

app.post('/api/blocks/:userId', asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const blockedId = req.params.userId;
  if (typeof blockedId !== 'string' || blockedId === userId) {
    return res.status(400).json({ success: false, error: 'invalidUser' });
  }

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  const blockedUser = accounts.find((item) => item.id === blockedId);
  if (!account || !blockedUser) return res.status(404).json({ success: false, error: 'userNotFound' });

  account.friends = (account.friends || []).filter((id) => id !== blockedId);
  blockedUser.friends = (blockedUser.friends || []).filter((id) => id !== userId);
  account.blockedUsers = [...new Set([...(account.blockedUsers || []), blockedId])];
  await saveStoredAccounts(accounts);

  for (const [socketId, connectedUser] of connectedUsers) {
    if (connectedUser.userId === userId || connectedUser.userId === blockedId) {
      io.to(socketId).emit('friends:updated');
    }
  }

  res.json({ success: true });
}));

app.delete('/api/blocks/:userId', asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  const userId = token ? activeTokens.get(token) : undefined;
  if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

  const blockedId = req.params.userId;
  if (typeof blockedId !== 'string' || blockedId === userId) {
    return res.status(400).json({ success: false, error: 'invalidUser' });
  }

  const accounts = loadStoredAccounts();
  const account = accounts.find((item) => item.id === userId);
  if (!account) return res.status(401).json({ success: false, error: 'unauthorized' });
  if (!accounts.some((item) => item.id === blockedId)) {
    return res.status(404).json({ success: false, error: 'userNotFound' });
  }

  account.blockedUsers = (account.blockedUsers || []).filter((id) => id !== blockedId);
  await saveStoredAccounts(accounts);

  for (const [socketId, connectedUser] of connectedUsers) {
    if (connectedUser.userId === userId || connectedUser.userId === blockedId) {
      io.to(socketId).emit('friends:updated');
    }
  }

  res.json({ success: true });
}));

// Helper to get local LAN IPv4 addresses
function getLanIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: { address: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        const isWifi = /wi[\s-]?fi|wlan|wireless/i.test(name);
        const isVirtual = /vmware|hyper-v|vEthernet|virtual|virtualbox|docker|wsl|vpn|bridge|bluetooth|tun|tap/i.test(name);
        const isEthernet = /ethernet|^eth|^en\d/i.test(name);
        const priority = isWifi ? 0 : isVirtual ? 3 : isEthernet ? 1 : 2;
        addresses.push({ address: net.address, priority });
      }
    }
  }
  return addresses
    .sort((first, second) => first.priority - second.priority)
    .map(({ address }) => address);
}

// REST API for LAN and server info
app.get('/api/lan-info', (req, res) => {
  const lanIps = getLanIpAddresses();
  const hostname = os.hostname();
  res.json({
    appName: 'Bright Mind Local Chat',
    hostname,
    lanIps,
    port: PORT,
    protocol: isHttps ? 'https' : 'http',
    platform: os.platform(),
    uptime: process.uptime(),
    connectedUsers: io.engine.clientsCount,
    timestamp: Date.now(),
  });
});

// File upload endpoint for local sharing (images, voice notes, documents)
app.post('/api/upload', (req, res) => {
  try {
    const { name, type, data } = req.body;
    if (!data || !name) {
      return res.status(400).json({ error: 'Missing file data or name' });
    }

    // Data URLs can include codec parameters, such as `data:audio/webm;codecs=opus;base64,...`.
    const matches = typeof data === 'string'
      ? data.match(/^data:([^;,]+)(?:;[^,]+)*;base64,([\s\S]+)$/i)
      : null;
    let buffer: Buffer;
    if (matches && matches.length === 3) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }

    // Generate safe unique filename
    const ext = path.extname(name) || (type ? `.${type.split('/')[1] || 'bin'}` : '.bin');
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${safeName}`;
    res.json({
      success: true,
      url: fileUrl,
      fileName: name,
      fileSize: buffer.length,
      fileType: type || 'application/octet-stream',
    });
  } catch (err: any) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Failed to save file on local server', details: err.message });
  }
});

// Data structures for chat
export interface User {
  id: string; // socket.id
  userId: string; // persistent client id
  username: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarImage?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'laptop';
  role?: 'admin' | 'user';
  status: 'online' | 'busy' | 'away';
  customStatus?: string;
  joinedAt: number;
  lastSeen: number;
}

export interface Reaction {
  emoji: string;
  users: string[]; // usernames
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar: { color: string; emoji: string; image?: string };
  recipientId?: string; // if Direct Message
  text: string;
  type: 'text' | 'file' | 'audio' | 'sketch' | 'system';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  sketchData?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions: Record<string, string[]>; // emoji -> array of usernames
  isPinned?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  readBy?: Record<string, number>; // userId -> timestamp
  timestamp: number;
}

export interface Channel {
  id: string;
  name: string;
  nameKm: string;
  description: string;
  descriptionKm: string;
  isDefault?: boolean;
  createdBy?: string;
  createdById?: string;
  createdAt: number;
}

const defaultChannels: Channel[] = [];

interface StoredChannelState {
  channels: Channel[];
  messages: Record<string, ChatMessage[]>;
  members: Record<string, string[]>;
}

async function loadChannelState(): Promise<StoredChannelState> {
  try {
    const stored = await loadPersistedState<StoredChannelState>(
      'channels',
      channelStateFilePath,
      { channels: [...defaultChannels], messages: {}, members: {} }
    );
    if (
      !stored ||
      !Array.isArray(stored.channels) ||
      !stored.messages ||
      typeof stored.messages !== 'object' ||
      Array.isArray(stored.messages) ||
      !stored.members ||
      typeof stored.members !== 'object' ||
      Array.isArray(stored.members)
    ) {
      throw new Error('Invalid channel state data');
    }

    for (const channel of stored.channels) {
      if (
        !channel ||
        typeof channel.id !== 'string' ||
        typeof channel.name !== 'string' ||
        typeof channel.nameKm !== 'string' ||
        typeof channel.description !== 'string' ||
        typeof channel.descriptionKm !== 'string' ||
        typeof channel.createdAt !== 'number'
      ) {
        throw new Error('Invalid channel record');
      }

      const messages = stored.messages[channel.id];
      const members = stored.members[channel.id];
      if (
        (messages !== undefined && (!Array.isArray(messages) || messages.some((message) => !message || typeof message.id !== 'string'))) ||
        (members !== undefined && (!Array.isArray(members) || members.some((memberId) => typeof memberId !== 'string')))
      ) {
        throw new Error(`Invalid stored data for channel ${channel.id}`);
      }
    }

    return stored;
  } catch (error) {
    console.error('Error reading channel state from PostgreSQL:', error);
    throw error;
  }
}

const initialChannelState = await loadChannelState();
let channels: Channel[] = initialChannelState.channels;
const channelMessages = new Map<string, ChatMessage[]>(
  channels.map((channel) => [channel.id, (initialChannelState.messages[channel.id] || []).slice(-300)])
);
const channelMembers = new Map<string, Set<string>>(
  channels.map((channel) => [channel.id, new Set(initialChannelState.members[channel.id] || [])])
);

async function persistChannelState(): Promise<void> {
  const state: StoredChannelState = {
    channels,
    messages: Object.fromEntries(channelMessages),
    members: Object.fromEntries(
      Array.from(channelMembers, ([channelId, members]) => [channelId, Array.from(members)])
    ),
  };
  try {
    await savePersistedState('channels', state);
  } catch (error) {
    console.error('Error saving channel state to PostgreSQL:', error);
    throw error;
  }
}

// Active socket sessions remain in memory; channel content is persisted in PostgreSQL.
const connectedUsers = new Map<string, User>(); // socket.id -> User

async function persistSocketState(socket: Socket, operation: Promise<void>): Promise<boolean> {
  try {
    await operation;
    return true;
  } catch (error) {
    console.error('Error persisting socket update:', error);
    socket.emit('persistence:error', { error: 'failedToSave' });
    return false;
  }
}

function isChannelMember(userId: string, channelId: string): boolean {
  return channelMembers.get(channelId)?.has(userId) ?? false;
}

// Store direct messages: key = sorted userId1:userId2
async function loadDirectMessages(): Promise<Map<string, ChatMessage[]>> {
  try {
    const stored = await loadPersistedState<Record<string, ChatMessage[]>>(
      'direct-messages',
      directMessagesFilePath,
      {}
    );
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      throw new Error('Direct message data must be an object');
    }
    for (const [key, messages] of Object.entries(stored)) {
      if (!key.includes(':::') || !Array.isArray(messages)) {
        throw new Error('Invalid direct message conversation data');
      }
    }
    return new Map(Object.entries(stored));
  } catch (err) {
    console.error('Error reading direct messages from PostgreSQL:', err);
    throw err;
  }
}

const directMessages: Map<string, ChatMessage[]> = await loadDirectMessages();

async function persistDirectMessages(): Promise<void> {
  try {
    await savePersistedState('direct-messages', Object.fromEntries(directMessages));
  } catch (err) {
    console.error('Error saving direct messages to PostgreSQL:', err);
    throw err;
  }
}

// Helper to push message
async function saveMessage(channelId: string, msg: ChatMessage, recipientId?: string): Promise<void> {
  if (recipientId) {
    const key = [msg.senderId, recipientId].sort().join(':::');
    const existing = directMessages.get(key) || [];
    existing.push(msg);
    if (existing.length > 200) existing.shift();
    directMessages.set(key, existing);
    await persistDirectMessages();
  } else {
    const existing = channelMessages.get(channelId) || [];
    existing.push(msg);
    if (existing.length > 300) existing.shift();
    channelMessages.set(channelId, existing);
    await persistChannelState();
  }
}

// Socket.io Real-time Event Handlers
io.on('connection', (socket) => {
  // 1. User Join / Handshake
  socket.on('user:join', (userData: {
    userId: string;
    username: string;
    avatarColor: string;
    avatarEmoji: string;
    avatarImage?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet' | 'laptop';
    role?: 'admin' | 'user';
    status?: 'online' | 'busy' | 'away';
    customStatus?: string;
  }) => {
    const authenticatedUserId = socket.data.authUserId as string;
    if (userData.userId !== authenticatedUserId) {
      socket.disconnect(true);
      return;
    }

    const accounts = loadStoredAccounts();
    const storedAcc = accounts.find((a) => a.id === authenticatedUserId);
    if (!storedAcc) {
      socket.disconnect(true);
      return;
    }
    const resolvedRole: 'admin' | 'user' = storedAcc.role;

    const user: User = {
      id: socket.id,
      userId: storedAcc.id,
      username: storedAcc.displayName,
      avatarColor: storedAcc.avatarColor,
      avatarEmoji: storedAcc.avatarEmoji,
      avatarImage: storedAcc.avatarImage,
      deviceType: storedAcc.deviceType || userData.deviceType || 'laptop',
      role: resolvedRole,
      status: userData.status || 'online',
      customStatus: userData.customStatus || '',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };

    connectedUsers.set(socket.id, user);

    // Join only channels this account has been invited to.
    const userChannels = channels.filter((channel) => isChannelMember(user.userId, channel.id));
    for (const channel of userChannels) {
      socket.join(`chan:${channel.id}`);
    }

    // Send initial synchronized state to the connecting client
    const allUsers = Array.from(connectedUsers.values());
    
    // Prepare recent channel messages map
    const recentChannelMsgs: Record<string, ChatMessage[]> = {};
    for (const channel of userChannels) {
      recentChannelMsgs[channel.id] = channelMessages.get(channel.id) || [];
    }

    // Prepare direct messages relevant to this user
    const userDirectMsgs: Record<string, ChatMessage[]> = {};
    directMessages.forEach((msgs, key) => {
      if (key.split(':::').includes(user.userId)) {
        userDirectMsgs[key] = msgs;
      }
    });

    socket.emit('init:state', {
      currentUser: user,
      users: allUsers,
      channels: userChannels,
      messages: recentChannelMsgs,
      directMessages: userDirectMsgs,
      serverTime: Date.now(),
      lanIps: getLanIpAddresses(),
      port: PORT,
      protocol: isHttps ? 'https' : 'http',
    });

    // Notify others that a peer has joined
    socket.broadcast.emit('user:joined', user);

  });

  // 2. User status update
  socket.on('user:update', async (updateData: Partial<User>) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (updateData.username) user.username = updateData.username.trim().slice(0, 30);
    if (updateData.avatarColor) user.avatarColor = updateData.avatarColor;
    if (updateData.avatarEmoji) user.avatarEmoji = updateData.avatarEmoji;
    if (updateData.avatarImage !== undefined) user.avatarImage = updateData.avatarImage;
    if (updateData.status) user.status = updateData.status;
    if (updateData.customStatus !== undefined) user.customStatus = updateData.customStatus;

    user.lastSeen = Date.now();
    connectedUsers.set(socket.id, user);

    // Persist registered account changes.
    try {
      const accounts = loadStoredAccounts();
      const accIdx = accounts.findIndex((acc) => acc.id === user.userId);
      if (accIdx > -1) {
        if (updateData.username) accounts[accIdx].displayName = user.username;
        if (updateData.avatarColor) accounts[accIdx].avatarColor = user.avatarColor;
        if (updateData.avatarEmoji) accounts[accIdx].avatarEmoji = user.avatarEmoji;
        if (updateData.avatarImage !== undefined) accounts[accIdx].avatarImage = updateData.avatarImage;
        if (updateData.deviceType) accounts[accIdx].deviceType = user.deviceType;
        await saveStoredAccounts(accounts);
      }
    } catch (e) {
      console.error('Error persisting user update:', e);
      socket.emit('persistence:error', { error: 'failedToSave' });
      return;
    }

    io.emit('user:updated', user);
  });

  // 3. Channel create
  socket.on('channel:create', async (newChan: {
    name: string;
    nameKm?: string;
    description?: string;
    descriptionKm?: string;
    memberIds?: string[];
  }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || typeof newChan.name !== 'string') return;

    const rawName = newChan.name.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');
    if (!rawName) return;

    const invitedUserIds = Array.isArray(newChan.memberIds)
      ? [...new Set(newChan.memberIds)].filter(
          (memberId) => typeof memberId === 'string' && areFriends(user.userId, memberId)
        )
      : [];
    const memberIds = new Set([user.userId, ...invitedUserIds]);
    const channelId = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const createdChan: Channel = {
      id: channelId,
      name: rawName,
      nameKm: typeof newChan.nameKm === 'string' ? newChan.nameKm.slice(0, 40) : newChan.name,
      description: typeof newChan.description === 'string'
        ? newChan.description.slice(0, 120)
        : 'Custom local channel',
      descriptionKm: typeof newChan.descriptionKm === 'string'
        ? newChan.descriptionKm.slice(0, 120)
        : 'បន្ទប់ជជែកបង្កើតថ្មី',
      isDefault: false,
      createdBy: user.username,
      createdById: user.userId,
      createdAt: Date.now(),
    };

    channels.push(createdChan);
    channelMessages.set(channelId, []);
    channelMembers.set(channelId, memberIds);
    if (!await persistSocketState(socket, persistChannelState())) return;

    // Only the creator and invited friends receive the channel and its messages.
    connectedUsers.forEach((connectedUser, socketId) => {
      if (memberIds.has(connectedUser.userId)) {
        io.sockets.sockets.get(socketId)?.join(`chan:${channelId}`);
        io.to(socketId).emit('channel:created', createdChan);
      }
    });
  });

  socket.on('channel:delete', async (data: { channelId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || typeof data?.channelId !== 'string') return;

    const channel = channels.find((item) => item.id === data.channelId);
    if (!channel || channel.isDefault) return;
    if (channel.createdById !== user.userId && user.role !== 'admin') return;

    channels = channels.filter((item) => item.id !== channel.id);
    channelMessages.delete(channel.id);
    channelMembers.delete(channel.id);
    if (!await persistSocketState(socket, persistChannelState())) return;

    io.emit('channel:deleted', { channelId: channel.id });
    io.in(`chan:${channel.id}`).socketsLeave(`chan:${channel.id}`);
  });

  // 4. Send Message (Channel or Direct Message)
  socket.on('message:send', async (msgData: {
    channelId?: string;
    recipientId?: string;
    text: string;
    type?: 'text' | 'file' | 'audio' | 'sketch';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    sketchData?: string;
    replyTo?: { id: string; senderName: string; text: string };
  }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    if (msgData.recipientId && !areFriends(user.userId, msgData.recipientId)) return;
    if (
      !msgData.recipientId &&
      (!msgData.channelId ||
        !channels.some((channel) => channel.id === msgData.channelId) ||
        !isChannelMember(user.userId, msgData.channelId))
    ) {
      return;
    }

    const recipientOnline = msgData.recipientId
      ? Array.from(connectedUsers.values()).some((u) => u.userId === msgData.recipientId)
      : false;

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channelId: msgData.channelId || '',
      senderId: user.userId,
      senderName: user.username,
      senderAvatar: { color: user.avatarColor, emoji: user.avatarEmoji, image: user.avatarImage },
      recipientId: msgData.recipientId,
      text: msgData.text || '',
      type: msgData.type || 'text',
      fileUrl: msgData.fileUrl,
      fileName: msgData.fileName,
      fileSize: msgData.fileSize,
      fileType: msgData.fileType,
      sketchData: msgData.sketchData,
      replyTo: msgData.replyTo,
      reactions: {},
      status: recipientOnline ? 'delivered' : 'sent',
      readBy: { [user.userId]: Date.now() },
      timestamp: Date.now(),
    };

    if (msgData.recipientId) {
      // Direct Message
      if (!await persistSocketState(socket, saveMessage('', message, msgData.recipientId))) return;

      // Find recipient socket(s) with matching userId
      let recipientFound = false;
      connectedUsers.forEach((u, sockId) => {
        if (u.userId === msgData.recipientId) {
          io.to(sockId).emit('message:direct', message);
          recipientFound = true;
        }
      });
      // Also send back to sender
      socket.emit('message:direct', message);
    } else {
      // Channel message
      if (!await persistSocketState(socket, saveMessage(message.channelId, message))) return;
      io.to(`chan:${message.channelId}`).emit('message:new', message);
    }
  });

  // 5. Message reaction (toggle emoji reaction)
  socket.on('message:react', async (data: { messageId: string; channelId?: string; recipientId?: string; emoji: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    let targetMsg: ChatMessage | undefined;

    if (data.recipientId) {
      if (!areFriends(user.userId, data.recipientId)) return;
      const key = [user.userId, data.recipientId].sort().join(':::');
      const list = directMessages.get(key) || [];
      targetMsg = list.find((m) => m.id === data.messageId);
    } else if (data.channelId) {
      if (!isChannelMember(user.userId, data.channelId)) return;
      const list = channelMessages.get(data.channelId) || [];
      targetMsg = list.find((m) => m.id === data.messageId);
    }

    if (!targetMsg) return;

    if (!targetMsg.reactions) {
      targetMsg.reactions = {};
    }

    const currentReacters = targetMsg.reactions[data.emoji] || [];
    const existingIndex = currentReacters.indexOf(user.username);

    if (existingIndex > -1) {
      // Remove reaction
      currentReacters.splice(existingIndex, 1);
      if (currentReacters.length === 0) {
        delete targetMsg.reactions[data.emoji];
      } else {
        targetMsg.reactions[data.emoji] = currentReacters;
      }
    } else {
      // Add reaction
      currentReacters.push(user.username);
      targetMsg.reactions[data.emoji] = currentReacters;
    }

    if (data.recipientId) {
      const conversationKey = [user.userId, data.recipientId].sort().join(':::');
      directMessages.set(conversationKey, directMessages.get(conversationKey) || []);
      if (!await persistSocketState(socket, persistDirectMessages())) return;
    } else {
      if (!await persistSocketState(socket, persistChannelState())) return;
    }

    const payload = {
      messageId: targetMsg.id,
      channelId: targetMsg.channelId,
      recipientId: data.recipientId,
      conversationKey: data.recipientId ? [user.userId, data.recipientId].sort().join(':::') : undefined,
      reactions: targetMsg.reactions,
    };

    if (data.recipientId) {
      connectedUsers.forEach((u, sockId) => {
        if (u.userId === data.recipientId || u.userId === user.userId) {
          io.to(sockId).emit('message:reacted', payload);
        }
      });
    } else {
      io.to(`chan:${targetMsg.channelId}`).emit('message:reacted', payload);
    }
  });

  // 6. Pin / Unpin Message (Channel or Direct Message)
  socket.on('message:pin', async (data: { messageId: string; channelId?: string; recipientId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (data.recipientId) {
      const convKey = [user.userId, data.recipientId].sort().join(':::');
      if (!areFriends(user.userId, data.recipientId)) return;
      const list = directMessages.get(convKey) || [];
      const target = list.find((m) => m.id === data.messageId);
      if (!target) return;

      target.isPinned = !target.isPinned;
      directMessages.set(convKey, list);
      if (!await persistSocketState(socket, persistDirectMessages())) return;
      const payload = {
        messageId: target.id,
        recipientId: data.recipientId,
        conversationKey: convKey,
        isPinned: target.isPinned,
      };

      connectedUsers.forEach((u, sockId) => {
        if (u.userId === data.recipientId || u.userId === user.userId) {
          io.to(sockId).emit('message:pinned', payload);
        }
      });
    } else if (data.channelId) {
      if (!isChannelMember(user.userId, data.channelId)) return;
      const list = channelMessages.get(data.channelId) || [];
      const target = list.find((m) => m.id === data.messageId);
      if (!target) return;

      target.isPinned = !target.isPinned;
      if (!await persistSocketState(socket, persistChannelState())) return;
      io.to(`chan:${data.channelId}`).emit('message:pinned', {
        messageId: target.id,
        channelId: data.channelId,
        isPinned: target.isPinned,
      });
    }
  });

  socket.on('message:delete', async (data: { messageId: string; channelId?: string; recipientId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.messageId) return;

    if (data.recipientId) {
      if (!areFriends(user.userId, data.recipientId)) return;
      const conversationKey = [user.userId, data.recipientId].sort().join(':::');
      const messages = directMessages.get(conversationKey) || [];
      const target = messages.find((message) => message.id === data.messageId);
      if (!target || target.senderId !== user.userId) return;

      directMessages.set(
        conversationKey,
        messages.filter((message) => message.id !== data.messageId)
      );
      if (!await persistSocketState(socket, persistDirectMessages())) return;

      const payload = {
        messageId: target.id,
        recipientId: data.recipientId,
        conversationKey,
      };
      connectedUsers.forEach((connectedUser, socketId) => {
        if (connectedUser.userId === data.recipientId || connectedUser.userId === user.userId) {
          io.to(socketId).emit('message:deleted', payload);
        }
      });
    } else if (
      data.channelId &&
      channels.some((channel) => channel.id === data.channelId) &&
      isChannelMember(user.userId, data.channelId)
    ) {
      const messages = channelMessages.get(data.channelId) || [];
      const target = messages.find((message) => message.id === data.messageId);
      if (!target || target.senderId !== user.userId) return;

      channelMessages.set(
        data.channelId,
        messages.filter((message) => message.id !== data.messageId)
      );
      if (!await persistSocketState(socket, persistChannelState())) return;
      io.to(`chan:${data.channelId}`).emit('message:deleted', {
        messageId: target.id,
        channelId: data.channelId,
      });
    }
  });

  socket.on('message:edit', async (data: {
    messageId: string;
    text: string;
    channelId?: string;
    recipientId?: string;
  }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data || typeof data.messageId !== 'string' || typeof data.text !== 'string') return;
    const text = data.text.trim();
    if (!data.messageId || !text) return;

    if (data.recipientId) {
      if (!areFriends(user.userId, data.recipientId)) return;
      const conversationKey = [user.userId, data.recipientId].sort().join(':::');
      const messages = directMessages.get(conversationKey) || [];
      const target = messages.find((message) => message.id === data.messageId);
      if (!target || target.senderId !== user.userId || target.type !== 'text') return;

      target.text = text;
      directMessages.set(conversationKey, messages);
      if (!await persistSocketState(socket, persistDirectMessages())) return;

      const payload = {
        messageId: target.id,
        text,
        recipientId: data.recipientId,
        conversationKey,
      };
      connectedUsers.forEach((connectedUser, socketId) => {
        if (connectedUser.userId === data.recipientId || connectedUser.userId === user.userId) {
          io.to(socketId).emit('message:edited', payload);
        }
      });
    } else if (
      data.channelId &&
      channels.some((channel) => channel.id === data.channelId) &&
      isChannelMember(user.userId, data.channelId)
    ) {
      const messages = channelMessages.get(data.channelId) || [];
      const target = messages.find((message) => message.id === data.messageId);
      if (!target || target.senderId !== user.userId || target.type !== 'text') return;

      target.text = text;
      if (!await persistSocketState(socket, persistChannelState())) return;
      io.to(`chan:${data.channelId}`).emit('message:edited', {
        messageId: target.id,
        text,
        channelId: data.channelId,
      });
    }
  });

  // 7. Mark messages as read / Notify sender with read receipt ticks
  socket.on('message:read', async (data: { messageIds: string[]; channelId?: string; recipientId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.messageIds || data.messageIds.length === 0) return;

    const readTimestamp = Date.now();
    const updatedIds: string[] = [];

    if (data.recipientId) {
      // Direct Message read receipt
      const convKey = [user.userId, data.recipientId].sort().join(':::');
      if (!areFriends(user.userId, data.recipientId)) return;
      const list = directMessages.get(convKey) || [];
      list.forEach((msg) => {
        if (data.messageIds.includes(msg.id)) {
          if (!msg.readBy) msg.readBy = {};
          msg.readBy[user.userId] = readTimestamp;
          if (msg.senderId !== user.userId) {
            msg.status = 'read';
            updatedIds.push(msg.id);
          }
        }
      });
      directMessages.set(convKey, list);
      if (!await persistSocketState(socket, persistDirectMessages())) return;

      if (updatedIds.length > 0) {
        // Emit to both recipient (reader) and sender
        connectedUsers.forEach((u, sockId) => {
          if (u.userId === data.recipientId || u.userId === user.userId) {
            io.to(sockId).emit('message:read', {
              messageIds: updatedIds,
              readerId: user.userId,
              readerName: user.username,
              recipientId: data.recipientId,
              conversationKey: convKey,
              channelId: '',
              timestamp: readTimestamp,
            });
          }
        });
      }
    } else if (data.channelId) {
      if (!isChannelMember(user.userId, data.channelId)) return;
      // Channel message read receipt
      const list = channelMessages.get(data.channelId) || [];
      list.forEach((msg) => {
        if (data.messageIds.includes(msg.id)) {
          if (!msg.readBy) msg.readBy = {};
          msg.readBy[user.userId] = readTimestamp;
          if (msg.senderId !== user.userId) {
            msg.status = 'read';
            updatedIds.push(msg.id);
          }
        }
      });
      if (!await persistSocketState(socket, persistChannelState())) return;

      if (updatedIds.length > 0) {
        io.to(`chan:${data.channelId}`).emit('message:read', {
          messageIds: updatedIds,
          readerId: user.userId,
          readerName: user.username,
          channelId: data.channelId,
          timestamp: readTimestamp,
        });
      }
    }
  });

  // 7. Typing Indicator
  socket.on('typing:start', (data: { channelId?: string; recipientId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (data.recipientId) {
      if (!areFriends(user.userId, data.recipientId)) return;
      connectedUsers.forEach((u, sockId) => {
        if (u.userId === data.recipientId) {
          io.to(sockId).emit('typing:status', {
            userId: user.userId,
            username: user.username,
            recipientId: data.recipientId,
            isTyping: true,
          });
        }
      });
    } else if (data.channelId) {
      if (!isChannelMember(user.userId, data.channelId)) return;
      socket.broadcast.to(`chan:${data.channelId}`).emit('typing:status', {
        userId: user.userId,
        username: user.username,
        channelId: data.channelId,
        isTyping: true,
      });
    }
  });

  socket.on('typing:stop', (data: { channelId?: string; recipientId?: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (data.recipientId) {
      if (!areFriends(user.userId, data.recipientId)) return;
      connectedUsers.forEach((u, sockId) => {
        if (u.userId === data.recipientId) {
          io.to(sockId).emit('typing:status', {
            userId: user.userId,
            username: user.username,
            recipientId: data.recipientId,
            isTyping: false,
          });
        }
      });
    } else if (data.channelId) {
      if (!isChannelMember(user.userId, data.channelId)) return;
      socket.broadcast.to(`chan:${data.channelId}`).emit('typing:status', {
        userId: user.userId,
        username: user.username,
        channelId: data.channelId,
        isTyping: false,
      });
    }
  });

  socket.on('call:offer', (data: { recipientId: string; callId: string; offer: RTCSessionDescriptionInit }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.callId || !areFriends(user.userId, data.recipientId)) return;

    const recipient = Array.from(connectedUsers.values()).find((peer) => peer.userId === data.recipientId);
    if (!recipient) {
      socket.emit('call:unavailable', { callId: data.callId });
      return;
    }

    connectedUsers.forEach((peer, socketId) => {
      if (peer.userId === data.recipientId) {
        io.to(socketId).emit('call:incoming', {
          callId: data.callId,
          callerId: user.userId,
          callerName: user.username,
          offer: data.offer,
        });
      }
    });
  });

  socket.on('call:answer', (data: { recipientId: string; callId: string; answer: RTCSessionDescriptionInit }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.callId || !areFriends(user.userId, data.recipientId)) return;
    connectedUsers.forEach((peer, socketId) => {
      if (peer.userId === data.recipientId) {
        io.to(socketId).emit('call:answered', {
          callId: data.callId,
          callerId: user.userId,
          answer: data.answer,
        });
      }
    });
  });

  socket.on('call:ice', (data: { recipientId: string; callId: string; candidate: RTCIceCandidateInit }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.callId || !areFriends(user.userId, data.recipientId)) return;
    connectedUsers.forEach((peer, socketId) => {
      if (peer.userId === data.recipientId) {
        io.to(socketId).emit('call:ice', {
          callId: data.callId,
          senderId: user.userId,
          candidate: data.candidate,
        });
      }
    });
  });

  socket.on('call:reject', (data: { recipientId: string; callId: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.callId || !areFriends(user.userId, data.recipientId)) return;
    connectedUsers.forEach((peer, socketId) => {
      if (peer.userId === data.recipientId) {
        io.to(socketId).emit('call:rejected', { callId: data.callId, senderId: user.userId });
      }
    });
  });

  socket.on('call:end', (data: { recipientId: string; callId: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data.callId || !areFriends(user.userId, data.recipientId)) return;
    connectedUsers.forEach((peer, socketId) => {
      if (peer.userId === data.recipientId) {
        io.to(socketId).emit('call:ended', { callId: data.callId, senderId: user.userId });
      }
    });
  });

  // 8. Collaborative Whiteboard Drawing Events (Channel or DM roomId)
  socket.on('whiteboard:stroke', (data: { channelId: string; stroke: any }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data?.channelId) return;
    if (data.channelId.includes(':::')) {
      // Direct whiteboard between two peers
      const [u1, u2] = data.channelId.split(':::');
      if (!u1 || !u2 || (user.userId !== u1 && user.userId !== u2) || !areFriends(u1, u2)) return;
      connectedUsers.forEach((u, sockId) => {
        if ((u.userId === u1 || u.userId === u2) && sockId !== socket.id) {
          io.to(sockId).emit('whiteboard:stroke', data);
        }
      });
    } else if (isChannelMember(user.userId, data.channelId)) {
      socket.broadcast.to(`chan:${data.channelId}`).emit('whiteboard:stroke', data);
    }
  });

  socket.on('whiteboard:clear', (data: { channelId: string }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !data?.channelId) return;
    if (data.channelId.includes(':::')) {
      const [u1, u2] = data.channelId.split(':::');
      if (!u1 || !u2 || (user.userId !== u1 && user.userId !== u2) || !areFriends(u1, u2)) return;
      connectedUsers.forEach((u, sockId) => {
        if (u.userId === u1 || u.userId === u2) {
          io.to(sockId).emit('whiteboard:clear', data);
        }
      });
    } else if (isChannelMember(user.userId, data.channelId)) {
      io.to(`chan:${data.channelId}`).emit('whiteboard:clear', data);
    }
  });

  // 9. Latency / Ping
  socket.on('heartbeat:ping', (timestamp: number) => {
    socket.emit('heartbeat:pong', { clientTimestamp: timestamp, serverTimestamp: Date.now() });
  });

  // 10. Disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      io.emit('user:left', { socketId: socket.id, userId: user.userId, username: user.username });
    }
  });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Request failed:', error);
    if (res.headersSent) return next(error);
    res.status(500).json({ success: false, error: 'internalServerError' });
  });

  server.listen(PORT, '0.0.0.0', () => {
    const lanIps = getLanIpAddresses();
    console.log(`=======================================================`);
    console.log(`🚀 Bright Mind LAN Offline Server running!`);
    const protocol = isHttps ? 'https' : 'http';
    console.log(`📡 Local Host:       ${protocol}://localhost:${PORT}`);
    if (lanIps.length > 0) {
      console.log(`📶 Local Wi-Fi IPs:`);
      lanIps.forEach((ip) => {
        console.log(`   👉 ${protocol}://${ip}:${PORT}`);
      });
      if (!isHttps) {
        console.log(`⚠️  Camera/microphone calls on LAN require HTTPS (set HTTPS_CERT_FILE and HTTPS_KEY_FILE).`);
      }
    } else {
      console.log(`⚠️  No external Wi-Fi IP detected yet (offline hotspot)`);
    }
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
