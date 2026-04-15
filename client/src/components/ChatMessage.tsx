import React, { useState, useCallback, useEffect } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { addReaction } from '../loro/schema';
import { PRESET_REACTIONS } from '../types';

interface ChatMessageProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  isOwn: boolean;
  userId: string;
  onAfterEdit: () => void;
}

const EmojiAddIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2A10 10 0 1 0 21 12" />
    <path d="M8 9.05v-.1" />
    <path d="M14 9.05v-.1" />
    <path d="M14 14c-1 1-3 1-4 0" />
    <path d="M19 2v6" />
    <path d="M16 5h6" />
  </svg>
);

export const ChatMessage: React.FC<ChatMessageProps> = ({
  nodeWithIndex,
  doc,
  isOwn,
  userId,
  onAfterEdit,
}) => {
  const { node, index } = nodeWithIndex;
  const [showReactions, setShowReactions] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

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

  const handleReaction = (emoji: string) => {
    if (!doc) return;
    addReaction(doc, index, userId, emoji);
    onAfterEdit();
    setShowReactions(false);
    setContextMenu(null);
  };

  // Group reactions by emoji
  const reactionCounts: Record<string, number> = {};
  if (node.reactions) {
    Object.values(node.reactions).forEach(emoji => {
      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    });
  }

  const isChat = node.type === 'chat';
  const typeClass = isChat ? 'chat-message--chat' : 'chat-message--doc';

  return (
    <div
      className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'} ${typeClass}`}
      id={`chat-message-${index}`}
    >
      <div className="chat-message__meta" style={{ display: 'flex', justifyContent: 'space-between', width: 'calc(100% - 88px)', marginBottom: '2px', paddingLeft: '8px' }}>
        <div className="chat-message__author" style={{ marginBottom: 0, paddingLeft: 0 }}>
          {isOwn ? 'あなた' : node.author}
        </div>
        <div className="chat-message__time" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          {formatTime(node.timestamp)}
        </div>
      </div>

      <div className="chat-message__bubble" onContextMenu={handleContextMenu}>
        <div className="chat-message__content">{node.content}</div>
        
        <div className="chat-message__footer">
          
          <div className="chat-message__reaction-list">
            {Object.keys(reactionCounts).length > 0 && 
              Object.entries(reactionCounts).map(([emoji, count]) => (
                <span
                  key={emoji}
                  className="chat-message__reaction-badge"
                  onClick={() => handleReaction(emoji)}
                >
                  {emoji} {count > 1 && count}
                </span>
              ))
            }
            <div className="chat-message__actions">
              <button
                className="chat-message__react-btn"
                onClick={() => setShowReactions(!showReactions)}
                title="リアクション"
              >
                <EmojiAddIcon />
              </button>
              {showReactions && (
                <div className="chat-message__reaction-picker">
                  {PRESET_REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      className="chat-message__reaction-option"
                      onClick={() => handleReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
            {PRESET_REACTIONS.map(emoji => (
              <button
                key={emoji}
                className="chat-message__reaction-option"
                onClick={() => handleReaction(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
