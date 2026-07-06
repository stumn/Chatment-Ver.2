const { LoroDoc } = require('loro-crdt');
const { DocumentSnapshot, UserActionLog } = require('./db');

// In-memory cache of LoroDoc instances per docId
const docCache = new Map();

/**
 * Get or create a LoroDoc for the given docId.
 * Loads from MongoDB on first access.
 */
async function getOrCreateDoc(docId) {
  if (docCache.has(docId)) {
    return docCache.get(docId);
  }

  const doc = new LoroDoc();
  const record = await DocumentSnapshot.findOne({ docId });

  if (record && record.snapshot) {
    try {
      doc.import(new Uint8Array(record.snapshot));
      console.log(`[Snapshot] Loaded existing snapshot for "${docId}"`);
    } catch (err) {
      console.error(`[Snapshot] Failed to import snapshot for "${docId}":`, err.message);
    }
  } else {
    // Initialize the movable list container
    doc.getMovableList('stream');
    doc.commit();
    console.log(`[Snapshot] Created new doc for "${docId}"`);
  }

  docCache.set(docId, doc);
  return doc;
}

/**
 * Get the latest snapshot binary for a docId.
 */
async function getSnapshot(docId) {
  const doc = await getOrCreateDoc(docId);
  return doc.export({ mode: 'snapshot' });
}

/**
 * Helper to parse Loro change messages and log to MongoDB.
 */
async function saveLoroChangeLog(docId, change) {
  const msg = change.message;
  if (!msg) return;

  const parts = msg.split(':');
  const action = parts[0];
  let type = '';
  let author = 'unknown';
  let targetId = '';
  let contentPreview = '';
  let actionDetails = '';

  switch (action) {
    case 'chat':
      type = 'chat';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      contentPreview = parts.slice(3).join(':') || '';
      actionDetails = `チャットメッセージの送信: "${contentPreview}"`;
      break;
    case 'doc':
      type = 'doc-add';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      contentPreview = parts.slice(3).join(':') || '';
      actionDetails = `新規ブロックの追加: "${contentPreview}"`;
      break;
    case 'edit':
      type = 'doc-edit';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      contentPreview = parts.slice(3).join(':') || '';
      actionDetails = `ブロックの編集: "${contentPreview}"`;
      break;
    case 'delete':
      type = 'doc-delete';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      actionDetails = `ブロックの削除 (インデックス: ${parts[3] || ''})`;
      break;
    case 'moveGroup':
      type = 'doc-move';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      contentPreview = parts.slice(3).join(':') || '';
      actionDetails = `ブロックの並び替え: ${contentPreview}`;
      break;
    case 'reaction':
      type = 'reaction';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      contentPreview = parts.slice(3).join(':') || '';
      actionDetails = `リアクション ${contentPreview ? '追加: ' + contentPreview : '削除'}`;
      break;
    case 'emphasis':
      type = 'emphasis';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      const level = parts[3] || '0';
      const levelName = level === '1' ? '太字' : level === '-1' ? '控えめ' : '標準';
      actionDetails = `ブロック強調度の変更: ${levelName}`;
      break;
    case 'indent':
      type = 'indent';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      const indentLevel = parts[3] || '0';
      actionDetails = `インデントレベルの変更: ${indentLevel}`;
      break;
    case 'toggle-h1':
      type = 'heading';
      author = parts[1] || 'unknown';
      targetId = parts[2] || '';
      const isH1 = parts[3] === 'h1';
      actionDetails = `見出しスタイルの変更: ${isH1 ? '見出し1' : '標準'}`;
      break;
    default:
      return;
  }

  try {
    const log = new UserActionLog({
      timestamp: new Date(change.timestamp * 1000),
      docId,
      type,
      author,
      targetId,
      contentPreview,
      actionDetails
    });
    await log.save();
  } catch (err) {
    console.error(`[DB] Failed to save user action log:`, err.message);
  }
}

/**
 * Apply a binary update from a client, merge into the server doc, and persist.
 */
async function applyUpdate(docId, updateBinary) {
  const doc = await getOrCreateDoc(docId);

  // 1. Record max counters before import to find newly added changes
  const beforeChanges = doc.getAllChanges();
  const maxCountersBefore = new Map();
  for (const [peer, changes] of beforeChanges.entries()) {
    if (changes.length > 0) {
      const lastChange = changes[changes.length - 1];
      maxCountersBefore.set(peer, lastChange.counter + lastChange.length - 1);
    }
  }

  try {
    doc.import(new Uint8Array(updateBinary));
  } catch (err) {
    // Loro WASM が投げるエラーは標準の Error オブジェクトではない場合があるため
    // err.message ではなく String(err) で内容を必ず出力する
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Snapshot] Failed to apply update for "${docId}": ${errMsg}`);
    throw err;
  }

  // 2. Identify new changes
  const afterChanges = doc.getAllChanges();
  const newChanges = [];
  for (const [peer, changes] of afterChanges.entries()) {
    const beforeMax = maxCountersBefore.get(peer);
    for (const change of changes) {
      const changeEnd = change.counter + change.length - 1;
      if (beforeMax === undefined || changeEnd > beforeMax) {
        newChanges.push(change);
      }
    }
  }

  // 3. Sort new changes chronologically
  newChanges.sort((a, b) => {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport;
    return a.timestamp - b.timestamp;
  });

  // 4. Save each action to MongoDB
  for (const change of newChanges) {
    await saveLoroChangeLog(docId, change);
  }

  // Persist merged snapshot to MongoDB
  const snapshot = Buffer.from(doc.export({ mode: 'snapshot' }));
  await DocumentSnapshot.findOneAndUpdate(
    { docId },
    { docId, snapshot, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  return snapshot;
}

module.exports = { getSnapshot, applyUpdate, getOrCreateDoc };
