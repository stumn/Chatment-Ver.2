import React, { useState, useCallback, useEffect } from 'react';
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
  const [showReactions, setShowReactions] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPlaybackActive) return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isPlaybackActive]);

  useEffect(() => {
    if (contextMenu) {
      const closeMenu = () => setContextMenu(null);
      const timer = setTimeout(() => {
        window.addEventListener('click', closeMenu);
        window.addEventListener('contextmenu', closeMenu);
      }, 10);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', closeMenu);
        window.removeEventListener('contextmenu', closeMenu);
      };
    }
  }, [contextMenu]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const handleReaction = (emoji: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!doc || isPlaybackActive) return;
    // Toggle logic: if we already reacted with this emoji, remove it by sending empty string
    const newEmoji = myReaction === emoji ? '' : emoji;
    addReaction(doc, index, userId, newEmoji);
    onAfterEdit();
    setContextMenu(null);
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
  
  // Base emphasis loaded from the right-click menu in the document panel
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

  return (
    <div
      className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'} ${typeClass} ${isHighlighted ? 'playback-highlight' : ''}`}
      id={`chat-message-${index}`}
      onContextMenu={handleContextMenu}
      onClick={() => onJumpToNode(index, 'doc')}
      style={{ cursor: 'pointer' }}
      title="クリックしてドキュメントへジャンプ"
    >
      <div className="chat-message__body">
        <div className="chat-message__header">
          <span className="chat-message__time">{formatTime(node.timestamp)}</span>
          <span className="chat-message__author">{node.author}</span>
        </div>
        <div className={`chat-message__content ${emphasisClass}`} style={dynamicStyle}>{node.content}</div>
      </div>

      <div className="chat-message__side-actions">
        <div className="chat-message__reaction-list">
          <button
            className={`chat-message__reaction-badge ${myReaction === '⇧' ? 'chat-message__reaction-badge--active' : ''}`}
            onClick={(e) => handleReaction('⇧', e)}
            disabled={isPlaybackActive}
            title={isPlaybackActive ? "プレイバック中は投票できません" : "太字にする (Upvote)"}
            style={{ cursor: isPlaybackActive ? 'not-allowed' : 'pointer', opacity: isPlaybackActive ? 0.6 : 1 }}
          >
            ⇧ {upvotes > 0 && upvotes}
          </button>
          <button
            className={`chat-message__reaction-badge ${myReaction === '⇩' ? 'chat-message__reaction-badge--active' : ''}`}
            onClick={(e) => handleReaction('⇩', e)}
            disabled={isPlaybackActive}
            title={isPlaybackActive ? "プレイバック中は投票できません" : "控えめにする (Downvote)"}
            style={{ cursor: isPlaybackActive ? 'not-allowed' : 'pointer', opacity: isPlaybackActive ? 0.6 : 1 }}
          >
            ⇩ {downvotes > 0 && downvotes}
          </button>
        </div>
      </div>
      
      {contextMenu && (
        <div 
          className="doc-block__context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="context-menu__header">クイックリアクション</div>
          <div className="chat-message__reaction-picker" style={{ position: 'relative', top: 0, boxShadow: 'none', border: 'none', background: 'transparent', marginTop: 4 }}>
            <button className="chat-message__reaction-option" onClick={() => handleReaction('⇧')}>⇧</button>
            <button className="chat-message__reaction-option" onClick={() => handleReaction('⇩')}>⇩</button>
          </div>
        </div>
      )}
    </div>
  );
};
