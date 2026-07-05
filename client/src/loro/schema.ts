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
  const length = stream.length;
  let insertChatPos = length;
  let appendEmptyDoc = true;

  if (length > 0) {
    const lastNode = stream.get(length - 1) as LoroMap;
    if (lastNode) {
      const type = lastNode.get('type') as string;
      if (type === 'doc') {
        const loroText = lastNode.get('content') as LoroText;
        if (loroText && loroText.length === 0) {
          // The last block is an empty doc block
          insertChatPos = length - 1; 
          appendEmptyDoc = false;
        }
      }
    }
  }

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nodeMap = stream.insertContainer(insertChatPos, new LoroMap());
  nodeMap.set('blockId', chatId);
  nodeMap.set('type', 'chat');
  const chatText = nodeMap.setContainer('content', new LoroText());
  chatText.insert(0, content);
  nodeMap.set('author', author);
  nodeMap.set('timestamp', Date.now());
  nodeMap.setContainer('reactions', new LoroMap());

  if (appendEmptyDoc) {
    const emptyPos = insertChatPos + 1;
    const emptyDocMap = stream.insertContainer(emptyPos, new LoroMap());
    emptyDocMap.set('type', 'doc');
    const loroText = emptyDocMap.setContainer('content', new LoroText());
    
    emptyDocMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    emptyDocMap.set('author', author);
    emptyDocMap.set('timestamp', Date.now());
  }

  doc.commit({ message: `chat:${author}:${chatId}:${content}` });
}

/**
 * Add a document node to the stream.
 */
export function addDocNode(
  doc: LoroDoc,
  text: string,
  author: string,
  emphasis?: number,
  indent?: number,
  heading?: 'h1' | null,
  subAuthor?: string | null
): void {
  insertDocNodeAfter(doc, getStream(doc).length - 1, text, author, emphasis, indent, heading, subAuthor);
}

/**
 * Insert a document node to the stream after a specific index.
 */
export function insertDocNodeAfter(
  doc: LoroDoc,
  targetIndex: number,
  text: string,
  author: string,
  emphasis?: number,
  indent?: number,
  heading?: 'h1' | null,
  subAuthor?: string | null
): void {
  const stream = getStream(doc);
  const insertPos = targetIndex >= 0 ? targetIndex + 1 : stream.length;
  const nodeMap = stream.insertContainer(insertPos, new LoroMap());
  nodeMap.set('type', 'doc');
  if (emphasis !== undefined) {
    nodeMap.set('emphasis', emphasis);
  }
  if (indent !== undefined) {
    nodeMap.set('indent', indent);
  }
  if (heading !== undefined) {
    nodeMap.set('heading', heading);
  }
  const loroText = nodeMap.setContainer('content', new LoroText());
  loroText.insert(0, text);
  const blockId = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nodeMap.set('blockId', blockId);

  // Blank/whitespace-only check
  const hasTextContent = text.replace(/[\s　]+/g, '').length > 0;
  const initialAuthor = hasTextContent ? author : '';
  nodeMap.set('author', initialAuthor);
  if (subAuthor) {
    nodeMap.set('subAuthor', subAuthor);
  }

  nodeMap.set('timestamp', Date.now());
  doc.commit({ message: `doc:${initialAuthor || 'unknown'}:${blockId}:${text}` });
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
  doc.commit({ message: `emphasis:${level}` });
}

/**
 * Move a node within the stream (for drag-and-drop reordering).
 */
function getGroupRange(stream: any, parentIndex: number): number {
  let childCount = 0;
  const length = stream.length;
  for (let i = parentIndex + 1; i < length; i++) {
    const nodeMap = stream.get(i) as LoroMap;
    if (!nodeMap) break;
    const indent = (nodeMap.get('indent') as number) || 0;
    if (indent > 0) {
      childCount++;
    } else {
      break;
    }
  }
  return childCount;
}

