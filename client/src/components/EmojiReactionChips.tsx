import React from 'react';
import { aggregateEmojiReactions, formatReactionCount } from '../utils/reactionUtils';

interface EmojiReactionChipsProps {
  emojiReactions: Record<string, boolean> | undefined;
  currentUserId: string;
  onToggleEmoji?: (emoji: string) => void;
  disabled?: boolean;
  variant?: 'chat' | 'doc';
}

export const EmojiReactionChips: React.FC<EmojiReactionChipsProps> = ({
  emojiReactions,
  currentUserId,
  onToggleEmoji,
  disabled = false,
  variant = 'chat',
}) => {
  const { visibleChips, remainingCount } = aggregateEmojiReactions(emojiReactions, currentUserId, 6);

  if (visibleChips.length === 0) {
    return null;
  }

  const handleChipClick = (emoji: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !onToggleEmoji) return;
    onToggleEmoji(emoji);
  };

  return (
    <div
      className={`emoji-reaction-chips emoji-reaction-chips--${variant}`}
      contentEditable={false}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleChips.map(({ emoji, count, hasReacted }) => (
        <button
          key={emoji}
          type="button"
          className={`emoji-reaction-chip ${hasReacted ? 'emoji-reaction-chip--active' : ''}`}
          onClick={(e) => handleChipClick(emoji, e)}
          disabled={disabled || !onToggleEmoji}
          title={disabled ? undefined : `${emoji} を${hasReacted ? '取り消す' : 'リアクションする'}`}
          aria-label={`${emoji} ${count}件`}
        >
          <span className="emoji-reaction-chip__emoji">{emoji}</span>
          <span className="emoji-reaction-chip__count">{formatReactionCount(count)}</span>
        </button>
      ))}
      {remainingCount > 0 && (
        <span
          className="emoji-reaction-chip emoji-reaction-chip--more"
          title={`他 ${remainingCount} 種類の絵文字`}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
};
