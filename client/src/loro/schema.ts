import { LoroDoc, LoroMovableList, LoroMap, LoroText } from 'loro-crdt';
import type { StreamNode, StreamNodeWithIndex, EmphasisLevel, AuthorInfo } from '../types';
import { emitUserAction } from './sync-client';

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
/** LoroMapが空のdocブロックかどうかを判定するヘルパー */
const isEmptyDocBlock = (map: LoroMap | null): boolean => {
  if (!map) return false;
  if ((map.get('type') as string) !== 'doc') return false;
  const text = map.get('content') as LoroText | null;
  return !text || text.length === 0;
};

/**
 * 状況に応じて、最初の空docブロックをチャットノードに上書き変換して再利用を試みる。
 * 上書きが成功した場合は true, そうでなければ false を返す。
 */
function tryOverwriteEmptyDocBlock(
  doc: LoroDoc,
  stream: LoroMovableList,
  content: string,
  authorInfo: AuthorInfo
): boolean {
  const length = stream.length;
  if (length === 0) return false;

  let firstEmptyDocIdx = -1;
  let nonEmptyCount = 0;

  for (let i = 0; i < length; i++) {
    const m = stream.get(i) as LoroMap;
    if (!m) continue;
    if (isEmptyDocBlock(m)) {
      if (firstEmptyDocIdx === -1) firstEmptyDocIdx = i;
    } else {
      // chat型 or 内容のあるdoc型 = 非空ブロック
      const t = m.get('content') as LoroText | null;
      if (t && t.length > 0) nonEmptyCount++;
      else if ((m.get('type') as string) === 'chat') nonEmptyCount++;
    }
  }

  // 「内容のあるブロックが0件」かつ「空docが1件以上ある」場合、上書き処理を行う
  if (nonEmptyCount === 0 && firstEmptyDocIdx !== -1) {
    const targetMap = stream.get(firstEmptyDocIdx) as LoroMap;
    const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    targetMap.set('blockId', chatId);
    targetMap.set('type', 'chat');
    targetMap.set('indent', 0);
    targetMap.set('emphasis', 0);
    writeSubAuthors(targetMap, []);
    writeAuthorInfo(targetMap, authorInfo);
    targetMap.set('timestamp', Date.now());

    let loroText = targetMap.get('content') as LoroText | null;
    if (!loroText) {
      loroText = targetMap.setContainer('content', new LoroText());
    }
    loroText.insert(0, content);

    try {
      targetMap.getOrCreateContainer('reactions', new LoroMap());
    } catch {
      targetMap.setContainer('reactions', new LoroMap());
    }

    if (/^[#＃]/.test(content)) {
      targetMap.set('heading', 'h1');
    }

    // 変換後に空docが残っているか確認。なければ末尾に追加する。
    let hasEmptyDocAfter = false;
    for (let i = firstEmptyDocIdx + 1; i < stream.length; i++) {
      if (isEmptyDocBlock(stream.get(i) as LoroMap)) {
        hasEmptyDocAfter = true;
        break;
      }
    }
    if (!hasEmptyDocAfter) {
      const emptyDocMap = stream.insertContainer(stream.length, new LoroMap());
      emptyDocMap.set('type', 'doc');
      emptyDocMap.setContainer('content', new LoroText());
      emptyDocMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      writeAuthorInfo(emptyDocMap, EMPTY_AUTHOR);
      emptyDocMap.set('timestamp', Date.now());
    }

    doc.commit({ message: `chat:${authorInfo.displayName}:${chatId}:${content}` });
    emitUserAction({
      type: 'chat',
      targetId: chatId,
      contentPreview: content.substring(0, 100),
      actionDetails: `チャットメッセージの送信: "${content}"`,
      before: null,
      after: null,
    });
    return true;
  }

  return false;
}

/**
 * 前後の空行（パディング）を制御した上で、チャットを新規挿入する。
 */
function insertChatWithPadding(
  doc: LoroDoc,
  stream: LoroMovableList,
  content: string,
  authorInfo: AuthorInfo
): void {
  const length = stream.length;
  let insertChatPos = length;
  let appendEmptyDoc = true;
  let prependEmptyDoc = true;

  if (length > 0) {
    const lastNode = stream.get(length - 1) as LoroMap;
    if (isEmptyDocBlock(lastNode)) {
      // 最後のブロックが空docブロックの場合、その前にchatを挿入
      insertChatPos = length - 1;
      appendEmptyDoc = false;
    }

    // insertChatPos の直前が空docブロックまたは連続chatかを判定
    if (insertChatPos > 0) {
      const prevNode = stream.get(insertChatPos - 1) as LoroMap;
      if (isEmptyDocBlock(prevNode)) {
        // 直前が空docブロック → 前に空行不要
        prependEmptyDoc = false;
      } else if (prevNode && (prevNode.get('type') as string) === 'chat') {
        // 直前がchat型のとき、gap検出を行う
        const prevTimestamp = (prevNode.get('timestamp') as number) ?? 0;
        let hasNewerChatElsewhere = false;
        for (let i = 0; i < stream.length; i++) {
          const m = stream.get(i) as LoroMap;
          if (!m || m === prevNode) continue;
          if ((m.get('type') as string) !== 'chat') continue;
          const t = (m.get('timestamp') as number) ?? 0;
          if (t > prevTimestamp) {
            hasNewerChatElsewhere = true;
            break;
          }
        }
        if (!hasNewerChatElsewhere) {
          // ストリーム上の直前chatが最新のchat → 連続投稿
          prependEmptyDoc = false;
        }
      }
    } else {
      // 先頭に挿入する場合は前に空行不要
      prependEmptyDoc = false;
    }
  } else {
    // ストリームが空の場合は前に空行不要
    prependEmptyDoc = false;
  }

  // チャットの直前に空docブロックを追加
  if (prependEmptyDoc) {
    const emptyBeforeMap = stream.insertContainer(insertChatPos, new LoroMap());
    emptyBeforeMap.set('type', 'doc');
    emptyBeforeMap.setContainer('content', new LoroText());
    emptyBeforeMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    writeAuthorInfo(emptyBeforeMap, EMPTY_AUTHOR);
    emptyBeforeMap.set('timestamp', Date.now());
    insertChatPos += 1;
  }

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nodeMap = stream.insertContainer(insertChatPos, new LoroMap());
  nodeMap.set('blockId', chatId);
  nodeMap.set('type', 'chat');
  nodeMap.set('indent', 0);
  nodeMap.set('emphasis', 0);
  writeSubAuthors(nodeMap, []);
  const chatText = nodeMap.setContainer('content', new LoroText());
  chatText.insert(0, content);
  writeAuthorInfo(nodeMap, authorInfo);
  nodeMap.set('timestamp', Date.now());
  nodeMap.setContainer('reactions', new LoroMap());
  if (/^[#＃]/.test(content)) {
    nodeMap.set('heading', 'h1');
  }

  // チャットの直後に空docブロックを追加（既になければ）
  if (appendEmptyDoc) {
    const emptyPos = insertChatPos + 1;
    const nextNode = emptyPos < stream.length + 1 ? (stream.get(emptyPos) as LoroMap | null) : null;
    if (!isEmptyDocBlock(nextNode)) {
      const emptyDocMap = stream.insertContainer(emptyPos, new LoroMap());
      emptyDocMap.set('type', 'doc');
      emptyDocMap.setContainer('content', new LoroText());
      emptyDocMap.set('blockId', `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      writeAuthorInfo(emptyDocMap, EMPTY_AUTHOR);
      emptyDocMap.set('timestamp', Date.now());
    }
  }

  doc.commit({ message: `chat:${authorInfo.displayName}:${chatId}:${content}` });
  emitUserAction({
    type: 'chat',
    targetId: chatId,
    contentPreview: content.substring(0, 100),
    actionDetails: `チャットメッセージの送信: "${content}"`,
    before: null,
    after: null,
  });
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

  // 1. 上書き可能な空docがあれば、上書き再利用を試みる
  if (tryOverwriteEmptyDocBlock(doc, stream, content, authorInfo)) {
    return;
  }

  // 2. 通常の新規チャット挿入
  insertChatWithPadding(doc, stream, content, authorInfo);
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
  nodeMap.setContainer('reactions', new LoroMap());
  doc.commit({ message: `doc:${initialAuthorInfo.displayName || 'unknown'}:${blockId}:${text}` });
  emitUserAction({
    type: 'doc-add',
    targetId: blockId,
    contentPreview: text.substring(0, 100),
    actionDetails: `新規ブロックの追加: "${text}"`,
    before: null,
    after: null,
  });
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

  emitUserAction({
    type: 'doc-move',
    targetId: blockId,
    before: { fromIndex, blockId },
    after: { toIndex: finalToIndex },
    actionDetails: `ブロックを並び替え: ${fromIndex} → ${finalToIndex}`,
  });
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

  // ビフォア: 現在のemoji
  const prevEmoji = (reactions.get(userId) as string) || null;

  if (emoji === '') {
    reactions.delete(userId);
  } else {
    reactions.set(userId, emoji);
  }
  const blockId = nodeMap ? (nodeMap.get('blockId') as string || '') : '';
  doc.commit({ message: `reaction:${userId}:${blockId}:${emoji}` });

  emitUserAction({
    type: 'reaction',
    targetId: blockId,
    before: prevEmoji ? { emoji: prevEmoji } : null,
    after: emoji ? { emoji } : null,
    contentPreview: emoji || '',
    actionDetails: emoji ? `リアクション追加: ${emoji}` : 'リアクション削除',
  });
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

  emitUserAction({
    type: 'doc-edit',
    targetId: blockId,
    before: { text: currentText },
    after: { text: newText },
    contentPreview: newText.substring(0, 100),
    actionDetails: `ブロックを編集`,
  });
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
    if (!nodeMap) return;

    const blockId = nodeMap.get('blockId') as string || '';
    const blockType = nodeMap.get('type') as string || '';
    const loroTextContent = nodeMap.get('content') as LoroText | null;
    const blockText = loroTextContent ? loroTextContent.toString() : '';

    // 安全装置: 削除しようとしているのが最後のdocブロック（入力欄）であるかチェック
    if (blockType === 'doc') {
      let docCount = 0;
      for (let i = 0; i < stream.length; i++) {
        const m = stream.get(i) as LoroMap;
        if (m && m.get('type') === 'doc') {
          docCount++;
        }
      }

      if (docCount === 1) {
        // 最後の1ブロックの場合は削除せず、内容をクリアするだけにする
        if (loroTextContent && loroTextContent.length > 0) {
          loroTextContent.delete(0, loroTextContent.length);
          doc.commit({ message: `clear:${authorInfo.displayName}:${blockId}` });
          emitUserAction({
            type: 'doc-edit',
            targetId: blockId,
            before: { text: blockText },
            after: { text: '' },
            contentPreview: '',
            actionDetails: `ブロックをクリア（最後のdocブロックのため削除せずクリア）`,
          });
        }
        return;
      }
    }

    stream.delete(nodeIndex, 1);
    doc.commit({ message: `delete:${authorInfo.displayName}:${blockId}:${nodeIndex}` });

    emitUserAction({
      type: 'doc-delete',
      targetId: blockId,
      before: { blockId, text: blockText, type: blockType },
      after: null,
      contentPreview: blockText.substring(0, 100),
      actionDetails: `ブロックを削除`,
    });
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
      const heading = loroMap.get('heading') as 'h1' | null | undefined;
      const emphasis = (loroMap.get('emphasis') as number) || 0;
      const indent = loroMap.get('indent') as number | undefined;
      const subAuthors = readSubAuthors(loroMap);

      nodes.push({
        node: { type: 'chat', content: contentStr, blockId: id, author, timestamp, reactions, emphasis: emphasis as any, heading, indent, subAuthors },
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
