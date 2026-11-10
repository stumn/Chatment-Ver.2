import React, { useState, useRef, useEffect } from 'react';
import { useThemeCustomization } from '../contexts/ThemeCustomizationContext';

export const ThemeCustomizationMenu: React.FC = () => {
  const { themeSettings, updateSetting, resetToDefault } = useThemeCustomization();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="theme-custom-menu-container" ref={containerRef}>
      <button
        type="button"
        className={`toolbar-btn theme-custom-toggle-btn ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="テーマをカスタマイズ"
        aria-label="テーマをカスタマイズ"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2a10 10 0 0 0-10 10c0 4.42 3.58 8 8 8 1.1 0 2-.9 2-2 0-.55-.22-1.05-.59-1.41-.36-.37-.59-.87-.59-1.41 0-1.1.9-2 2-2h2.17c3.77 0 6.83-3.06 6.83-6.83C21.82 4.9 17.42 2 12 2z" />
          <circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" />
          <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
          <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div className="theme-custom-popover" role="dialog" aria-label="テーマ設定メニュー">
          <div className="theme-custom-popover__header">
            <div className="theme-custom-popover__title-group">
              <div className="theme-custom-popover__title">
                <span>リアクション投稿の表示</span>
              </div>
              <button
                type="button"
                className="theme-custom-header-reset-btn"
                onClick={resetToDefault}
                title="初期状態のデフォルトテーマに戻す"
              >
                デフォルトに戻す
              </button>
            </div>
            <button
              type="button"
              className="theme-custom-popover__close"
              onClick={() => setIsOpen(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>

          <div className="theme-custom-popover__body">
            {/* 背景   */}
            <div className="theme-custom-option">
              <div className="theme-custom-option__info">
                <div className="theme-custom-option__title">投稿の背景色</div>
              </div>
              <div className="theme-custom-segmented">
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.bgStyle === 'solid' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('bgStyle', 'solid')}
                >
                  <span className="theme-preview-box theme-preview-box--solid" aria-hidden="true" />
                  通常
                </button>
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.bgStyle === 'gradient' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('bgStyle', 'gradient')}
                >
                  <span className="theme-preview-box theme-preview-box--gradient" aria-hidden="true" />
                  グラデーション
                </button>
              </div>
            </div>

            {/* 背景の濃さ */}
            <div className="theme-custom-option">
              <div className="theme-custom-option__info">
                <div className="theme-custom-option__title">背景色の濃さ</div>
              </div>
              <div className="theme-custom-segmented">
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.bgIntensity === 'normal' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('bgIntensity', 'normal')}
                >
                  <span className="theme-preview-box theme-preview-box--normal" aria-hidden="true" />
                  通常
                </button>
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.bgIntensity === 'soft' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('bgIntensity', 'soft')}
                >
                  <span className="theme-preview-box theme-preview-box--soft" aria-hidden="true" />
                  全体薄め
                </button>
              </div>
            </div>

            {/* ストライプ */}
            <div className="theme-custom-option">
              <div className="theme-custom-option__info">
                <div className="theme-custom-option__title">ストライプ</div>
              </div>
              <div className="theme-custom-segmented">
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.stripes === 'none' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('stripes', 'none')}
                >
                  <span className="theme-preview-box theme-preview-box--no-stripe" aria-hidden="true" />
                  なし
                </button>
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.stripes === 'stripe' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('stripes', 'stripe')}
                >
                  <span className="theme-preview-box theme-preview-box--stripe" aria-hidden="true" />
                  あり
                </button>
              </div>
            </div>

            {/* 絵文字マークの見た目 */}
            <div className="theme-custom-option">
              <div className="theme-custom-option__info">
                <div className="theme-custom-option__title">絵文字バッジ</div>
              </div>
              <div className="theme-custom-segmented">
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.reactionIcon === 'smile' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('reactionIcon', 'smile')}
                >
                  <span className="theme-preview-box theme-preview-box--smile" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="11" height="11">
                      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
                      <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
                      <path d="M8.5 14c1.8 2.2 5.2 2.2 7 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  ニコちゃん
                </button>
                <button
                  type="button"
                  className={`theme-custom-segmented__btn ${themeSettings.reactionIcon === 'none' ? 'is-active' : ''}`}
                  onClick={() => updateSetting('reactionIcon', 'none')}
                >
                  <span className="theme-preview-box theme-preview-box--none" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" />
                      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" />
                    </svg>
                  </span>
                  非表示
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
