import { useRef, useCallback, type RefObject } from 'react';
import type { AuthorInfo, StreamNode } from '../types';
import { useCautiousConfirm, type BlockStatePreview } from '../components/CautiousConfirmModal';

interface UseCautiousPermissionProps {
  contentRef: RefObject<HTMLDivElement | null>;
  isCautiousMode?: boolean;
  node: StreamNode;
  currentAuthorInfo: AuthorInfo;
}

export interface CautiousEditAfterState {
  content?: string;
  indent?: number;
  heading?: string | null;
  emphasis?: number;
  isDeleted?: boolean;
}

export function useCautiousPermission({
  contentRef,
  isCautiousMode,
  node,
  currentAuthorInfo,
}: UseCautiousPermissionProps) {
  const hasEditPermissionRef = useRef(false);
  const isCanceledRef = useRef(false);

  const { confirmCautiousEdit } = useCautiousConfirm();

  const blockAuthor: AuthorInfo = node.author;
  const blockSubAuthors = node.subAuthors || [];

  /**
   * モーダル閉了後にプログラム的にフォーカスを安定して復帰させる
   */
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 10);
    });
  }, [contentRef]);

  /**
   * 慎重モードの許可チェック (非同期 Promise ベース)
   * actionLabel: ダイアログに表示する操作の説明
   * afterState: 変更後のブロック状態（省略時は操作に応じたデフォルト差分）
   */
  const requestCautiousEditAsync = useCallback(async (
    actionLabel: string,
    afterState?: CautiousEditAfterState
  ): Promise<boolean> => {
    if (!isCautiousMode) return true;

    const isFirstAuthor = blockAuthor.userId === currentAuthorInfo.userId && blockAuthor.userId !== '';
    const isSubAuthor = blockSubAuthors.some(sa => sa.userId === currentAuthorInfo.userId && sa.userId !== '');
    if (isFirstAuthor || isSubAuthor) return true;
    if (!blockAuthor.displayName) return true; // 空ブロック
    if (hasEditPermissionRef.current) return true;

    const subNames = blockSubAuthors.map(sa => sa.displayName).filter(Boolean);
    const authorName = [blockAuthor.displayName, ...subNames].filter(Boolean).join('，');

    // 現在（編集前）のブロック情報 (DOM ではなく元の Loro node データから取得)
    const beforeBlock: BlockStatePreview = {
      content: node.content || '',
      indent: node.indent || 0,
      heading: node.heading ?? null,
      emphasis: node.emphasis ?? 0,
    };

    // 編集後のブロック情報（引数 afterState または アクション名に基づく自動構築）
    let afterBlock: BlockStatePreview | undefined = afterState ? {
      content: afterState.content ?? beforeBlock.content,
      indent: afterState.indent ?? beforeBlock.indent,
      heading: afterState.heading !== undefined ? afterState.heading : beforeBlock.heading,
      emphasis: afterState.emphasis !== undefined ? afterState.emphasis : beforeBlock.emphasis,
      isDeleted: afterState.isDeleted ?? false,
    } : undefined;

    if (!afterBlock) {
      if (actionLabel.includes('削除')) {
        afterBlock = { ...beforeBlock, isDeleted: true };
      } else if (actionLabel.includes('分割')) {
        afterBlock = { content: '(2つのブロックに分割)', indent: beforeBlock.indent, heading: beforeBlock.heading };
      } else if (actionLabel.includes('マージ')) {
        afterBlock = { content: '(隣接ブロックと統合)', indent: beforeBlock.indent, heading: beforeBlock.heading };
      } else if (actionLabel.includes('インデント')) {
        afterBlock = { ...beforeBlock, indent: ((beforeBlock.indent || 0) + 1) % 3 };
      } else {
        // テキスト編集など一般的な操作の場合（省略せずにそのまま全文表示）
        afterBlock = {
          ...beforeBlock,
          content: beforeBlock.content,
        };
      }
    }

    const ok = await confirmCautiousEdit({
      actionLabel,
      authorName,
      beforeBlock,
      afterBlock,
    });

    if (ok) {
      hasEditPermissionRef.current = true;
      restoreFocus();
      return true;
    }
    isCanceledRef.current = true;
    restoreFocus();
    return false;
  }, [isCautiousMode, blockAuthor, blockSubAuthors, currentAuthorInfo, node, contentRef, confirmCautiousEdit, restoreFocus]);

  const resetPermission = useCallback(() => {
    hasEditPermissionRef.current = false;
  }, []);

  return {
    hasEditPermissionRef,
    isCanceledRef,
    requestCautiousEditAsync,
    restoreFocus,
    resetPermission,
  };
}
