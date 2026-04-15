import { LoroDoc, LoroMovableList, LoroMap, LoroText } from 'loro-crdt';
import type { StreamNode, StreamNodeWithIndex, EmphasisLevel } from '../types';

let peerIdCounter = BigInt(Math.floor(Math.random() * 1000000));

/**
 * Create a new LoroDoc with a 'stream' LoroMovableList as the root container.
 */
export function createDoc(peerId?: bigint): LoroDoc {
  const doc = new LoroDoc();
  if (peerId !== undefined) {
    doc.setPeerId(peerId);
  } else {
    doc.setPeerId(peerIdCounter++);
  }
  doc.getMovableList('stream');
  doc.commit();
  return doc;
}

/**
 * Get the root stream (LoroMovableList).
 */
export function getStream(doc: LoroDoc): LoroMovableList {
  return doc.getMovableList('stream');
}

/**
 * Add a chat node to the stream.
 */
export function addChatNode(
  doc: LoroDoc,
  content: string,
  author: string
): void {
  const stream = getStream(doc);
  const nodeMap = stream.insertContainer(stream.length, new LoroMap());
  nodeMap.set('type', 'chat');
  nodeMap.set('content', content);
  nodeMap.set('author', author);
  nodeMap.set('timestamp', Date.now());
  nodeMap.setContainer('reactions', new LoroMap());
  doc.commit();
}

/**
 * Add a document node to the stream.
 */
export function addDocNode(
  doc: LoroDoc,
  text: string,
  author: string,
  emphasis?: number
): void {
  insertDocNodeAfter(doc, getStream(doc).length - 1, text, author, emphasis);
}

/**
 * Insert a document node to the stream after a specific index.
 */
export function insertDocNodeAfter(
  doc: LoroDoc,
  targetIndex: number,
  text: string,
  author: string,
  emphasis?: number
): void {
  const stream = getStream(doc);
  const insertPos = targetIndex >= 0 ? targetIndex + 1 : stream.length;
  const nodeMap = stream.insertContainer(insertPos, new LoroMap());
  nodeMap.set('type', 'doc');
  if (emphasis !== undefined) {
    nodeMap.set('emphasis', emphasis);
  }
  const loroText = nodeMap.setContainer('content', new LoroText());
  loroText.insert(0, text);
  nodeMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  nodeMap.set('author', author);
  nodeMap.set('timestamp', Date.now());
  doc.commit();
}

/**
 * Apply 3-level emphasis mark to a LoroText range.
 * level: -1 (fade), 0 (default/clear), +1 (highlight)
 */
export function applyEmphasis(
  doc: LoroDoc,
  loroText: LoroText,
  start: number,
  end: number,
  level: EmphasisLevel
): void {
  // Make sure we configure the style before marking OR unmarking!
  doc.configTextStyle({ emphasis: { expand: 'none' } });

  if (level === 0) {
    loroText.unmark({ start, end }, 'emphasis');
  } else {
    loroText.mark({ start, end }, 'emphasis', level);
  }
  doc.commit();
}

/**
 * Move a node within the stream (for drag-and-drop reordering).
 */
export function moveNode(
  doc: LoroDoc,
  fromIndex: number,
  toIndex: number
): void {
  const stream = getStream(doc);
  if (fromIndex < 0 || fromIndex >= stream.length) return;
  if (toIndex < 0 || toIndex >= stream.length) return;
  stream.move(fromIndex, toIndex);
  doc.commit();
}

/**
 * Add a reaction to a chat node.
 */
export function addReaction(
  doc: LoroDoc,
  nodeIndex: number,
  userId: string,
  emoji: string
): void {
  const stream = getStream(doc);
  const nodeMap = stream.get(nodeIndex) as LoroMap;
  if (!nodeMap) return;

  let reactions: LoroMap;
  try {
    reactions = nodeMap.getOrCreateContainer('reactions', new LoroMap()) as LoroMap;
  } catch {
    reactions = nodeMap.setContainer('reactions', new LoroMap());
  }
  reactions.set(userId, emoji);
  doc.commit();
}

/**
 * Update a document node's text content.
 */
export function updateDocContent(
  doc: LoroDoc,
  nodeIndex: number,
  newText: string
): void {
  const stream = getStream(doc);
  const nodeMap = stream.get(nodeIndex) as LoroMap;
  if (!nodeMap) return;

  const loroText = nodeMap.get('content') as LoroText;
  if (!loroText) return;

  const currentLength = loroText.length;
  
  // If the block is transitioning from empty to non-empty, update timestamp
  // so it correctly floats to the newest in the chat stream.
  if (currentLength === 0 && newText.trim().length > 0) {
    nodeMap.set('timestamp', Date.now());
  }

  if (currentLength > 0) {
    loroText.delete(0, currentLength);
  }
  loroText.insert(0, newText);
  doc.commit();
}

/**
 * Delete a document node from the stream.
 */
export function deleteDocNode(
  doc: LoroDoc,
  nodeIndex: number
): void {
  const stream = getStream(doc);
  if (nodeIndex >= 0 && nodeIndex < stream.length) {
    stream.delete(nodeIndex, 1);
    doc.commit();
  }
}

/**
 * Get all nodes from the stream as plain data.
 */
export function getAllNodes(doc: LoroDoc): StreamNodeWithIndex[] {
  const stream = getStream(doc);
  const length = stream.length;
  const nodes: StreamNodeWithIndex[] = [];

  for (let i = 0; i < length; i++) {
    const loroMap = stream.get(i) as LoroMap;
    if (!loroMap) continue;

    const type = loroMap.get('type') as string;
    const author = (loroMap.get('author') as string) || '';
    const timestamp = (loroMap.get('timestamp') as number) || 0;

    if (type === 'chat') {
      let contentVal = loroMap.get('content');
      let contentStr = '';
      let loroTextContainer: LoroText | undefined;

      if (contentVal && typeof contentVal === 'object' && typeof (contentVal as any).toDelta === 'function') {
        loroTextContainer = contentVal as LoroText;
        contentStr = loroTextContainer.toString();
      } else {
        contentStr = (contentVal as string) || '';
      }

      let reactions: Record<string, string> = {};
      try {
        const reactionsMap = loroMap.get('reactions') as LoroMap | null;
        if (reactionsMap && typeof reactionsMap.toJSON === 'function') {
          reactions = reactionsMap.toJSON() as Record<string, string>;
        }
      } catch {
        reactions = {};
      }

      let id = loroMap.get('blockId') as string | undefined;
      if (!id) {
        id = `chat-${timestamp}-${i}`;
        // Optionally set it back if we want to persist it, but ephemeral is fine for keying
      }

      nodes.push({
        node: { type: 'chat', content: contentStr, author, timestamp, reactions },
        id,
        index: i,
        loroMap,
        loroText: loroTextContainer,
      });
    } else if (type === 'doc') {
      const loroText = loroMap.get('content') as LoroText;
      let blockId = (loroMap.get('blockId') as string) || '';
      if (!blockId) {
        blockId = `doc-${timestamp}-${i}`;
      }
      const content = loroText ? loroText.toString() : '';

      nodes.push({
        node: { type: 'doc', content, blockId, author, timestamp },
        id: blockId,
        index: i,
        loroMap,
        loroText,
      });
    }
  }

  return nodes;
}
