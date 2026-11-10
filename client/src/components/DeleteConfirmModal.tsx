import React, { useEffect, useRef } from 'react';
import type { StreamNodeWithIndex, AuthorInfo, StreamNode } from '../types';
import type { LoroDoc, LoroMap } from 'loro-crdt';
import { getStream, deleteDocNode } from '../loro/schema';
import { emitUserAction } from '../loro/sync-client';
import { POST_MENU_CONFIG } from '../config/postMenuConfig';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  nodeWithIndex: StreamNodeWithIndex | null;
  doc: LoroDoc | null;
  currentUserId: string;
  currentAuthorInfo: AuthorInfo;
  onClose: () => void;
  onAfterEdit: () => void;
}

/**
 * 共同編集者の表示文字列を組み立てるヘルパー
 */
export function formatSubAuthorsWarning(
  subAuthors: AuthorInfo[] | undefined | null,
  currentUserId: string,
  maxShown: number = POST_MENU_CONFIG.MAX_SUB_AUTHORS_SHOWN
): { isEditedByOthers: boolean; text: string | null } {
  if (!subAuthors || !Array.isArray(subAuthors)) {
    return { isEditedByOthers: false, text: null };
  }

  // 自分以外の共同編集者（displayName が存在する人のみ）
  const others = subAuthors.filter(
    (sa) => sa && sa.userId !== currentUserId && typeof sa.displayName === 'string' && sa.displayName.trim() !== ''
  );

  // displayName の重複を除去
  const uniqueNames: string[] = [];
  const seen = new Set<string>();
  for (const sa of others) {
    if (!seen.has(sa.displayName)) {
      seen.add(sa.displayName);
      uniqueNames.push(sa.displayName);
    }
  }

  if (uniqueNames.length === 0) {
    return { isEditedByOthers: false, text: null };
  }

  let namesText = '';
  if (uniqueNames.length <= maxShown) {
    namesText = uniqueNames.map((name) => `${name}さん`).join('、');
  } else {
    const shown = uniqueNames.slice(0, maxShown).map((name) => `${name}さん`).join('、');
    const remaining = uniqueNames.length - maxShown;
    namesText = `${shown}ほか${remaining}人`;
  }

  return {
    isEditedByOthers: true,
    text: `この行は、${namesText}も編集しています。`,
  };
}

/**
 * リアクション件数を集計するヘルパー
 */
export function countNodeReactions(
  node: StreamNode,
  mode: 'all' | 'emoji-only' | 'votes-only' = POST_MENU_CONFIG.REACTION_COUNT_MODE
): number {
  let count = 0;
  if (mode === 'all' || mode === 'votes-only') {
    if ('reactions' in node && node.reactions) {
      count += Object.values(node.reactions).length;
    }
  }
  if (mode === 'all' || mode === 'emoji-only') {
    if ('emojiReactions' in node && node.emojiReactions) {
      count += Object.values(node.emojiReactions).filter((v) => v === true).length;
    }
  }
  return count;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  nodeWithIndex,
  doc,
  currentUserId,
  currentAuthorInfo,
  onClose,
  onAfterEdit,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // キーボード操作（Escで閉じる）
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, nodeWithIndex]);

  // モーダルが開いた際にキャンセルボタンに自動フォーカス
  useEffect(() => {
    if (isOpen) {
      // 次のレンダリングフレームでフォーカスを確実に適用
      requestAnimationFrame(() => {
        cancelBtnRef.current?.focus();
      });
    }
  }, [isOpen]);

  if (!isOpen || !nodeWithIndex) {
    return null;
  }

  const { node } = nodeWithIndex;
  const subAuthorsResult = formatSubAuthorsWarning(node.subAuthors, currentUserId);
  const reactionCount = countNodeReactions(node);

  const handleCancel = () => {
    // 操作ログ記録（確認ダイアログで「キャンセル」）
    emitUserAction({
      type: 'post-delete-cancel',
      targetId: node.blockId,
      contentPreview: (node.content || '').substring(0, 100),
      actionDetails: `投稿削除のキャンセル`,
      before: {
        content: node.content || '',
        nodeType: node.type,
        isEditedByOthers: subAuthorsResult.isEditedByOthers ? 'はい' : 'いいえ',
        reactionCount,
        dialogAction: 'キャンセル',
      },
      after: null,
    });
    onClose();
  };

  const handleConfirmDelete = () => {
    if (!doc) {
      onClose();
      return;
    }

    // ストリーム内で最新のブロックインデックスを探索
    const stream = getStream(doc);
    let currentIndex = -1;
    for (let i = 0; i < stream.length; i++) {
      const map = stream.get(i) as LoroMap;
      if (map && map.get('blockId') === node.blockId) {
        currentIndex = i;
        break;
      }
    }

    // 5.4 同時に操作したとき: ダイアログを開いている間にほかの人が消した場合はエラーを出さず閉じる
    if (currentIndex === -1) {
      onClose();
      return;
    }

    // 操作ログ記録（確認ダイアログで「削除」）
    emitUserAction({
      type: 'post-delete',
      targetId: node.blockId,
      contentPreview: (node.content || '').substring(0, 100),
      actionDetails: `投稿の削除: "${node.content || ''}"`,
      before: {
        content: node.content || '',
        nodeType: node.type,
        isEditedByOthers: subAuthorsResult.isEditedByOthers ? 'はい' : 'いいえ',
        reactionCount,
        dialogAction: '削除',
      },
      after: null,
    });

    // 5.1 削除の対象: 既存の「ドキュメントで全文を消すと、行が消える」処理と同じ deleteDocNode を使用
    deleteDocNode(doc, currentIndex, currentAuthorInfo);
    onAfterEdit();
    onClose();
  };

  return (
    <div
      className="delete-confirm-overlay"
      onClick={handleCancel}
      role="presentation"
    >
      <div
        className="delete-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <div className="delete-confirm-body">
          <p id="delete-confirm-title" className="delete-confirm-text delete-confirm-text--primary">
            この投稿を削除しますか？
          </p>
          <p className="delete-confirm-text delete-confirm-text--secondary">
            チャットとドキュメントの両方から消えます。
          </p>

          {subAuthorsResult.text && (
            <p className="delete-confirm-text delete-confirm-text--subauthors">
              {subAuthorsResult.text}
            </p>
          )}

          {reactionCount > 0 && (
            <p className="delete-confirm-text delete-confirm-text--reactions">
              この投稿には、リアクションが{reactionCount}件付いています。
            </p>
          )}
        </div>

        <div className="delete-confirm-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="delete-confirm-btn delete-confirm-btn--cancel"
            onClick={handleCancel}
            autoFocus
          >
            キャンセル
          </button>
          <button
            type="button"
            className="delete-confirm-btn delete-confirm-btn--delete"
            onClick={handleConfirmDelete}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
};

