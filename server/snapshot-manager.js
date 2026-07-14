const { LoroDoc } = require('loro-crdt');
const { DocumentSnapshot } = require('./db');

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
 * Apply a binary update from a client, merge into the server doc, and persist.
 * socketMeta: { roomId, userAttribute, userAgeGroup } — ソケット由来のユーザー情報
 */
async function applyUpdate(docId, updateBinary, socketMeta = {}) {
  const doc = await getOrCreateDoc(docId);

  try {
    doc.import(new Uint8Array(updateBinary));
  } catch (err) {
    // Loro WASM が投げるエラーは標準の Error オブジェクトではない場合があるため
    // err.message ではなく String(err) で内容を必ず出力する
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Snapshot] Failed to apply update for "${docId}": ${errMsg}`);
    throw err;
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
