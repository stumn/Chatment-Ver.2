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

const { registerSocketHandlers } = require('./socket-handlers');
registerSocketHandlers(io, { saveSystemLog, saveUserActionLog });

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
