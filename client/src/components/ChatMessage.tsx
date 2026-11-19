import React, { useState, useRef } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { addReaction, toggleEmojiReaction } from '../loro/schema';
import { EmojiReactionChips } from './EmojiReactionChips';
import { EmojiReactionPicker } from './EmojiReactionPicker';
import { PostActionMenu } from './PostActionMenu';
import {
  calculateReactionStats,
  calculateLevel,
  calculateStep,
  formatReactionCount,
} from '../utils/reactionUtils';
import { useRoom } from '../contexts/RoomContext';

interface ChatMessageProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  isOwn: boolean;
  userId: string;
  isMenuOpen?: boolean;
  onToggleMenu?: (open: boolean) => void;
  onRequestDelete?: () => void;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
  isMobile?: boolean;
}

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  nodeWithIndex,
  doc,
  isOwn,
  userId,
  isMenuOpen = false,
  onToggleMenu,
  onRequestDelete,
  onAfterEdit,
  onJumpToNode,
  isMobile = false,
}) => {
  const { node, index, id } = nodeWithIndex;
  const { R } = useRoom();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const myReaction = (node.reactions && node.reactions[userId]) || '';

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

  // 共通ユーティリティから集計
  const stats = calculateReactionStats(node);
  const { up: upvotes, down: downvotes, voteScore } = stats;

  const level = calculateLevel(voteScore, R);
  const step = calculateStep(level);

  const baseEmphasis = 'emphasis' in node && node.emphasis !== undefined ? node.emphasis : 0;
  const emphasisClass = baseEmphasis > 0 ? 'text-emphasis-1' : baseEmphasis < 0 ? 'text-emphasis-minus1' : 'text-emphasis-0';

  let dynamicStyle: React.CSSProperties = {};
  if (voteScore > 0) {
    dynamicStyle = {
      color: 'hsl(130, 60%, 45%)',
      fontSize: `calc(var(--font-size-base) + ${(12 * level).toFixed(2)}px)`,
      transition: 'color 0.3s ease',
    };
  } else if (voteScore < 0) {
    dynamicStyle = {
      color: 'hsl(0, 70%, 55%)',
      fontSize: `max(10px, calc(var(--font-size-base) - ${(4 * level).toFixed(2)}px))`,
      transition: 'color 0.3s ease',
    };
  }

  const isChat = node.type === 'chat';
  const typeClass = isChat ? 'chat-message--chat' : 'chat-message--doc';

  // #始まりのコンテンツは見出しとして扱う（全角半角対応）
  const content = node.content;
  const isHeading = (node as any).heading === 'h1' || /^[#＃]/.test(content);
  const headingClass = isHeading ? 'chat-message--heading-h1' : '';

  // 1章: 同じ人（ニックネーム一致を含む）の投稿判定、かつ本文が空でない行
  const isOwnMessage = isOwn;
  const hasContent = Boolean(content && content.trim() !== '');
  const showMenu = isOwnMessage && hasContent;

  const handleEditInDoc = () => {
    onJumpToNode(index, 'doc', 'chat-menu-edit');
  };

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
      data-lv={step}
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
        {isHeading && !isMobile && (
          <EmojiReactionChips
            emojiReactions={node.emojiReactions}
            currentUserId={userId}
            onToggleEmoji={handleToggleEmoji}
            variant="chat"
          />
        )}
        {isMobile && (
          <div className="mobile-chat-message__reactions" onClick={(e) => e.stopPropagation()}>
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--upvote ${myReaction === '⇧' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇧', e)}
              title="いいね (Upvote)"
              aria-label="いいね"
            >
              👍 {upvotes > 0 && formatReactionCount(upvotes)}
            </button>
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--downvote ${myReaction === '⇩' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇩', e)}
              title="よくないね (Downvote)"
              aria-label="よくないね"
            >
              👎 {downvotes > 0 && formatReactionCount(downvotes)}
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
            <EmojiReactionChips
              emojiReactions={node.emojiReactions}
              currentUserId={userId}
              onToggleEmoji={handleToggleEmoji}
              variant="chat"
            />
          </div>
        )}
      </div>

      {isHeading && showMenu && !isMobile && (
        <div className="chat-message__side-actions" onClick={(e) => e.stopPropagation()}>
          <div className="chat-message__reaction-list">
            <PostActionMenu
              isOpen={isMenuOpen}
              onToggle={(open) => onToggleMenu?.(open)}
              onEditInDoc={handleEditInDoc}
              onRequestDelete={() => onRequestDelete?.()}
            />
          </div>
        </div>
      )}

      {!isHeading && !isMobile && (
        <div className="chat-message__side-actions" onClick={(e) => e.stopPropagation()}>
          <div className="chat-message__reaction-list">
            {showMenu && (
              <PostActionMenu
                isOpen={isMenuOpen}
                onToggle={(open) => onToggleMenu?.(open)}
                onEditInDoc={handleEditInDoc}
                onRequestDelete={() => onRequestDelete?.()}
              />
            )}
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--upvote ${myReaction === '⇧' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇧', e)}
              title="いいね (Upvote)"
              aria-label="いいね"
            >
              👍 {upvotes > 0 && formatReactionCount(upvotes)}
            </button>
            <button
              className={`chat-message__reaction-badge chat-message__reaction-badge--downvote ${myReaction === '⇩' ? 'chat-message__reaction-badge--active' : ''}`}
              onClick={(e) => handleVote('⇩', e)}
              title="よくないね (Downvote)"
              aria-label="よくないね"
            >
              👎 {downvotes > 0 && formatReactionCount(downvotes)}
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
          <EmojiReactionChips
            emojiReactions={node.emojiReactions}
            currentUserId={userId}
            onToggleEmoji={handleToggleEmoji}
            variant="chat"
          />
        </div>
      )}
    </div>
  );
};

export const ChatMessage = React.memo(ChatMessageComponent, (prevProps, nextProps) => {
  if (prevProps.isOwn !== nextProps.isOwn) return false;
  if (prevProps.isMobile !== nextProps.isMobile) return false;
  if (prevProps.isMenuOpen !== nextProps.isMenuOpen) return false;
  if (prevProps.userId !== nextProps.userId) return false;
  if (prevProps.nodeWithIndex.index !== nextProps.nodeWithIndex.index) return false;
  if (prevProps.nodeWithIndex.id !== nextProps.nodeWithIndex.id) return false;
  
  const prevNode = prevProps.nodeWithIndex.node;
  const nextNode = nextProps.nodeWithIndex.node;
  if (prevNode.content !== nextNode.content) return false;
  if (prevNode.timestamp !== nextNode.timestamp) return false;
  if (prevNode.author.displayName !== nextNode.author.displayName) return false;
  if (prevNode.reactions !== nextNode.reactions) return false;
  if (prevNode.emojiReactions !== nextNode.emojiReactions) return false;
  if ((prevNode as any).emphasis !== (nextNode as any).emphasis) return false;
  if ((prevNode as any).heading !== (nextNode as any).heading) return false;

  return true;
});
