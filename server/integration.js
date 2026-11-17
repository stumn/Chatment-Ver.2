const crypto = require('crypto');

const CACHE_TTL_MS = 5 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function getContent(value) {
  if (value && typeof value.toString === 'function') {
    return value.toString();
  }
  return typeof value === 'string' ? value : '';
}

function hasContent(value) {
  return getContent(value).replace(/[\s\u3000]/g, '').length > 0;
}

function toJstIso(timestamp) {
  return new Date(timestamp + 9 * 3600 * 1000).toISOString().slice(0, 19) + '+09:00';
}

function getUserId(node, salt) {
  const realName = typeof node.get('authorRealName') === 'string'
    ? node.get('authorRealName').trim()
    : '';
  const displayName = typeof node.get('author') === 'string'
    ? node.get('author').trim()
    : '';
  const name = realName || displayName;
  if (!name) return '';

  return `u${crypto.createHmac('sha256', salt).update(name).digest('hex').slice(0, 10)}`;
}

function readRoomPosts(doc, room, salt) {
  const stream = doc.getMovableList('stream');
  const posts = [];

  for (let i = 0; i < stream.length; i++) {
    const node = stream.get(i);
    if (!node || typeof node.get !== 'function') continue;

    const type = node.get('type');
    const timestamp = node.get('timestamp');
    const blockId = node.get('blockId');
    if ((type !== 'chat' && type !== 'doc')
      || !hasContent(node.get('content'))
      || typeof blockId !== 'string'
      || !blockId
      || typeof timestamp !== 'number'
      || !Number.isFinite(timestamp)) {
      continue;
    }

    const user = getUserId(node, salt);
    if (!user) continue;

    posts.push({
      id: blockId,
      time: toJstIso(timestamp),
      user,
      room,
      timestamp,
    });
  }

  return posts
    .sort((a, b) => b.timestamp - a.timestamp);
}

function getLimit(rawLimit) {
  if (rawLimit === undefined) return DEFAULT_LIMIT;
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, limit));
}

function isAuthorized(req, expectedToken) {
  const authorization = req.get('authorization');
  const bearerToken = authorization && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const providedToken = bearerToken || req.query.token || '';
  const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
  const providedHash = crypto.createHash('sha256').update(String(providedToken)).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function registerIntegrationRoutes(app, { Room, getOrCreateDoc }) {
  const roomPostsCache = new Map();
  let openRoomsCache = null;

  app.get('/api/integration/posts', async (req, res) => {
    const token = process.env.INTEGRATION_TOKEN;
    const salt = process.env.INTEGRATION_USER_SALT;
    if (!token || !salt) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!isAuthorized(req, token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedSince = req.query.since;
    let since;
    if (requestedSince !== undefined) {
      since = Date.parse(String(requestedSince));
      if (Number.isNaN(since)) {
        return res.status(400).json({ error: 'Invalid since' });
      }
    }

    const limit = getLimit(req.query.limit);
    const requestedRoom = req.query.room;
    let rooms;

    try {
      if (requestedRoom) {
        const room = await Room.findOne({ docId: requestedRoom, status: 'open' });
        if (!room) {
          return res.status(404).json({ error: 'Room not found' });
        }
        rooms = [room];
      } else {
        if (!openRoomsCache || openRoomsCache.expiresAt <= Date.now()) {
          openRoomsCache = {
            rooms: await Room.find({ status: 'open' }),
            expiresAt: Date.now() + CACHE_TTL_MS,
          };
        }
        rooms = openRoomsCache.rooms;
      }

      const posts = [];
      for (const room of rooms) {
        const docId = room.docId;
        const cached = roomPostsCache.get(docId);
        let roomPosts;
        if (cached && cached.expiresAt > Date.now()) {
          roomPosts = cached.posts;
        } else {
          roomPosts = readRoomPosts(await getOrCreateDoc(docId), docId, salt);
          roomPostsCache.set(docId, {
            posts: roomPosts,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });
        }
        posts.push(...roomPosts);
      }

      posts.sort((a, b) => b.timestamp - a.timestamp);
      const filtered = since === undefined
        ? posts
        : posts.filter(post => post.timestamp > since);
      res.set('Cache-Control', 'no-store');
      return res.json(filtered.slice(0, limit).map(({ timestamp, ...post }) => post));
    } catch (err) {
      console.error('[API] GET integration posts error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { registerIntegrationRoutes };
