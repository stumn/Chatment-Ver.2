require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB } = require('./db');
const { getSnapshot, applyUpdate } = require('./snapshot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for large snapshots
});

app.use(cors());
app.use(express.json());

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

app.get('/', (_req, res) => {
  res.send('<h1>Chatment ver.2 API Server is running</h1><p>Please visit the frontend at <a href="http://localhost:5173">http://localhost:5173</a></p>');
});

// ─── Socket.IO ──────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on('join-doc', async (docId) => {
    socket.join(docId);
    console.log(`[WS] ${socket.id} joined doc "${docId}"`);

    try {
      const snapshot = await getSnapshot(docId);
      socket.emit('sync-snapshot', snapshot);
    } catch (err) {
      console.error(`[WS] Error sending snapshot for "${docId}":`, err.message);
    }
  });

  socket.on('send-update', async ({ docId, update }) => {
    try {
      await applyUpdate(docId, update);
      // Broadcast binary update to all other clients in the room
      socket.to(docId).emit('receive-update', update);
    } catch (err) {
      console.error(`[WS] Error applying update for "${docId}":`, err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── Start ──────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[Server] Chatment ver.2 server running on port ${PORT}`);
  });
}

start();
