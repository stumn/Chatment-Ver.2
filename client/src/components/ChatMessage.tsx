import React, { useState } from 'react';
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

export const ChatMessage: React.FC<ChatMessageProps> = ({
  nodeWithIndex,
  doc,
  isOwn,
  userId,
  onAfterEdit,
}) => {
  const { node, index } = nodeWithIndex;
  const [showReactions, setShowReactions] = useState(false);

  if (node.type !== 'chat') return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const handleReaction = (emoji: string) => {
    if (!doc) return;
    addReaction(doc, index, userId, emoji);
    onAfterEdit();
    setShowReactions(false);
  };

  // Group reactions by emoji
  const reactionCounts: Record<string, number> = {};
  if (node.reactions) {
    Object.values(node.reactions).forEach(emoji => {
      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    });
  }

  return (
    <div
      className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'}`}
      id={`chat-message-${index}`}
    >
      {!isOwn && (
        <div className="chat-message__author">{node.author}</div>
      )}
      <div className="chat-message__bubble">
        <div className="chat-message__content">{node.content}</div>
        <div className="chat-message__time">{formatTime(node.timestamp)}</div>
      </div>

      {Object.keys(reactionCounts).length > 0 && (
        <div className="chat-message__reactions">
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <span
              key={emoji}
              className="chat-message__reaction-badge"
              onClick={() => handleReaction(emoji)}
            >
              {emoji} {count > 1 && count}
            </span>
          ))}
        </div>
      )}

      <div className="chat-message__actions">
        <button
          className="chat-message__react-btn"
          onClick={() => setShowReactions(!showReactions)}
          title="リアクション"
        >
          😊
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
  );
};