export function moveNode(
  doc: LoroDoc,
  fromIndex: number,
  toIndex: number,
  userName: string
): void {
  const stream = getStream(doc);
  if (fromIndex < 0 || fromIndex >= stream.length) return;
  if (toIndex < 0 || toIndex >= stream.length) return;
  if (fromIndex === toIndex) return;

  const fromChildCount = getGroupRange(stream, fromIndex);
  const fromGroupSize = fromChildCount + 1;

  let targetParentIndex = toIndex;
  const targetMap = stream.get(toIndex) as LoroMap;
  if (targetMap && ((targetMap.get('indent') as number) || 0) > 0) {
    for (let i = toIndex - 1; i >= 0; i--) {
      const pMap = stream.get(i) as LoroMap;
      if (pMap && ((pMap.get('indent') as number) || 0) === 0) {
        targetParentIndex = i;
        break;
      }
    }
  }

  const toChildCount = getGroupRange(stream, targetParentIndex);
  
  let finalToIndex = targetParentIndex;
  if (fromIndex < targetParentIndex) {
    finalToIndex = targetParentIndex + toChildCount;
  } else {
    finalToIndex = targetParentIndex;
  }

  if (finalToIndex >= fromIndex && finalToIndex < fromIndex + fromGroupSize) {
    return;
  }

  for (let i = 0; i < fromGroupSize; i++) {
    if (fromIndex < finalToIndex) {
      stream.move(fromIndex, finalToIndex);
    } else {
      stream.move(fromIndex + i, finalToIndex + i);
    }
  }
  
  const movedMap = stream.get(finalToIndex) as LoroMap;
  const blockId = movedMap ? (movedMap.get('blockId') as string || '') : '';
  doc.commit({ message: `moveGroup:${userName}:${blockId}:${fromIndex}->${finalToIndex}` });
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
  if (emoji === '') {
    reactions.delete(userId);
  } else {
    reactions.set(userId, emoji);
  }
  const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
  doc.commit({ message: `reaction:${userId}:${blockId}:${emoji}` });
}

/**
 * Update a document node's text content.
 */
export function updateDocContent(
  doc: LoroDoc,
  nodeIndex: number,
  newText: string,
  editorName: string
): void {
  const stream = getStream(doc);
  const nodeMap = stream.get(nodeIndex) as LoroMap;
  if (!nodeMap) return;

  const currentAuthor = (nodeMap.get('author') as string) || '';
  const currentSubAuthor = (nodeMap.get('subAuthor') as string) || '';

  let contentVal = nodeMap.get('content');
  let loroText: LoroText;

  if (typeof contentVal === 'string') {
    loroText = nodeMap.setContainer('content', new LoroText());
  } else if (contentVal && typeof contentVal === 'object' && typeof (contentVal as any).toDelta === 'function') {
    loroText = contentVal as LoroText;
  } else {
    return;
  }

  const currentText = loroText.toString();
  const cleanOld = currentText.replace(/[\s　]+/g, '');
  const cleanNew = newText.replace(/[\s　]+/g, '');
  const hasSubstantialChange = cleanOld !== cleanNew;

  // First Author resolution
  if (hasSubstantialChange && !currentAuthor) {
    nodeMap.set('author', editorName);
  } else if (hasSubstantialChange && currentAuthor && currentAuthor !== editorName && currentSubAuthor !== editorName) {
    nodeMap.set('subAuthor', editorName);
  }

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
  const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
  doc.commit({ message: `edit:${editorName}:${blockId}:${newText}` });
}

/**
 * Delete a document node from the stream.
 */
export function deleteDocNode(
  doc: LoroDoc,
  nodeIndex: number,
  userName: string
): void {
  const stream = getStream(doc);
  if (nodeIndex >= 0 && nodeIndex < stream.length) {
    const nodeMap = stream.get(nodeIndex) as LoroMap;
    const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
    stream.delete(nodeIndex, 1);
    doc.commit({ message: `delete:${userName}:${blockId}:${nodeIndex}` });
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
      const emphasis = (loroMap.get('emphasis') as number) || 0;
      const heading = loroMap.get('heading') as 'h1' | null | undefined;
      const indent = loroMap.get('indent') as number | undefined;
      const subAuthor = (loroMap.get('subAuthor') as string) || null;

      let reactions: Record<string, string> = {};
      try {
        const reactionsMap = loroMap.get('reactions') as LoroMap | null;
        if (reactionsMap && typeof reactionsMap.toJSON === 'function') {
          reactions = reactionsMap.toJSON() as Record<string, string>;
        }
      } catch {
        // no reactions
      }

      nodes.push({
        node: { type: 'doc', content, blockId, author, timestamp, reactions, emphasis: emphasis as any, heading, indent, subAuthor },
        id: blockId,
        index: i,
        loroMap,
        loroText,
      });
    }
  }

  return nodes;
}
