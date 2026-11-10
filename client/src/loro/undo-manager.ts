import { LoroDoc, UndoManager, LoroEventBatch } from 'loro-crdt';
import type { StreamNodeWithIndex } from '../types';

export interface UndoStackItem {
  counterRange: { start: number; end: number };
  message: string;
  action: 'edit' | 'chat' | 'doc' | 'delete' | 'clear' | 'indent' | 'format-style' | 'emphasis' | 'move' | 'reaction' | 'merge' | 'hashtag' | 'unknown';
  blockId?: string;
  authorName?: string;
  textSnippet?: string;
  details?: string;
  timestamp: number;
  mergeCount: number;
}

let undoManagerInstance: UndoManager | null = null;

const undoStack: UndoStackItem[] = [];
const redoStack: UndoStackItem[] = [];
let lastPopped: { source: 'undo' | 'redo'; item: UndoStackItem } | null = null;

/**
 * コミットメッセージから操作内容と対象ブロックIDを解析
 */
export function parseCommitMessage(message: string): {
  action: UndoStackItem['action'];
  authorName?: string;
  blockId?: string;
  textSnippet?: string;
  details?: string;
} {
  if (!message) return { action: 'unknown' };
  const parts = message.split(':');
  const action = parts[0];

  switch (action) {
    case 'edit':
      return {
        action: 'edit',
        authorName: parts[1],
        blockId: parts[2],
        textSnippet: parts.slice(3).join(':'),
      };
    case 'chat':
      return {
        action: 'chat',
        authorName: parts[1],
        blockId: parts[2],
        textSnippet: parts.slice(3).join(':'),
      };
    case 'doc':
      return {
        action: 'doc',
        authorName: parts[1],
        blockId: parts[2],
        textSnippet: parts.slice(3).join(':'),
      };
    case 'delete':
      return {
        action: 'delete',
        authorName: parts[1],
        blockId: parts[2],
        details: parts[3],
      };
    case 'clear':
      return {
        action: 'clear',
        authorName: parts[1],
        blockId: parts[2],
      };
    case 'indent':
      return {
        action: 'indent',
        authorName: parts[1],
        blockId: parts[2],
        details: parts[3],
      };
    case 'format-style':
      return {
        action: 'format-style',
        authorName: parts[1],
        blockId: parts[2],
        details: parts[3],
      };
    case 'moveGroup':
      return {
        action: 'move',
        authorName: parts[1],
        blockId: parts[2],
        details: parts[3],
      };
    case 'reaction':
    case 'emojiReaction':
      return {
        action: 'reaction',
        authorName: parts[1],
        blockId: parts[2],
        details: parts[3],
      };
    case 'merge':
      return {
        action: 'merge',
        authorName: parts[1],
        details: parts[2],
      };
    case 'add-hashtag':
      return {
        action: 'hashtag',
        blockId: parts[1],
      };
    case 'emphasis':
      return {
        action: 'emphasis',
        details: parts[1],
      };
    default:
      return { action: 'unknown', details: message };
  }
}

/**
 * イベントオブジェクトからブロックIDをフォールバック抽出
 */
function extractBlockIdFromEvent(doc: LoroDoc, event?: LoroEventBatch): string | undefined {
  if (!event || !event.events) return undefined;
  for (const ev of event.events) {
    if (ev.path && ev.path.length >= 2 && ev.path[0] === 'stream') {
      const idx = typeof ev.path[1] === 'number' ? ev.path[1] : parseInt(String(ev.path[1]), 10);
      if (!isNaN(idx)) {
        try {
          const list = doc.getMovableList('stream');
          if (idx < list.length) {
            const map = list.get(idx);
            if (map && typeof (map as any).get === 'function') {
              const bId = (map as any).get('blockId');
              if (bId) return String(bId);
            }
          }
        } catch {}
      }
    }
  }
  return undefined;
}

