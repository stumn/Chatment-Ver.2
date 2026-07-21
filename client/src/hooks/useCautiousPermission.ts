import { useRef, useCallback, type RefObject } from 'react';
import type { AuthorInfo, StreamNode } from '../types';
import { useCautiousConfirm } from '../components/CautiousConfirmModal';

interface UseCautiousPermissionProps {
  contentRef: RefObject<HTMLDivElement | null>;
  isCautiousMode?: boolean;
  node: StreamNode;
  currentAuthorInfo: AuthorInfo;
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
   */
  const requestCautiousEditAsync = useCallback(async (actionLabel: string): Promise<boolean> => {
    if (!isCautiousMode) return true;

    const isFirstAuthor = blockAuthor.userId === currentAuthorInfo.userId && blockAuthor.userId !== '';
    const isSubAuthor = blockSubAuthors.some(sa => sa.userId === currentAuthorInfo.userId && sa.userId !== '');
    if (isFirstAuthor || isSubAuthor) return true;
    if (!blockAuthor.displayName) return true; // 空ブロック
    if (hasEditPermissionRef.current) return true;

    const subNames = blockSubAuthors.map(sa => sa.displayName).filter(Boolean);
    const ownerName = blockAuthor.displayName + (subNames.length > 0 ? ` と ${subNames.join('・')}` : '');
    const contentPreview = node.content ? `「${node.content.substring(0, 15)}${node.content.length > 15 ? '…' : ''}」` : 'このブロック';

    const ok = await confirmCautiousEdit({
      actionLabel,
      ownerName,
      contentPreview,
    });

    if (ok) {
      hasEditPermissionRef.current = true;
      restoreFocus();
      return true;
    }
    isCanceledRef.current = true;
    restoreFocus();
    return false;
  }, [isCautiousMode, blockAuthor, blockSubAuthors, currentAuthorInfo, node.content, confirmCautiousEdit, restoreFocus]);

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
