const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const express = require('express');
const { LoroDoc, LoroMap, LoroText } = require('loro-crdt');
const { registerIntegrationRoutes } = require('../integration');

const originalToken = process.env.INTEGRATION_TOKEN;
const originalSalt = process.env.INTEGRATION_USER_SALT;
const servers = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  if (originalToken === undefined) delete process.env.INTEGRATION_TOKEN;
  else process.env.INTEGRATION_TOKEN = originalToken;
  if (originalSalt === undefined) delete process.env.INTEGRATION_USER_SALT;
  else process.env.INTEGRATION_USER_SALT = originalSalt;
});

function addPost(doc, {
  type = 'chat',
  content,
  realName,
  author = realName,
  userId = 'sess-1',
  timestamp,
  blockId,
}) {
  const stream = doc.getMovableList('stream');
  const map = stream.insertContainer(stream.length, new LoroMap());
  map.set('type', type);
  map.set('blockId', blockId);
  const text = map.setContainer('content', new LoroText());
  if (content) text.insert(0, content);
  map.set('author', author);
  map.set('authorRealName', realName);
  map.set('authorUserId', userId);
  map.set('timestamp', timestamp);
  doc.commit();
}

function createFixture(roomEntries = []) {
  const rooms = roomEntries.map(({ docId, status = 'open' }) => ({ docId, status }));
  const docs = new Map();
  const requestedDocIds = [];

  for (const entry of roomEntries) {
    const doc = new LoroDoc();
    doc.getMovableList('stream');
    for (const post of entry.posts || []) addPost(doc, post);
    doc.commit();
    docs.set(entry.docId, doc);
  }

  const Room = {
    findOne: async ({ docId, status }) =>
      rooms.find(room => room.docId === docId && room.status === status) || null,
    find: async ({ status }) => rooms.filter(room => room.status === status),
  };
  const getOrCreateDoc = async docId => {
    requestedDocIds.push(docId);
    return docs.get(docId);
  };

  return { Room, getOrCreateDoc, requestedDocIds };
}

