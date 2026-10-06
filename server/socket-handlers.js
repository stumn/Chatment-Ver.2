const { User, Room } = require('./db');
const { getSnapshot, applyUpdate } = require('./snapshot-manager');

// ─── 仕切り位置の集計・配信設定 ───
const NUM_BANDS = 16;
const EMIT_INTERVAL_MS = 500;
const DISCONNECT_GRACE_PERIOD_MS = 10000;

// socketId -> { ratio: number, docId: string, disconnectTimer?: NodeJS.Timeout }
const ratioMemory = new Map();
// docId -> { timer: NodeJS.Timeout | null, lastEmitted: string | null }
const roomThrottleMap = new Map();

function getBandCounts(docId) {
  const bands = new Array(NUM_BANDS).fill(0);
  for (const item of ratioMemory.values()) {
    if (item.docId === docId && typeof item.ratio === 'number') {
      const clamped = Math.max(0, Math.min(1, item.ratio));
      const bandIndex = Math.min(NUM_BANDS - 1, Math.floor(clamped * NUM_BANDS));
      bands[bandIndex]++;
    }
  }
  return bands;
}

function scheduleEmitRatioBands(io, docId) {
  if (!docId) return;
  let throttle = roomThrottleMap.get(docId);
  if (!throttle) {
    throttle = { timer: null, lastEmitted: null };
    roomThrottleMap.set(docId, throttle);
  }

  const broadcastIfChanged = () => {
    const currentBands = getBandCounts(docId);
    const serialized = JSON.stringify(currentBands);
    if (throttle.lastEmitted !== serialized) {
      throttle.lastEmitted = serialized;
      io.in(docId).emit('ratioBands', currentBands);
    }
  };

  if (!throttle.timer) {
    broadcastIfChanged();
    throttle.timer = setTimeout(() => {
      throttle.timer = null;
      broadcastIfChanged();
    }, EMIT_INTERVAL_MS);
  }
}

function registerSocketHandlers(io, helpers) {
  const { saveSystemLog, saveUserActionLog } = helpers;

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    saveSystemLog('info', 'client-connected', { socketId: socket.id });

    socket.on('login', async ({ userName, colorIndex, attribute = '', ageGroup = '' }) => {
      try {
        let assignedColorIndex = colorIndex;
        const existingForColor = await User.findOne({ userName }).select('colorIndex');
        const isNew = !existingForColor;
        if (existingForColor) {
          assignedColorIndex = existingForColor.colorIndex;
        } else if (assignedColorIndex === undefined || assignedColorIndex === null || assignedColorIndex < 0) {
          const allUsers = await User.find({}).select('colorIndex');
          const maxIndex = allUsers.reduce((max, u) => u.colorIndex > max ? u.colorIndex : max, -1);
          assignedColorIndex = maxIndex + 1;
        }
        socket.colorIndex = assignedColorIndex;

        const roomEntry = (socket.docId && socket.roomId)
          ? [{ roomId: socket.roomId, docId: socket.docId }]
          : [];

        const result = await User.findOneAndUpdate(
          { userName },
          {
            $set: {
              ...(attribute ? { attribute } : {}),
              ...(ageGroup  ? { ageGroup  } : {}),
            },
            $setOnInsert: {
              colorIndex: assignedColorIndex,
            },
            ...(roomEntry.length > 0 ? {
              $addToSet: { rooms: { $each: roomEntry } },
            } : {}),
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

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

      // 初期参加時に帯集計配列を送信
      socket.emit('ratioBands', getBandCounts(docId));
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

    socket.on('ratioChange', (ratio) => {
      if (!socket.docId || typeof ratio !== 'number' || isNaN(ratio)) return;
      const clamped = Math.max(0, Math.min(1, ratio));
      const existing = ratioMemory.get(socket.id);
      if (existing) {
        if (existing.disconnectTimer) {
          clearTimeout(existing.disconnectTimer);
          existing.disconnectTimer = null;
        }
        existing.ratio = clamped;
      } else {
        ratioMemory.set(socket.id, {
          ratio: clamped,
          docId: socket.docId,
          disconnectTimer: null
        });
      }
      scheduleEmitRatioBands(io, socket.docId);
    });

    socket.on('disconnect', async (reason) => {
      console.log(`[WS] Client disconnected: ${socket.id}, reason: ${reason}`);
      await saveSystemLog('info', 'disconnect', { socketId: socket.id, userName: socket.userName, reason }, socket.roomId, socket.docId);

      const entry = ratioMemory.get(socket.id);
      if (entry) {
        // 接続切断後、10秒間の猶予を経て集計から除外
        entry.disconnectTimer = setTimeout(() => {
          ratioMemory.delete(socket.id);
          if (entry.docId) {
            scheduleEmitRatioBands(io, entry.docId);
          }
        }, DISCONNECT_GRACE_PERIOD_MS);
      }

      if (socket.docId) {
        const count = io.sockets.adapter.rooms.get(socket.docId)?.size || 0;
        io.in(socket.docId).emit('user-count', count);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
