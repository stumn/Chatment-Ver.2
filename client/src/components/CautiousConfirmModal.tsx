import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

export interface CautiousConfirmOptions {
  actionLabel: string;
  ownerName: string;
  contentPreview: string;
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
              <span className="cautious-confirm-header__icon">⚠️</span>
              <h3 className="cautious-confirm-header__title">編集の確認</h3>
            </div>
            <div className="cautious-confirm-body">
              <p>
                このブロックの所有者は「<strong>{modalState.options.ownerName}</strong>」です。
              </p>
              <p>
                対象: <strong>{modalState.options.actionLabel}</strong>
              </p>
              {modalState.options.contentPreview && (
                <div className="cautious-confirm-preview">
                  {modalState.options.contentPreview}
                </div>
              )}
              <p style={{ marginTop: '12px', fontSize: '0.88rem' }}>
                この変更を実行してもよろしいですか？
              </p>
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
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </CautiousConfirmContext.Provider>
  );
};
