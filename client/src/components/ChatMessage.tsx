import React, { useState, useRef } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { addReaction, toggleEmojiReaction } from '../loro/schema';
import { EmojiReactionChips } from './EmojiReactionChips';
import { EmojiReactionPicker } from './EmojiReactionPicker';

interface ChatMessageProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  isOwn: boolean;
  userId: string;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  nodeWithIndex,
  doc,
  isOwn,
  userId,
  onAfterEdit,
  onJumpToNode,
}) => {
  const { node, index } = nodeWithIndex;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const handleVote = (emoji: '⇧' | '⇩', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!doc) return;
    const newEmoji = myReaction === emoji ? '' : emoji;
    addReaction(doc, index, userId, newEmoji);
    onAfterEdit();
  };

  const handleToggleEmoji = (emoji: string) => {
    if (!doc) return;
    toggleEmojiReaction(doc, index, userId, emoji);
    onAfterEdit();
  };

  const handleSelectEmojiFromPicker = (emoji: string) => {
    if (emoji === '👍') {
      handleVote('⇧');
    } else if (emoji === '👎') {
      handleVote('⇩');
    } else {
      handleToggleEmoji(emoji);
    }
  };

  let upvotes = 0;
  let downvotes = 0;
  let myReaction = '';

  if ('reactions' in node && node.reactions) {
    Object.entries(node.reactions).forEach(([uid, emoji]) => {
      if (emoji === '⇧') upvotes++;
      if (emoji === '⇩') downvotes++;
      if (uid === userId) myReaction = emoji as string;
    });
  }

  const voteScore = upvotes - downvotes;

  const baseEmphasis = 'emphasis' in node && node.emphasis !== undefined ? node.emphasis : 0;
  const emphasisClass = baseEmphasis > 0 ? 'text-emphasis-1' : baseEmphasis < 0 ? 'text-emphasis-minus1' : 'text-emphasis-0';

  let dynamicStyle: React.CSSProperties = {};
  if (voteScore > 0) {
    dynamicStyle = {
      color: 'hsl(130, 60%, 45%)',
      fontSize: `calc(var(--font-size-base) + ${voteScore * 1.5}px)`,
      transition: 'all 0.3s ease'
    };
  } else if (voteScore < 0) {
    dynamicStyle = {
      color: 'hsl(0, 70%, 55%)',
      fontSize: `max(10px, calc(var(--font-size-base) - ${Math.abs(voteScore)}px))`,
      transition: 'all 0.3s ease'
    };
  }

  const isChat = node.type === 'chat';
  const typeClass = isChat ? 'chat-message--chat' : 'chat-message--doc';

  // #始まりのコンテンツは見出しとして扱う（全角半角対応）
  const content = node.content;
  const isHeading = (node as any).heading === 'h1' || /^[#＃]/.test(content);
  const headingClass = isHeading ? 'chat-message--heading-h1' : '';

  // URL を検出してリンクに変換
  const renderWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: 'var(--accent-primary)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  };

  return (
    <div
      className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'} ${typeClass} ${headingClass}`}
      id={`chat-message-${index}`}
      onClick={() => onJumpToNode(index, 'doc', 'chat-message')}
      style={{ cursor: 'pointer' }}
      title="クリックしてドキュメントへジャンプ"
    >
      <div className="chat-message__body">
        <div className="chat-message__header">
          <span className="chat-message__time">{formatTime(node.timestamp)}</span>
          <span className="chat-message__author">{node.author.displayName}</span>
        </div>
        <div className={`chat-message__content ${emphasisClass}`} style={dynamicStyle}>
          {renderWithLinks(content)}
        </div>
        <EmojiReactionChips
          emojiReactions={node.emojiReactions}
          currentUserId={userId}
          onToggleEmoji={handleToggleEmoji}
          variant="chat"
        />
      </div>

      {!isHeading && (
        <div className="chat-message__side-actions" onClick={(e) => e.stopPropagation()}>
          <div className="chat-message__reaction-list">
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--upvote ${myReaction === '⇧' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇧', e)}
                  title="いいね (Upvote)"
              aria-label="いいね"
            >
              👍 {upvotes > 0 && upvotes}
            </button>
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--downvote ${myReaction === '⇩' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇩', e)}
              title="よくないね (Downvote)"
              aria-label="よくないね"
            >
              👎 {downvotes > 0 && downvotes}
            </button>
            <div className="chat-message__picker-container">
              <button
                ref={addButtonRef}
                className={`chat-message__reaction-badge chat-message__reaction-badge--add ${isPickerOpen ? 'chat-message__reaction-badge--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPickerOpen((prev) => !prev);
                }}
                title="絵文字を追加"
                aria-label="絵文字リアクションを追加"
              >
                ＋
              </button>
              <EmojiReactionPicker
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelectEmoji={handleSelectEmojiFromPicker}
                buttonRef={addButtonRef}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
