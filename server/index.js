require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, User, Room, SystemLog, UserActionLog, DocumentSnapshot } = require('./db');
const { getSnapshot, applyUpdate, getOrCreateDoc } = require('./snapshot-manager');

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

// Cosense用プレーンテキストエクスポート
app.get('/api/rooms/:roomId/export/cosense-text', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findOne({ docId: roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const spaceName = room.title || room.docId;

    const doc = await getOrCreateDoc(roomId);
    const stream = doc.getMovableList('stream');
    const length = stream.length;

    const lines = [];
    lines.push(`[[${spaceName}]]`);

    for (let i = 0; i < length; i++) {
      const loroMap = stream.get(i);
      if (!loroMap) continue;

      const contentVal = loroMap.get('content');
      let contentStr = '';
      if (contentVal && typeof contentVal === 'object' && typeof contentVal.toString === 'function') {
        contentStr = contentVal.toString();
      } else {
        contentStr = contentVal || '';
      }

      const realName = loroMap.get('authorRealName') || '';
      const indent = loroMap.get('indent') || 0;

      let processedText = contentStr;
      const isHeading = processedText.trim().startsWith('#');

      if (isHeading) {
        const headingText = processedText.trim().replace(/^#\s*/, '');
        processedText = `[[${headingText}]]`;
      }

      // 見出し以外で本名が存在する場合にのみ文末に付与
      if (!isHeading && realName) {
        processedText = `${processedText}（${realName}）`;
      }

      // インデントの適用（半角スペース）
      if (indent === 0) {
        processedText = ` ${processedText}`;
      } else if (indent >= 1) {
        processedText = `  ${processedText}`;
      }

      lines.push(processedText);
    }

    // 末尾フッター（コピー日時）
    const now = new Date();
    const formattedDate = now.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Tokyo'
    });
    lines.push(`[# Copy from Chatment: ${formattedDate}]`);

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[API] GET export cosense text error:', err.message);
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