async function startServer(fixture) {
  const app = express();
  registerIntegrationRoutes(app, fixture);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, () => resolve(instance));
    instance.once('error', reject);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/api/integration/posts`;
}

async function getPosts(url, options = {}) {
  const response = await fetch(url, options);
  return { response, body: await response.json() };
}

function getAuthorizedPosts(url, options = {}) {
  return getPosts(url, {
    ...options,
    headers: { Authorization: 'Bearer test-token', ...options.headers },
  });
}

const timestamp = Date.UTC(2026, 11, 10, 4, 5, 12);

test('returns 404 when either integration environment variable is missing', async () => {
  const url = await startServer(createFixture([{ docId: 'room-1' }]));

  for (const environment of [
    { token: undefined, salt: 'test-salt' },
    { token: 'test-token', salt: undefined },
    { token: undefined, salt: undefined },
  ]) {
    if (environment.token === undefined) delete process.env.INTEGRATION_TOKEN;
    else process.env.INTEGRATION_TOKEN = environment.token;
    if (environment.salt === undefined) delete process.env.INTEGRATION_USER_SALT;
    else process.env.INTEGRATION_USER_SALT = environment.salt;

    const noToken = await getPosts(url);
    const validToken = await getPosts(url, {
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(noToken.response.status, 404);
    assert.equal(validToken.response.status, 404);
  }
});

test('requires a valid token and accepts bearer and query authentication', async () => {
  process.env.INTEGRATION_TOKEN = 'test-token';
  process.env.INTEGRATION_USER_SALT = 'test-salt';
  const url = await startServer(createFixture([{
    docId: 'room-1',
    posts: [{ blockId: 'post-1', content: '本文', realName: '田中', timestamp }],
  }]));

  assert.equal((await getPosts(url)).response.status, 401);
  assert.equal((await getPosts(url, {
    headers: { Authorization: 'Bearer wrong-token' },
  })).response.status, 401);
  assert.equal((await getPosts(`${url}?token=test-token`)).response.status, 200);
  assert.equal((await getPosts(url, {
    headers: { Authorization: 'Bearer test-token' },
  })).response.status, 200);
});

test('returns the documented fields, JST time, and deterministic real-name users', async () => {
  process.env.INTEGRATION_TOKEN = 'test-token';
  process.env.INTEGRATION_USER_SALT = 'test-salt';
  const fixture = createFixture([{
    docId: 'room-1',
    posts: [
      { blockId: 'post-1', content: '本文A', realName: '同じ人', author: '表示A', userId: 'one', timestamp },
      { blockId: 'post-2', content: '本文B', realName: '同じ人', author: '表示B', userId: 'two', timestamp: timestamp - 1 },
      { blockId: 'post-3', content: '本文C', realName: '別の人', author: '表示C', timestamp: timestamp - 2 },
    ],
  }]);
  const url = await startServer(fixture);
  const { response, body } = await getAuthorizedPosts(url);

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body[0]).sort(), ['id', 'room', 'time', 'user']);
  assert.equal(body[0].time, '2026-12-10T13:05:12+09:00');
  assert.match(body[0].time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  assert.match(body[0].user, /^u[0-9a-f]{10}$/);
  assert.equal(body[0].user, body[1].user);
  assert.notEqual(body[0].user, body[2].user);
  assert.equal(JSON.stringify(body).includes('本文'), false);
  assert.equal(JSON.stringify(body).includes('表示'), false);
  assert.equal(JSON.stringify(body).includes('同じ人'), false);
});

test('excludes blank content and entries without either author name', async () => {
  process.env.INTEGRATION_TOKEN = 'test-token';
  process.env.INTEGRATION_USER_SALT = 'test-salt';
  const url = await startServer(createFixture([{
    docId: 'room-1',
    posts: [
      { blockId: 'valid', content: '有効', realName: '名前', timestamp },
      { blockId: 'empty', content: '', realName: '名前', timestamp: timestamp - 1 },
      { blockId: 'spaces', content: ' \t\u3000', realName: '名前', timestamp: timestamp - 2 },
      { blockId: 'no-author', content: '本文', realName: '', author: '', timestamp: timestamp - 3 },
    ],
  }]));

  const { response, body } = await getAuthorizedPosts(url);
  assert.equal(response.status, 200);
  assert.deepEqual(body.map(post => post.id), ['valid']);
});

test('combines open rooms in newest-first order and filters by room', async () => {
  process.env.INTEGRATION_TOKEN = 'test-token';
  process.env.INTEGRATION_USER_SALT = 'test-salt';
  const fixture = createFixture([
    { docId: 'room-1', posts: [{ blockId: 'older', content: 'A', realName: 'A', timestamp }] },
    { docId: 'room-2', posts: [{ blockId: 'newer', content: 'B', realName: 'B', timestamp: timestamp + 1 }] },
    { docId: 'closed', status: 'closed', posts: [{ blockId: 'closed-post', content: 'C', realName: 'C', timestamp: timestamp + 2 }] },
  ]);
  const url = await startServer(fixture);

  const all = await getAuthorizedPosts(url);
  assert.deepEqual(all.body.map(post => post.id), ['newer', 'older']);
  assert.deepEqual(all.body.map(post => post.room), ['room-2', 'room-1']);
  const oneRoom = await getAuthorizedPosts(`${url}?room=room-1`);
  assert.deepEqual(oneRoom.body.map(post => post.id), ['older']);
});

test('returns 404 for missing or non-open rooms without creating a document', async () => {
  process.env.INTEGRATION_TOKEN = 'test-token';
  process.env.INTEGRATION_USER_SALT = 'test-salt';
  const fixture = createFixture([{ docId: 'closed', status: 'closed' }]);
  const url = await startServer(fixture);

  assert.equal((await getAuthorizedPosts(`${url}?room=missing`)).response.status, 404);
  assert.equal((await getAuthorizedPosts(`${url}?room=closed`)).response.status, 404);
  assert.deepEqual(fixture.requestedDocIds, []);
});
