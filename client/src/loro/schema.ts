import { LoroDoc, LoroMovableList, LoroMap, LoroText } from 'loro-crdt';
import type { StreamNode, StreamNodeWithIndex, EmphasisLevel, AuthorInfo } from '../types';

let peerIdCounter = BigInt(Math.floor(Math.random() * 1000000));

/** 空の AuthorInfo（空ブロック用） */
export const EMPTY_AUTHOR: AuthorInfo = { displayName: '', realName: '', userId: '' };

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

/** LoroMapにAuthorInfoをフラットフィールドとして保存 */
function writeAuthorInfo(nodeMap: LoroMap, info: AuthorInfo, prefix: string = '') {
  nodeMap.set(`${prefix}author`, info.displayName);
  nodeMap.set(`${prefix}authorRealName`, info.realName);
  nodeMap.set(`${prefix}authorUserId`, info.userId);
}

/** LoroMapからAuthorInfoを読み取る。後方互換のためフィールドがなければ空文字列で補完 */
function readAuthorInfo(nodeMap: LoroMap, prefix: string = ''): AuthorInfo {
  const displayName = (nodeMap.get(`${prefix}author`) as string) || '';
  const realName = (nodeMap.get(`${prefix}authorRealName`) as string) || displayName;
  const userId = (nodeMap.get(`${prefix}authorUserId`) as string) || '';
  return { displayName, realName, userId };
}

/** subAuthorsをJSON文字列として保存 */
function writeSubAuthors(nodeMap: LoroMap, subAuthors: AuthorInfo[]) {
  nodeMap.set('subAuthors', JSON.stringify(subAuthors));
}

/** subAuthorsをJSON文字列から読み取る。旧フォーマット(subAuthor: string)も後方互換で対応 */
function readSubAuthors(nodeMap: LoroMap): AuthorInfo[] {
  const json = nodeMap.get('subAuthors') as string | null;
  if (json) {
    try {
      return JSON.parse(json) as AuthorInfo[];
    } catch {
      return [];
    }
  }
  // 旧フォーマット互換
  const legacy = (nodeMap.get('subAuthor') as string) || '';
  if (legacy) {
    return [{ displayName: legacy, realName: legacy, userId: '' }];
  }
  return [];
}

/**
 * Add a chat node to the stream.
 */
export function addChatNode(
  doc: LoroDoc,
  content: string,
  authorInfo: AuthorInfo
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
  // Author情報をフラット保存
  writeAuthorInfo(nodeMap, authorInfo);
  nodeMap.set('timestamp', Date.now());
  nodeMap.setContainer('reactions', new LoroMap());

  if (appendEmptyDoc) {
    const emptyPos = insertChatPos + 1;
    const emptyDocMap = stream.insertContainer(emptyPos, new LoroMap());
    emptyDocMap.set('type', 'doc');
    emptyDocMap.setContainer('content', new LoroText());
    emptyDocMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    // 空ブロックはauthor空
    writeAuthorInfo(emptyDocMap, EMPTY_AUTHOR);
    emptyDocMap.set('timestamp', Date.now());
  }

  doc.commit({ message: `chat:${authorInfo.displayName}:${chatId}:${content}` });
}

/**
 * Add a document node to the stream.
 */
export function addDocNode(
  doc: LoroDoc,
  text: string,
  authorInfo: AuthorInfo,
  emphasis?: number,
  indent?: number,
  heading?: 'h1' | null,
  subAuthorInfo?: AuthorInfo | null
): void {
  insertDocNodeAfter(doc, getStream(doc).length - 1, text, authorInfo, emphasis, indent, heading, subAuthorInfo);
}

/**
 * Insert a document node to the stream after a specific index.
 */
export function insertDocNodeAfter(
  doc: LoroDoc,
  targetIndex: number,
  text: string,
  authorInfo: AuthorInfo,
  emphasis?: number,
  indent?: number,
  heading?: 'h1' | null,
  subAuthorInfo?: AuthorInfo | null
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
  const initialAuthorInfo = hasTextContent ? authorInfo : EMPTY_AUTHOR;
  writeAuthorInfo(nodeMap, initialAuthorInfo);

  if (subAuthorInfo) {
    writeSubAuthors(nodeMap, [subAuthorInfo]);
  }

  nodeMap.set('timestamp', Date.now());
  doc.commit({ message: `doc:${initialAuthorInfo.displayName || 'unknown'}:${blockId}:${text}` });
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
  authorInfo: AuthorInfo
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
  doc.commit({ message: `moveGroup:${authorInfo.displayName}:${blockId}:${fromIndex}->${finalToIndex}` });
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
  editorInfo: AuthorInfo
): void {
  const stream = getStream(doc);
  const nodeMap = stream.get(nodeIndex) as LoroMap;
  if (!nodeMap) return;

  const currentAuthorUserId = (nodeMap.get('authorUserId') as string) || '';
  const currentSubAuthors = readSubAuthors(nodeMap);

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

  const isAlreadyAuthor = currentAuthorUserId === editorInfo.userId && currentAuthorUserId !== '';
  const isAlreadySubAuthor = currentSubAuthors.some(sa => sa.userId === editorInfo.userId && sa.userId !== '');

  // First Author resolution
  if (hasSubstantialChange && !currentAuthorUserId) {
    // 空ブロックへの初回書き込み：主著者として記録
    writeAuthorInfo(nodeMap, editorInfo);
  } else if (hasSubstantialChange && !isAlreadyAuthor && !isAlreadySubAuthor && editorInfo.userId) {
    // 他者の編集：共同編集者配列に追加
    const newSubAuthors = [...currentSubAuthors, editorInfo];
    writeSubAuthors(nodeMap, newSubAuthors);
  }

  const currentLength = loroText.length;

  // If the block is transitioning from empty to non-empty, update timestamp
  if (currentLength === 0 && newText.trim().length > 0) {
    nodeMap.set('timestamp', Date.now());
  }

  if (currentLength > 0) {
    loroText.delete(0, currentLength);
  }
  loroText.insert(0, newText);
  const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
  doc.commit({ message: `edit:${editorInfo.displayName}:${blockId}:${newText}` });
}

/**
 * Delete a document node from the stream.
 */
export function deleteDocNode(
  doc: LoroDoc,
  nodeIndex: number,
  authorInfo: AuthorInfo
): void {
  const stream = getStream(doc);
  if (nodeIndex >= 0 && nodeIndex < stream.length) {
    const nodeMap = stream.get(nodeIndex) as LoroMap;
    const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
    stream.delete(nodeIndex, 1);
    doc.commit({ message: `delete:${authorInfo.displayName}:${blockId}:${nodeIndex}` });
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
    const author = readAuthorInfo(loroMap);
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
      const subAuthors = readSubAuthors(loroMap);

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
        node: { type: 'doc', content, blockId, author, timestamp, reactions, emphasis: emphasis as any, heading, indent, subAuthors },
        id: blockId,
        index: i,
        loroMap,
        loroText,
      });
    }
  }

  return nodes;
}
