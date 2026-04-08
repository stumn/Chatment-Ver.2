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
  author: string
): void {
  const stream = getStream(doc);
  const nodeMap = stream.insertContainer(stream.length, new LoroMap());
  nodeMap.set('type', 'doc');
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
  if (level === 0) {
    loroText.unmark({ start, end }, 'emphasis');
  } else {
    // Make sure we configure the style before marking
    doc.configTextStyle({ emphasis: { expand: 'none' } });
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
  if (currentLength > 0) {
    loroText.delete(0, currentLength);
  }
  loroText.insert(0, newText);
  doc.commit();
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
      const content = (loroMap.get('content') as string) || '';
      let reactions: Record<string, string> = {};
      try {
        const reactionsMap = loroMap.get('reactions') as LoroMap | null;
        if (reactionsMap && typeof reactionsMap.toJSON === 'function') {
          reactions = reactionsMap.toJSON() as Record<string, string>;
        }
      } catch {
        reactions = {};
      }

      nodes.push({
        node: { type: 'chat', content, author, timestamp, reactions },
        index: i,
        loroMap,
      });
    } else if (type === 'doc') {
      const loroText = loroMap.get('content') as LoroText;
      const blockId = (loroMap.get('blockId') as string) || '';
      const content = loroText ? loroText.toString() : '';

      nodes.push({
        node: { type: 'doc', content, blockId, author, timestamp },
        index: i,
        loroMap,
        loroText,
      });
    }
  }

  return nodes;
}
