const { User, Room } = require('./db');
const { getSnapshot, applyUpdate } = require('./snapshot-manager');

let ratioMemory = [];

function registerSocketHandlers(io, helpers) {
  const { saveSystemLog, saveUserActionLog } = helpers;

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    saveSystemLog('info', 'client-connected', { socketId: socket.id });

    socket.on('login', async ({ userName, colorIndex, attribute = '', ageGroup = '' }) => {
      try {
        let assignedColorIndex = colorIndex;
        const existingForColor = await User.findOne({ userName }).select('colorIndex');
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

      ratioMemory = ratioMemory.filter(item => item.id !== socket.id);

      if (socket.docId) {
        const count = io.sockets.adapter.rooms.get(socket.docId)?.size || 0;
        io.in(socket.docId).emit('user-count', count);

        const roomRatios = ratioMemory.filter(item => item.docId === socket.docId);
        io.in(socket.docId).emit('ratioChange', roomRatios);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
