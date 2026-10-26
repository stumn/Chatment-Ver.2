import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { EmojiClickData } from 'emoji-picker-react';

const PICKER_WIDTH = 240;
const PICKER_HEIGHT = 280;

const LazyEmojiPicker = React.lazy(() => import('emoji-picker-react'));

interface EmojiReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  buttonRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  }>({ right: 0 });

  useEffect(() => {
    if (!isOpen) return;

    if (buttonRef?.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const rightOffset = window.innerWidth - rect.right;

      if (spaceBelow >= PICKER_HEIGHT || spaceBelow >= spaceAbove) {
        setPos({ top: rect.bottom + 8, right: rightOffset });
      } else {
        setPos({ bottom: window.innerHeight - rect.top + 8, right: rightOffset });
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen) return null;

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onSelectEmoji(emojiData.emoji);
    onClose();
  };

  // document.body に直接マウント → isolation: isolate の親コンテキストを完全脱出
  return ReactDOM.createPortal(
    <div
      ref={containerRef}
      className="emoji-reaction-picker-popover"
      style={{
        position: 'fixed',
        top: pos.top,
        bottom: pos.bottom,
        right: pos.right,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <React.Suspense
        fallback={
          <div className="emoji-picker-loading">絵文字を読み込み中...</div>
        }
      >
        <LazyEmojiPicker
          onEmojiClick={handleEmojiClick}
          skinTonesDisabled
          searchPlaceholder="絵文字を検索..."
          lazyLoadEmojis
          columns={9}
          width={PICKER_WIDTH}
          height={PICKER_HEIGHT}
          previewConfig={{ showPreview: false }}
          style={
            {
              '--epr-emoji-size': '22px',
              '--epr-category-navigation-button-size': '20px',
              '--epr-search-input-height': '26px',
            } as React.CSSProperties
          }
        />
      </React.Suspense>
    </div>,
    document.body,
  );
};
