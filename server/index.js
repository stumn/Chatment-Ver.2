require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, User, SystemLog, UserActionLog } = require('./db');
const { getSnapshot, applyUpdate } = require('./snapshot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for large snapshots
});

app.use(cors());
app.use(express.json());

// Helper to save system log
async function saveSystemLog(level, event, details = {}) {
  try {
    const log = new SystemLog({ level, event, details });
    await log.save();
  } catch (err) {
    console.error('[DB] Failed to save system log:', err.message);
  }
}

// Helper to save user action log
async function saveUserActionLog(docId, type, author, targetId, contentPreview, actionDetails) {
  try {
    const log = new UserActionLog({
      docId,
      type,
      author,
      targetId,
      contentPreview,
      actionDetails
    });
    await log.save();
  } catch (err) {
    console.error('[DB] Failed to save user action log:', err.message);
  }
}

// ─── REST API ───────────────────────────────────────────

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

// 静的ファイルの配信 (ビルドされたフロントエンド)
const path = require('path');
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ─── Socket.IO ──────────────────────────────────────────

let ratioMemory = []; // array of { id, ratio, docId }

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  saveSystemLog('info', 'client-connected', { socketId: socket.id });

  socket.on('login', async ({ userName, colorIndex }) => {
    try {
      let user = await User.findOne({ userName });
      let isNew = false;
      if (user) {
        socket.colorIndex = user.colorIndex;
      } else {
        isNew = true;
        let assignedColorIndex = colorIndex;
        if (assignedColorIndex === undefined || assignedColorIndex === null || assignedColorIndex < 0) {
          const allUsers = await User.find({});
          const maxIndex = allUsers.reduce((max, u) => u.colorIndex > max ? u.colorIndex : max, -1);
          assignedColorIndex = maxIndex + 1;
        }
        user = new User({ userName, colorIndex: assignedColorIndex });
        await user.save();
        socket.colorIndex = assignedColorIndex;
      }
      socket.userName = userName;
      socket.emit('login-ack', { userName, colorIndex: socket.colorIndex });

      // Save system log for login (new or existing user)
      await saveSystemLog('info', isNew ? 'login-new' : 'login-existing', { socketId: socket.id, userName });
    } catch (err) {
      console.error('[WS] Login error:', err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, message: `Login error: ${err.message}` });
    }
  });

  socket.on('join-doc', async (docId) => {
    socket.join(docId);
    socket.docId = docId;
    console.log(`[WS] ${socket.id} joined doc "${docId}"`);
    await saveSystemLog('info', 'join-doc', { socketId: socket.id, userName: socket.userName, docId });

    try {
      const snapshot = await getSnapshot(docId);
      socket.emit('sync-snapshot', snapshot);
    } catch (err) {
      console.error(`[WS] Error sending snapshot for "${docId}":`, err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, docId, message: `Error sending snapshot: ${err.message}` });
    }

    const count = io.sockets.adapter.rooms.get(docId)?.size || 0;
    io.in(docId).emit('user-count', count);

    const roomRatios = ratioMemory.filter(item => item.docId === docId);
    socket.emit('ratioChange', roomRatios);
  });

  socket.on('send-update', async ({ docId, update }) => {
    try {
      await applyUpdate(docId, update);
      socket.to(docId).emit('receive-update', update);
    } catch (err) {
      console.error(`[WS] Error applying update for "${docId}":`, err.message);
      await saveSystemLog('error', 'error', { socketId: socket.id, docId, message: `Error applying update: ${err.message}` });
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

    // Save split view ratio change to UserActionLog
    await saveUserActionLog(
      socket.docId,
      'ratio-change',
      socket.userName || 'unknown',
      '',
      String(ratio),
      `スプリット比率を ${Math.round(ratio * 100)}% に変更しました`
    );
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
    saveSystemLog('info', 'disconnect', { socketId: socket.id, userName: socket.userName, docId: socket.docId });
    ratioMemory = ratioMemory.filter(item => item.id !== socket.id);
    if (socket.docId) {
      const count = io.sockets.adapter.rooms.get(socket.docId)?.size || 0;
      io.in(socket.docId).emit('user-count', count);

      // Broadcast updated ratios to room
      const roomRatios = ratioMemory.filter(item => item.docId === socket.docId);
      io.in(socket.docId).emit('ratioChange', roomRatios);
    }
  });
});

// ─── Start ──────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

async function start() {
  await connectDB();
  await saveSystemLog('info', 'db-connect');
  server.listen(PORT, () => {
    console.log(`[Server] Chatment server running on port ${PORT}`);
  });
}

start();