/**
 * Initialize the UndoManager for the given LoroDoc.
 * Excludes remote sync operations from the undo stack.
 */
export function initUndoManager(doc: LoroDoc): UndoManager {
  if (undoManagerInstance) {
    return undoManagerInstance;
  }

  undoStack.length = 0;
  redoStack.length = 0;
  lastPopped = null;

  undoManagerInstance = new UndoManager(doc, {
    mergeInterval: 1000,
    maxUndoSteps: 100,
    excludeOriginPrefixes: ['sync-'],
    onPush: (isUndo, counterRange, event) => {
      const now = Date.now();
      let item: UndoStackItem;

      if (isUndo) {
        // Undoスタックへのpush
        if (lastPopped && lastPopped.source === 'redo') {
          // redo操作によってUndoスタックに戻されたもの
          item = {
            ...lastPopped.item,
            counterRange,
            timestamp: now,
          };
          undoStack.push(item);
        } else {
          // ユーザーによる新規ローカル操作（これによりredoスタックはクリアされる）
          redoStack.length = 0;

          const change = doc.getChangeAt({ peer: doc.peerIdStr, counter: counterRange.start });
          const commitMsg = change?.message || '';
          const parsed = parseCommitMessage(commitMsg);
          const blockId = parsed.blockId || extractBlockIdFromEvent(doc, event);

          const last = undoStack[undoStack.length - 1];
          const isMerge =
            last &&
            now - last.timestamp < 1000 &&
            last.counterRange.end === counterRange.start &&
            last.action === parsed.action &&
            last.blockId === blockId;

          if (isMerge) {
            last.counterRange.end = counterRange.end;
            last.timestamp = now;
            if (parsed.textSnippet) {
              last.textSnippet = parsed.textSnippet;
            }
            last.mergeCount++;
            item = last;
          } else {
            item = {
              counterRange,
              message: commitMsg,
              action: parsed.action,
              blockId,
              authorName: parsed.authorName,
              textSnippet: parsed.textSnippet,
              details: parsed.details,
              timestamp: now,
              mergeCount: 1,
            };
            undoStack.push(item);
          }
        }
      } else {
        // Redoスタックへのpush（undo操作によって積まれたもの）
        if (lastPopped && lastPopped.source === 'undo') {
          item = {
            ...lastPopped.item,
            counterRange,
            timestamp: now,
          };
        } else {
          item = {
            counterRange,
            message: '',
            action: 'unknown',
            timestamp: now,
            mergeCount: 1,
          };
        }
        redoStack.push(item);
      }

      lastPopped = null;
      return { value: item as any, cursors: [] };
    },
    onPop: (isUndo, value, _counterRange) => {
      if (isUndo) {
        const popped = undoStack.pop();
        lastPopped = { source: 'undo', item: popped || (value?.value as unknown as UndoStackItem) };
      } else {
        const popped = redoStack.pop();
        lastPopped = { source: 'redo', item: popped || (value?.value as unknown as UndoStackItem) };
      }
    },
  });

  return undoManagerInstance;
}

/**
 * Get the current UndoManager instance.
 */
export function getUndoManager(): UndoManager | null {
  return undoManagerInstance;
}

/**
 * 次に実行されるUndoの対象アイテムを取得
 */
export function getNextUndoItem(): UndoStackItem | null {
  if (!undoManagerInstance || !undoManagerInstance.canUndo()) {
    return null;
  }
  return undoStack[undoStack.length - 1] || null;
}

/**
 * 次に実行されるRedoの対象アイテムを取得
 */
export function getNextRedoItem(): UndoStackItem | null {
  if (!undoManagerInstance || !undoManagerInstance.canRedo()) {
    redoStack.length = 0;
    return null;
  }
  return redoStack[redoStack.length - 1] || null;
}

/**
 * Perform undo.
 */
export function undo(): { success: boolean; item: UndoStackItem | null } {
  if (!undoManagerInstance) return { success: false, item: null };
  const targetItem = getNextUndoItem();
  const success = undoManagerInstance.undo();
  return { success, item: success ? targetItem : null };
}

