import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

export interface BlockStatePreview {
  content: string;
  indent?: number;
  heading?: string | null;
  emphasis?: number;
  isDeleted?: boolean;
}

export interface CautiousConfirmOptions {
  actionLabel: string;
  authorName?: string;
  ownerName?: string; // 後方互換性のため維持
  beforeBlock?: BlockStatePreview;
  afterBlock?: BlockStatePreview;
  contentPreview?: string;
}

type ConfirmResolver = (value: boolean) => void;

interface CautiousConfirmContextType {
  confirmCautiousEdit: (options: CautiousConfirmOptions) => Promise<boolean>;
  isModalOpen: boolean;
}

const CautiousConfirmContext = createContext<CautiousConfirmContextType>({
  confirmCautiousEdit: () => Promise.resolve(true),
  isModalOpen: false,
});

export const useCautiousConfirm = () => useContext(CautiousConfirmContext);

interface CautiousConfirmProviderProps {
  children: React.ReactNode;
}

export const CautiousConfirmProvider: React.FC<CautiousConfirmProviderProps> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: CautiousConfirmOptions | null;
  }>({
    isOpen: false,
    options: null,
  });

  const resolverRef = useRef<ConfirmResolver | null>(null);
  const isPendingRef = useRef<boolean>(false);

  const confirmCautiousEdit = useCallback((options: CautiousConfirmOptions): Promise<boolean> => {
    // 多重呼び出し防止: 既にモーダルが開いている場合は、新しいリクエストを即座にキャンセル(false)とする
    if (isPendingRef.current) {
      return Promise.resolve(false);
    }

    isPendingRef.current = true;
    setModalState({ isOpen: true, options });

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleResponse = (value: boolean) => {
    setModalState({ isOpen: false, options: null });
    isPendingRef.current = false;

    if (resolverRef.current) {
      const resolve = resolverRef.current;
      resolverRef.current = null;

      // フォーカス復帰などのレンダリング待ちを確実にするため、マイクロタスク後に resolve
      requestAnimationFrame(() => {
        setTimeout(() => {
          resolve(value);
        }, 0);
      });
    }
  };

  const renderBlockCard = (block: BlockStatePreview, type: 'before' | 'after') => {
    const indent = block.indent || 0;
    const isH1 = block.heading === 'h1';
    const isFade = block.emphasis === -1;
    const displayText = block.content || '(空のブロック)';

    return (
      <div className={`cautious-block-preview-box cautious-block-preview-box--${type}`}>
        <div
          className={`cautious-block-preview-row ${block.isDeleted ? 'cautious-block-preview-row--deleted' : ''}`}
          style={{ marginLeft: `${indent * 24}px` }}
        >
          <div className="cautious-block-preview-mark">
            {indent === 1 ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 1.5l4 3.5-4 3.5" />
              </svg>
            ) : indent >= 2 ? (
              <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 1.5l4 3.5-4 3.5 M9 1.5l4 3.5-4 3.5" />
              </svg>
            ) : (
              <span className="cautious-block-preview-circle" />
            )}
          </div>
          <div
            className={`cautious-block-preview-text ${isH1 ? 'cautious-block-preview-text--h1' : isFade ? 'cautious-block-preview-text--fade' : ''}`}
          >
            {displayText}
          </div>
        </div>
      </div>
    );
  };

  const authorDisplayName = modalState.options?.authorName || modalState.options?.ownerName || '';

  return (
    <CautiousConfirmContext.Provider
      value={{
        confirmCautiousEdit,
        isModalOpen: modalState.isOpen,
      }}
    >
      {children}
      {modalState.isOpen && modalState.options && (
        <div className="cautious-confirm-overlay" onClick={() => handleResponse(false)}>
          <div
            className="cautious-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="cautious-confirm-header">
              <h3 className="cautious-confirm-header__title">共有ブロックの変更確認</h3>
            </div>
            <div className="cautious-confirm-body">
              <p className="cautious-confirm-description">
                他のメンバーと共有しているブロックを編集しようとしています。この変更内容は、<strong>全てのユーザーの画面に反映されます</strong>。
              </p>

              <div className="cautious-confirm-fields">
                <div className="cautious-confirm-field-row">
                  <span className="cautious-confirm-label">共有メンバー：</span>
                  <span className="cautious-confirm-value">{authorDisplayName}</span>
                </div>
                <div className="cautious-confirm-field-row">
                  <span className="cautious-confirm-label">変更の種類：</span>
                  <span className="cautious-confirm-value">{modalState.options.actionLabel}</span>
                </div>
              </div>

              {/* 対象のブロックの編集前後 */}
              {modalState.options.beforeBlock ? (
                <div className="cautious-confirm-diff-section">
                  <div className="cautious-confirm-diff-container">
                    {renderBlockCard(modalState.options.beforeBlock, 'before')}
                    {modalState.options.afterBlock && (
                      <>
                        <div className="cautious-confirm-diff-arrow">↓</div>
                        {renderBlockCard(modalState.options.afterBlock, 'after')}
                      </>
                    )}
                  </div>
                </div>
              ) : modalState.options.contentPreview ? (
                <div className="cautious-confirm-preview">
                  {modalState.options.contentPreview}
                </div>
              ) : null}
            </div>
            <div className="cautious-confirm-actions">
              <button
                type="button"
                className="cautious-confirm-btn cautious-confirm-btn--cancel"
                onClick={() => handleResponse(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="cautious-confirm-btn cautious-confirm-btn--confirm"
                onClick={() => handleResponse(true)}
                autoFocus
              >
                変更を反映する
              </button>
            </div>
          </div>
        </div>
      )}
    </CautiousConfirmContext.Provider>
  );
};
