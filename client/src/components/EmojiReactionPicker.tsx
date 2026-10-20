import React, { useEffect, useRef } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import { PRESET_REACTIONS } from '../types';

const LazyEmojiPicker = React.lazy(() => import('emoji-picker-react'));

// 👍 を除いたクイックリアクション候補
const QUICK_EMOJIS = PRESET_REACTIONS.filter((e) => e !== '👍');

interface EmojiReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onSelectEmoji(emojiData.emoji);
    onClose();
  };

  const handleQuickClick = (emoji: string) => {
    onSelectEmoji(emoji);
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="emoji-reaction-picker-popover"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="emoji-reaction-picker-quick">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-reaction-quick-btn"
            onClick={() => handleQuickClick(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="emoji-reaction-picker-body">
        <React.Suspense fallback={<div className="emoji-picker-loading">絵文字を読み込み中...</div>}>
          <LazyEmojiPicker
            onEmojiClick={handleEmojiClick}
            skinTonesDisabled={true}
            searchPlaceholder="絵文字を検索..."
            lazyLoadEmojis={true}
            width={320}
            height={360}
            previewConfig={{ showPreview: false }}
          />
        </React.Suspense>
      </div>
    </div>
  );
};
