import { randomUUID } from "node:crypto";

export function canAccessRoom(database, userId, room, publicRooms) {
  if (room === "lobby") return true;
  if (publicRooms.has(room)) return true;
  if (room.startsWith("dm:")) {
    const members = room.slice(3).split(":");
    if (members.length !== 2 || !members.includes(userId)) return false;
    const [userLow, userHigh] = members.sort();
    return Boolean(
      database
        .prepare(
          "SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ? AND status = 'accepted'",
        )
        .get(userLow, userHigh),
    );
  }
  if (room.startsWith("group:")) {
    return Boolean(
      database
        .prepare(
          "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
        )
        .get(room.slice(6), userId),
    );
  }
  return false;
}

export function attachSocialFeatures(
  io,
  database,
  { publicRooms, listMessages, saveMessage, cleanName },
) {
  function canAccessUserRoom(userId, room) {
    return canAccessRoom(database, userId, room, publicRooms);
  }
  database.exec(`
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

  const profileById = database.prepare(
    "SELECT user_id AS userId, name, avatar FROM profiles WHERE user_id = ?",
  );
  const profileUpsert = database.prepare(`
    INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET name = excluded.name,
      avatar = COALESCE(excluded.avatar, profiles.avatar), updated_at = excluded.updated_at
  `);
  const friendshipByPair = database.prepare(
    "SELECT * FROM friendships WHERE user_low = ? AND user_high = ?",
  );
  const gameSessions = new Map();
  const callSessions = new Map();

  function getProfile(userId) {
    return profileById.get(userId) || null;
  }

  function getFriendIds(userId) {
    return database
      .prepare(
        `SELECT CASE WHEN user_low = ? THEN user_high ELSE user_low END AS userId
         FROM friendships WHERE (user_low = ? OR user_high = ?) AND status = 'accepted'`,
      )
      .all(userId, userId, userId)
      .map((row) => row.userId);
  }

  function socialSnapshot(userId) {
    const friends = database
      .prepare(
        `SELECT profiles.user_id AS userId, profiles.name, profiles.avatar
         FROM friendships JOIN profiles ON profiles.user_id =
           CASE WHEN friendships.user_low = ? THEN friendships.user_high ELSE friendships.user_low END
         WHERE (friendships.user_low = ? OR friendships.user_high = ?) AND friendships.status = 'accepted'
         ORDER BY profiles.name COLLATE NOCASE`,
      )
      .all(userId, userId, userId);
    const requests = database
      .prepare(
        `SELECT profiles.user_id AS userId, profiles.name, profiles.avatar, friendships.requested_by AS requestedBy
         FROM friendships JOIN profiles ON profiles.user_id =
           CASE WHEN friendships.user_low = ? THEN friendships.user_high ELSE friendships.user_low END
         WHERE (friendships.user_low = ? OR friendships.user_high = ?) AND friendships.status = 'pending'`,
      )
      .all(userId, userId, userId);
    const groups = database
      .prepare(
        `SELECT chat_groups.id, chat_groups.name FROM group_members
         JOIN chat_groups ON chat_groups.id = group_members.group_id
         WHERE group_members.user_id = ? ORDER BY chat_groups.created_at DESC`,
      )
      .all(userId);
    return {
      friends,
      incoming: requests.filter((request) => request.requestedBy !== userId),
      outgoing: requests.filter((request) => request.requestedBy === userId),
      groups,
    };
  }

  function refreshUsers(userIds) {
    for (const userId of new Set(userIds)) {
      io.to(`user:${userId}`).emit("social:data", socialSnapshot(userId));
    }
  }

  function pairFor(firstId, secondId) {
    return [firstId, secondId].sort();
  }

  function isFriend(firstId, secondId) {
    if (!firstId || !secondId || firstId === secondId) return false;
    const [userLow, userHigh] = pairFor(firstId, secondId);
    return friendshipByPair.get(userLow, userHigh)?.status === "accepted";
  }

  io.use((socket, next) => {
    const userId = String(socket.handshake.auth?.userId || "");
    const name = cleanName(socket.handshake.auth?.name);
    const room = String(socket.handshake.auth?.room || "");
    const avatar = socket.handshake.auth?.avatar || null;
    if (!/^[\da-f-]{36}$/i.test(userId) || !name) {
      return next(new Error("សូមកំណត់ឈ្មោះ និងបង្កើត profile របស់អ្នក។"));
    }
    if (!canAccessRoom(database, userId, room, publicRooms)) {
      return next(new Error("អ្នកមិនអាចចូលបន្ទប់នេះបានទេ។"));
    }
    profileUpsert.run(userId, name, avatar, new Date().toISOString());
    socket.data.userId = userId;
    socket.data.name = name;
    socket.data.avatar = avatar || getProfile(userId)?.avatar || "";
    socket.data.room = room;
    return next();
  });

  async function broadcastPresence(room) {
    const clients = await io.in(room).fetchSockets();
    const usersById = new Map();
    for (const client of clients) {
      usersById.set(client.data.userId, {
        userId: client.data.userId,
        name: client.data.name,
        avatar: client.data.avatar,
      });
    }
    io.to(room).emit("presence:update", { room, users: [...usersById.values()] });
  }

  io.on("connection", (socket) => {
    const { room, userId, name } = socket.data;
    socket.join(`user:${userId}`);
    socket.emit("profile:ready", getProfile(userId));
    socket.emit("social:data", socialSnapshot(userId));
    if (room !== "lobby") {
      socket.join(room);
      socket.emit("history", { room, messages: listMessages.all(room).reverse() });
      broadcastPresence(room);
    }

    socket.on("profile:update", (payload, acknowledge) => {
      const nextName = cleanName(payload?.name);
      const nextAvatar = String(payload?.avatar || "");
      if (!nextName) return acknowledge?.({ ok: false, error: "សូមដាក់ឈ្មោះ។" });
      if (nextAvatar.length > 350_000 || (nextAvatar && !/^data:image\/(png|jpeg|webp);base64,/i.test(nextAvatar))) {
        return acknowledge?.({ ok: false, error: "រូបត្រូវជា PNG, JPG ឬ WebP និងតិចជាង 250 KB។" });
      }
      profileUpsert.run(userId, nextName, nextAvatar, new Date().toISOString());
      socket.data.name = nextName;
      socket.data.avatar = nextAvatar;
      socket.emit("profile:ready", getProfile(userId));
      if (room !== "lobby") {
        socket.to(room).emit("message:profile-updated", { userId, name: nextName, avatar: nextAvatar });
        broadcastPresence(room);
      }
      refreshUsers(getFriendIds(userId));
      return acknowledge?.({ ok: true, profile: getProfile(userId) });
    });

    socket.on("users:search", (payload, acknowledge) => {
      const query = String(payload?.query || "").replace(/[%_]/g, "").trim();
      if (query.length < 2) return acknowledge?.({ ok: true, users: [] });
      const users = database
        .prepare(
          `SELECT user_id AS userId, name, avatar FROM profiles
           WHERE user_id != ? AND name LIKE ? COLLATE NOCASE
           AND NOT EXISTS (
             SELECT 1 FROM friendships WHERE user_low = min(profiles.user_id, ?)
               AND user_high = max(profiles.user_id, ?)
           ) ORDER BY name COLLATE NOCASE LIMIT 12`,
        )
        .all(userId, `%${query}%`, userId, userId);
      return acknowledge?.({ ok: true, users });
    });

    socket.on("friend:request", (payload, acknowledge) => {
      const targetId = String(payload?.userId || "");
      if (!getProfile(targetId) || targetId === userId) {
        return acknowledge?.({ ok: false, error: "រកមិនឃើញអ្នកប្រើនេះទេ។" });
      }
      const [userLow, userHigh] = pairFor(userId, targetId);
      const existing = friendshipByPair.get(userLow, userHigh);
      if (existing) return acknowledge?.({ ok: false, error: "មាន friend request ឬជាមិត្តរួចហើយ។" });
      database
        .prepare("INSERT INTO friendships VALUES (?, ?, ?, 'pending', ?)")
        .run(userLow, userHigh, userId, new Date().toISOString());
      refreshUsers([userId, targetId]);
      return acknowledge?.({ ok: true });
    });

    socket.on("friend:respond", (payload, acknowledge) => {
      const targetId = String(payload?.userId || "");
      const [userLow, userHigh] = pairFor(userId, targetId);
      const existing = friendshipByPair.get(userLow, userHigh);
      if (!existing || existing.status !== "pending" || existing.requested_by === userId) {
        return acknowledge?.({ ok: false, error: "សំណើនេះមិនអាចកែប្រែបានទេ។" });
      }
      if (payload?.accept) {
        database
          .prepare("UPDATE friendships SET status = 'accepted' WHERE user_low = ? AND user_high = ?")
          .run(userLow, userHigh);
      } else {
        database
          .prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?")
          .run(userLow, userHigh);
      }
      refreshUsers([userId, targetId]);
      return acknowledge?.({ ok: true });
    });

    socket.on("friend:remove", (payload, acknowledge) => {
      const targetId = String(payload?.userId || "");
      if (!isFriend(userId, targetId)) return acknowledge?.({ ok: false, error: "អ្នកទាំងពីរមិនមែនជាមិត្តទេ។" });
      const [userLow, userHigh] = pairFor(userId, targetId);
      database.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").run(userLow, userHigh);
      refreshUsers([userId, targetId]);
      return acknowledge?.({ ok: true });
    });

    socket.on("group:create", (payload, acknowledge) => {
      const groupName = cleanName(payload?.name).slice(0, 40);
      const requestedMembers = [...new Set((payload?.members || []).map(String))].filter((id) => id !== userId);
      if (!groupName || requestedMembers.length < 1 || requestedMembers.length > 19 || requestedMembers.some((id) => !isFriend(userId, id))) {
        return acknowledge?.({ ok: false, error: "ដាក់ឈ្មោះក្រុម និងជ្រើសមិត្តភក្តិពី 1 ដល់ 19 នាក់។" });
      }
      const groupId = randomUUID();
      const createdAt = new Date().toISOString();
      const createGroup = database.prepare("INSERT INTO chat_groups VALUES (?, ?, ?, ?)");
      const addMember = database.prepare("INSERT INTO group_members VALUES (?, ?)");
      database.exec("BEGIN");
      try {
        createGroup.run(groupId, groupName, userId, createdAt);
        for (const memberId of [userId, ...requestedMembers]) addMember.run(groupId, memberId);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      refreshUsers([userId, ...requestedMembers]);
      return acknowledge?.({ ok: true, group: { id: groupId, name: groupName } });
    });

    socket.on("message:send", (payload, acknowledge) => {
      const text = String(payload?.text || "").trim();
      if (!text) return acknowledge?.({ ok: false, error: "សារមិនអាចទទេបានទេ។" });
      if (text.length > 2000) return acknowledge?.({ ok: false, error: "សារវែងពេក។ អតិបរមា 2,000 តួអក្សរ។" });
      const message = saveMessage({
        room,
        sender: name,
        senderId: userId,
        senderAvatar: socket.data.avatar,
        text,
      });
      io.to(room).emit("message:new", message);
      return acknowledge?.({ ok: true, id: message.id });
    });

    socket.on("game:invite", (payload, acknowledge) => {
      const targetId = String(payload?.userId || "");
      const target = getProfile(targetId);
      if (!target || !isFriend(userId, targetId)) return acknowledge?.({ ok: false, error: "អាចអញ្ជើញតែមិត្តភក្តិបានទេ។" });
      const game = {
        id: randomUUID(),
        board: Array(9).fill(null),
        players: [
          { userId, name, avatar: socket.data.avatar, mark: "X" },
          { userId: targetId, name: target.name, avatar: target.avatar, mark: "O" },
        ],
        turn: "X",
        status: "pending",
        winner: null,
      };
      gameSessions.set(game.id, game);
      io.to(`user:${targetId}`).emit("game:incoming", game);
      return acknowledge?.({ ok: true, game });
    });

    socket.on("game:respond", (payload, acknowledge) => {
      const game = gameSessions.get(String(payload?.gameId || ""));
      if (!game || game.players[1].userId !== userId || game.status !== "pending") {
        return acknowledge?.({ ok: false, error: "ការអញ្ជើញហ្គេមនេះមិនត្រឹមត្រូវទេ។" });
      }
      if (!payload?.accept) {
        gameSessions.delete(game.id);
        io.to(`user:${game.players[0].userId}`).emit("game:closed", { gameId: game.id });
        return acknowledge?.({ ok: true });
      }
      game.status = "playing";
      for (const player of game.players) io.to(`user:${player.userId}`).emit("game:state", game);
      return acknowledge?.({ ok: true });
    });

    socket.on("game:move", (payload, acknowledge) => {
      const game = gameSessions.get(String(payload?.gameId || ""));
      const cell = Number(payload?.cell);
      const player = game?.players.find((entry) => entry.userId === userId);
      if (!game || !player || game.status !== "playing" || player.mark !== game.turn || !Number.isInteger(cell) || cell < 0 || cell > 8 || game.board[cell]) {
        return acknowledge?.({ ok: false, error: "មិនអាចដាក់សញ្ញានៅទីតាំងនេះបានទេ។" });
      }
      game.board[cell] = player.mark;
      const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const hasWon = wins.some((line) => line.every((index) => game.board[index] === player.mark));
      if (hasWon) {
        game.status = "finished";
        game.winner = player.userId;
      } else if (game.board.every(Boolean)) {
        game.status = "finished";
        game.winner = "draw";
      } else {
        game.turn = game.turn === "X" ? "O" : "X";
      }
      for (const participant of game.players) io.to(`user:${participant.userId}`).emit("game:state", game);
      return acknowledge?.({ ok: true });
    });

    socket.on("call:invite", (payload, acknowledge) => {
      const targetId = String(payload?.userId || "");
      const target = getProfile(targetId);
      if (!target || !isFriend(userId, targetId)) return acknowledge?.({ ok: false, error: "អាចហៅតែមិត្តភក្តិបានទេ។" });
      const call = { id: randomUUID(), callerId: userId, targetId, video: Boolean(payload?.video), status: "ringing" };
      callSessions.set(call.id, call);
      io.to(`user:${targetId}`).emit("call:incoming", { ...call, peer: getProfile(userId) });
      return acknowledge?.({ ok: true, callId: call.id, peer: target });
    });

    socket.on("call:respond", (payload, acknowledge) => {
      const call = callSessions.get(String(payload?.callId || ""));
      if (!call || call.targetId !== userId || call.status !== "ringing") return acknowledge?.({ ok: false, error: "ការហៅនេះមិនទាន់មានទេ។" });
      if (!payload?.accept) {
        callSessions.delete(call.id);
        io.to(`user:${call.callerId}`).emit("call:ended", { callId: call.id, reason: "declined" });
        return acknowledge?.({ ok: true });
      }
      call.status = "active";
      io.to(`user:${call.callerId}`).emit("call:accepted", { callId: call.id, peer: getProfile(userId) });
      return acknowledge?.({ ok: true, peer: getProfile(call.callerId) });
    });

    socket.on("call:signal", (payload) => {
      const call = callSessions.get(String(payload?.callId || ""));
      const targetId = String(payload?.userId || "");
      if (!call || call.status !== "active" || ![call.callerId, call.targetId].includes(userId) || ![call.callerId, call.targetId].includes(targetId)) return;
      io.to(`user:${targetId}`).emit("call:signal", { callId: call.id, userId, signal: payload.signal });
    });

    socket.on("call:end", (payload) => {
      const call = callSessions.get(String(payload?.callId || ""));
      if (!call || ![call.callerId, call.targetId].includes(userId)) return;
      callSessions.delete(call.id);
      for (const participant of [call.callerId, call.targetId]) io.to(`user:${participant}`).emit("call:ended", { callId: call.id });
    });

    socket.on("disconnect", () => broadcastPresence(room));
  });

  return { canAccessRoom: canAccessUserRoom, getProfile };
}