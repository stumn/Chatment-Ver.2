require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, User, Room, SystemLog, UserActionLog, DocumentSnapshot } = require('./db');
const { getSnapshot, applyUpdate } = require('./snapshot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

app.use(cors());
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────

async function saveSystemLog(level, event, details = {}, roomId = null, docId = null) {
  try {
    const log = new SystemLog({ level, event, details, roomId, docId });
    await log.save();
  } catch (err) {
    console.error('[DB] Failed to save system log:', err.message);
  }
}

async function saveUserActionLog({ docId, roomId, type, author, userAttribute = '', userAgeGroup = '', targetId, contentPreview, actionDetails, before = null, after = null }) {
  try {
    const log = new UserActionLog({
      docId,
      roomId,
      type,
      author,
      userAttribute,
      userAgeGroup,
      targetId,
      contentPreview,
      actionDetails,
      before,
      after,
    });
    await log.save();
  } catch (err) {
    console.error('[DB] Failed to save user action log:', err.message);
  }
}

// ─── REST API ───────────────────────────────────────────

// ルーム新規作成
app.post('/api/rooms', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const docId = new mongoose.Types.ObjectId().toString();
    const title = req.body?.title || '';
    const room = new Room({ docId, title, status: 'open', userIds: [] });
    await room.save();
    await saveSystemLog('info', 'room-created', { docId, title }, room._id.toString(), docId);
    res.json(room);
  } catch (err) {
    console.error('[API] POST room error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ルーム一覧取得
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.find({}).sort({ updatedAt: -1 });
    res.json(rooms);
  } catch (err) {
    console.error('[API] GET rooms error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ルーム検証
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ docId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (err) {
    console.error('[API] GET room error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ルームステータス更新
app.post('/api/rooms/:roomId/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'closed', 'hidden'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const room = await Room.findOneAndUpdate(
      { docId: req.params.roomId },
      { status },
      { new: true }
    );
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    await saveSystemLog('info', 'room-status-changed', { status }, room._id.toString(), req.params.roomId);
    res.json(room);
  } catch (err) {
    console.error('[API] POST room status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/snapshot/:docId', async (req, res) => {
  try {
    const snapshot = await getSnapshot(req.params.docId);
    res.set('Content-Type', 'application/octet-stream');
    res.send(Buffer.from(snapshot));
  } catch (err) {
    console.error('[API] GET snapshot error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 静的ファイルの配信はAPIルートより後に置く
const path = require('path');
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ─── Socket.IO ──────────────────────────────────────────

let ratioMemory = [];

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  saveSystemLog('info', 'client-connected', { socketId: socket.id });

  socket.on('login', async ({ userName, colorIndex, attribute = '', ageGroup = '' }) => {
    try {
      // ── colorIndex の決定 ──────────────────────────────────────
      // 新規ユーザーかどうかを先に確認して colorIndex を確定させる
      // （findOneAndUpdate の upsert では setOnInsert でしか colorIndex を制御できないため）
      let assignedColorIndex = colorIndex;
      const existingForColor = await User.findOne({ userName }).select('colorIndex');
      if (existingForColor) {
        // 既存ユーザー: DBに保存済みの colorIndex を使う
        assignedColorIndex = existingForColor.colorIndex;
      } else if (assignedColorIndex === undefined || assignedColorIndex === null || assignedColorIndex < 0) {
        // 新規ユーザーで colorIndex 未指定: 最大値+1 を採番
        const allUsers = await User.find({}).select('colorIndex');
        const maxIndex = allUsers.reduce((max, u) => u.colorIndex > max ? u.colorIndex : max, -1);
        assignedColorIndex = maxIndex + 1;
      }
      socket.colorIndex = assignedColorIndex;

      // ── findOneAndUpdate(upsert) で原子的にユーザーを作成・更新 ──
      // Race Condition (E11000 dup key) を防ぐため、
      // findOne + save の2ステップではなく1操作にまとめる
      const roomEntry = (socket.docId && socket.roomId)
        ? [{ roomId: socket.roomId, docId: socket.docId }]
        : [];

      const result = await User.findOneAndUpdate(
        { userName },
        {
          // 既存ユーザーへの更新: attribute/ageGroup のみ上書き
          $set: {
            ...(attribute ? { attribute } : {}),
            ...(ageGroup  ? { ageGroup  } : {}),
          },
          // 新規挿入時のみ適用するフィールド
          $setOnInsert: {
            colorIndex: assignedColorIndex,
          },
          // rooms はすでに存在するエントリを重複追加しない
          ...(roomEntry.length > 0 ? {
            $addToSet: { rooms: { $each: roomEntry } },
          } : {}),
        },
        {
          upsert: true,       // 存在しなければ INSERT
          new: true,          // 更新後のドキュメントを返す
          setDefaultsOnInsert: true,
        }
      );

      const isNew = result.__v === 0 && result.rooms.length <= 1;

      socket.userName = userName;
      socket.userAttribute = attribute;
      socket.userAgeGroup = ageGroup;
      socket.emit('login-ack', { userName, colorIndex: assignedColorIndex });

      await saveSystemLog(
        'info',
        isNew ? 'login-new' : 'login-existing',
        { socketId: socket.id, userName, attribute, ageGroup },
        socket.roomId || null,
        socket.docId || null
      );

      // 既にルームにいる場合、Room.userIds にも追加（重複なし）
      if (socket.docId) {
        await Room.findOneAndUpdate(
          { docId: socket.docId },
          { $addToSet: { userIds: userName } }
        );
      }
    } catch (err) {
      console.error('[WS] Login error:', err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, message: `Login error: ${err.message}` });
    }
  });

  socket.on('join-doc', async (data) => {
    const docId = typeof data === 'string' ? data : data?.docId;
    const isAdmin = typeof data === 'object' ? !!data?.isAdmin : false;

    if (!docId) return;

    try {
      const room = await Room.findOne({ docId });
      if (!room) {
        socket.emit('room-error', '指定されたルームが存在しません。');
        return;
      }
      if (room.status !== 'open' && !isAdmin) {
        socket.emit('room-error', 'このルームは終了しているか、アクセスできません。');
        return;
      }

      socket.join(docId);
      socket.docId = docId;
      socket.roomId = room._id.toString();
      console.log(`[WS] ${socket.id} joined doc "${docId}" (admin: ${isAdmin})`);
      await saveSystemLog(
        'info',
        'join-doc',
        { socketId: socket.id, userName: socket.userName, isAdmin },
        socket.roomId,
        docId
      );

      const snapshot = await getSnapshot(docId);
      socket.emit('sync-snapshot', snapshot);

      // ユーザーがログイン済みなら userIds と rooms に追加
      if (socket.userName) {
        if (!room.userIds.includes(socket.userName)) {
          room.userIds.push(socket.userName);
          await room.save();
        }
        const user = await User.findOne({ userName: socket.userName });
        if (user) {
          const alreadyInRoom = user.rooms.some(r => r.docId === docId);
          if (!alreadyInRoom) {
            user.rooms.push({ roomId: socket.roomId, docId });
            await user.save();
          }
        }
      }
    } catch (err) {
      console.error(`[WS] Error sending snapshot for "${docId}":`, err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, message: `Error sending snapshot: ${err.message}` }, socket.roomId, docId);
    }

    const count = io.sockets.adapter.rooms.get(docId)?.size || 0;
    io.in(docId).emit('user-count', count);

    const roomRatios = ratioMemory.filter(item => item.docId === docId);
    socket.emit('ratioChange', roomRatios);
  });

  socket.on('send-update', async ({ docId, update }) => {
    try {
      await applyUpdate(docId, update, {
        roomId: socket.roomId,
        userAttribute: socket.userAttribute || '',
        userAgeGroup: socket.userAgeGroup || '',
      });
      socket.to(docId).emit('receive-update', update);
    } catch (err) {
      console.error(`[WS] Error applying update for "${docId}":`, err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, message: `Error applying update: ${err.message}` }, socket.roomId, docId);
    }
  });

  // クライアントからの操作ログ（ビフォアアフター付き）を受信して保存
  socket.on('user-action', async (payload) => {
    if (!socket.docId) return;
    try {
      await saveUserActionLog({
        docId: socket.docId,
        roomId: socket.roomId || null,
        type: payload.type || 'unknown',
        author: socket.userName || 'unknown',
        userAttribute: socket.userAttribute || '',
        userAgeGroup: socket.userAgeGroup || '',
        targetId: payload.targetId,
        contentPreview: payload.contentPreview,
        actionDetails: payload.actionDetails,
        before: payload.before ?? null,
        after: payload.after ?? null,
      });
    } catch (err) {
      console.error('[WS] Failed to save user action log:', err.message);
    }
  });

  socket.on('ratioChange', async (ratio) => {
    if (!socket.docId) return;
    const existing = ratioMemory.find(item => item.id === socket.id);
    if (existing) {
      existing.ratio = ratio;
    } else {
      ratioMemory.push({
        id: socket.id,
        ratio,
        docId: socket.docId,
        userName: socket.userName,
        colorIndex: socket.colorIndex
      });
    }
    const roomRatios = ratioMemory.filter(item => item.docId === socket.docId);
    io.in(socket.docId).emit('ratioChange', roomRatios);
  });

  socket.on('disconnect', async (reason) => {
    console.log(`[WS] Client disconnected: ${socket.id}, reason: ${reason}`);
    await saveSystemLog('info', 'disconnect', { socketId: socket.id, userName: socket.userName, reason }, socket.roomId, socket.docId);

    // 切断したユーザーのratio情報をメモリから削除
    ratioMemory = ratioMemory.filter(item => item.id !== socket.id);

    if (socket.docId) {
      // ユーザー数を更新して通知
      const count = io.sockets.adapter.rooms.get(socket.docId)?.size || 0;
      io.in(socket.docId).emit('user-count', count);

      // 残っているratio情報を通知（切断したユーザーは除外済み）
      const roomRatios = ratioMemory.filter(item => item.docId === socket.docId);
      io.in(socket.docId).emit('ratioChange', roomRatios);
    }
  });

});

// ─── Start ──────────────────────────────────────────────

const PORT = process.env.PORT || 3005;

async function migrateLegacyRooms() {
  try {
    const snapshots = await DocumentSnapshot.find({});
    let created = 0;
    for (const snap of snapshots) {
      const exists = await Room.findOne({ docId: snap.docId });
      if (!exists) {
        const room = new Room({ docId: snap.docId, status: 'open', userIds: [] });
        await room.save();
        created++;
        console.log(`[Migration] Created room for legacy docId: ${snap.docId}`);
      }
    }
    if (created > 0) {
      console.log(`[Migration] Done: ${created} rooms created from legacy DocumentSnapshots.`);
    } else {
      console.log('[Migration] No migration needed.');
    }
  } catch (err) {
    console.error('[Migration] Failed:', err.message);
  }
}

async function start() {
  await connectDB();
  await migrateLegacyRooms();
  await saveSystemLog('info', 'server-start');
  server.listen(PORT, () => {
    console.log(`[Server] Chatment server running on port ${PORT}`);
  });
}

start();
