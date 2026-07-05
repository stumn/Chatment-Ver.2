import React, { useState } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { addReaction } from '../loro/schema';

interface ChatMessageProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  isOwn: boolean;
  userId: string;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
  isPlaybackActive?: boolean;
  activeHighlightBlockId?: string | null;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  nodeWithIndex,
  doc,
  isOwn,
  userId,
  onAfterEdit,
  onJumpToNode,
  isPlaybackActive,
  activeHighlightBlockId,
}) => {
  const { node, index } = nodeWithIndex;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const handleReaction = (emoji: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!doc || isPlaybackActive) return;
    const newEmoji = myReaction === emoji ? '' : emoji;
    addReaction(doc, index, userId, newEmoji);
    onAfterEdit();
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
      color: 'hsl(130, 60%, 45%)', // Green
      fontSize: `calc(var(--font-size-base) + ${voteScore * 1.5}px)`,
      transition: 'all 0.3s ease'
    };
  } else if (voteScore < 0) {
    dynamicStyle = {
      color: 'hsl(0, 70%, 55%)', // Red
      fontSize: `max(10px, calc(var(--font-size-base) - ${Math.abs(voteScore)}px))`,
      transition: 'all 0.3s ease'
    };
  }

  const isChat = node.type === 'chat';
  const typeClass = isChat ? 'chat-message--chat' : 'chat-message--doc';
  const isHighlighted = activeHighlightBlockId === nodeWithIndex.id;

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
      className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'} ${typeClass} ${isHighlighted ? 'playback-highlight' : ''}`}
      id={`chat-message-${index}`}
      onClick={() => onJumpToNode(index, 'doc')}
      style={{ cursor: 'pointer' }}
      title="クリックしてドキュメントへジャンプ"
    >
      <div className="chat-message__body">
        <div className="chat-message__header">
          <span className="chat-message__time">{formatTime(node.timestamp)}</span>
          <span className="chat-message__author">{node.author}</span>
        </div>
        <div className={`chat-message__content ${emphasisClass}`} style={dynamicStyle}>{renderWithLinks(node.content)}</div>
      </div>

      <div className="chat-message__side-actions">
        <div className="chat-message__reaction-list">
          <button
            className={`chat-message__reaction-badge chat-message__reaction-badge--upvote ${myReaction === '⇧' ? 'chat-message__reaction-badge--active' : ''}`}
            onClick={(e) => handleReaction('⇧', e)}
            disabled={isPlaybackActive}
            title={isPlaybackActive ? "プレイバック中は投票できません" : "太字にする (Upvote)"}
            style={{ cursor: isPlaybackActive ? 'not-allowed' : 'pointer', opacity: isPlaybackActive ? 0.6 : 1 }}
          >
            ⇧ {upvotes > 0 && upvotes}
          </button>
          <button
            className={`chat-message__reaction-badge chat-message__reaction-badge--downvote ${myReaction === '⇩' ? 'chat-message__reaction-badge--active' : ''}`}
            onClick={(e) => handleReaction('⇩', e)}
            disabled={isPlaybackActive}
            title={isPlaybackActive ? "プレイバック中は投票できません" : "控えめにする (Downvote)"}
            style={{ cursor: isPlaybackActive ? 'not-allowed' : 'pointer', opacity: isPlaybackActive ? 0.6 : 1 }}
          >
            ⇩ {downvotes > 0 && downvotes}
          </button>
        </div>
      </div>
    </div>
  );
};