/**
 * Perform redo.
 */
export function redo(): { success: boolean; item: UndoStackItem | null } {
  if (!undoManagerInstance) return { success: false, item: null };
  const targetItem = getNextRedoItem();
  const success = undoManagerInstance.redo();
  return { success, item: success ? targetItem : null };
}

/**
 * Set up global keyboard shortcuts for undo/redo.
 * Returns a cleanup function.
 */
export function setupUndoKeyBindings(): () => void {
  const handler = (e: KeyboardEvent) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if (!isCtrlOrMeta) return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

/**
 * Destroy the UndoManager instance.
 */
export function destroyUndoManager(): void {
  undoManagerInstance = null;
  undoStack.length = 0;
  redoStack.length = 0;
  lastPopped = null;
}

export interface UndoRedoTargetInfo {
  action: UndoStackItem['action'];
  blockId?: string;
  nodeIndex?: number;
  domId?: string;
  panel: 'doc' | 'chat';
  locationLabel: string;
  actionLabel: string;
  snippet: string;
  fullDescription: string;
}

export function getActionLabel(action: UndoStackItem['action']): string {
  switch (action) {
    case 'edit': return 'テキスト編集';
    case 'chat': return 'チャット投稿';
    case 'doc': return '新しい行の追加';
    case 'delete': return '行の削除';
    case 'clear': return '行のクリア';
    case 'indent': return 'インデント変更';
    case 'format-style': return 'スタイル変更';
    case 'move': return '行の移動';
    case 'reaction': return 'リアクション変更';
    case 'merge': return '行の結合';
    case 'hashtag': return 'タグの追加';
    case 'emphasis': return '強調設定の変更';
    default: return '変更操作';
  }
}

/**
 * UndoStackItem と現在の nodes 一覧から、UI 表示およびハイライト用のターゲット情報を解決
 */
export function resolveTargetInfo(
  item: UndoStackItem | null,
  nodes: StreamNodeWithIndex[]
): UndoRedoTargetInfo | null {
  if (!item) return null;

  const found = item.blockId ? nodes.find(n => n.node.blockId === item.blockId || n.id === item.blockId) : undefined;

  let panel: 'doc' | 'chat' = 'doc';
  let nodeIndex: number | undefined = undefined;
  let domId: string | undefined = undefined;
  let locationLabel = 'ドキュメント';

  if (found) {
    nodeIndex = found.index;
    panel = found.node.type === 'chat' ? 'chat' : 'doc';
    domId = panel === 'doc' ? `doc-block-${found.index}` : `chat-message-${found.index}`;
    locationLabel = panel === 'chat' ? 'チャット' : `行 ${found.index + 1}`;
  } else {
    if (item.action === 'chat') {
      panel = 'chat';
      locationLabel = 'チャット';
    } else {
      panel = 'doc';
      if (item.details && /^\d+$/.test(item.details)) {
        const idx = parseInt(item.details, 10);
        nodeIndex = idx;
        locationLabel = `行 ${idx + 1}`;
        domId = `doc-block-${idx}`;
      } else {
        locationLabel = 'ドキュメント';
      }
    }
  }

  const rawSnippet = (item.textSnippet || (found ? found.node.content : '') || '').replace(/\s+/g, ' ').trim();
  const shortSnippet = rawSnippet.length > 25 ? `${rawSnippet.slice(0, 25)}…` : rawSnippet;
  const actionLabel = getActionLabel(item.action);

  const fullDescription = shortSnippet
    ? `${locationLabel}「${shortSnippet}」の${actionLabel}`
    : `${locationLabel}の${actionLabel}`;

  return {
    action: item.action,
    blockId: item.blockId,
    nodeIndex,
    domId,
    panel,
    locationLabel,
    actionLabel,
    snippet: shortSnippet,
    fullDescription,
  };
}

