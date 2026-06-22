import React, { useState, useCallback, useRef } from 'react';
import type { LoroDoc } from 'loro-crdt';
import { addChatNode, addDocNode } from '../loro/schema';

interface ChatInputProps {
  doc: LoroDoc | null;
  userName: string;
  onAfterSend: () => void;
  isPlaybackActive?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  doc,
  userName,
  onAfterSend,
  isPlaybackActive,
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !doc || isPlaybackActive) return;

    addChatNode(doc, trimmed, userName);
    setText('');
    onAfterSend();

    // Refocus input
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [text, doc, userName, onAfterSend, isPlaybackActive]);


  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // 改行を禁止する
      if (e.ctrlKey || e.metaKey) {
        sendMessage();
      }
    }
  }, [sendMessage]);

  return (
    <div className="chat-input" id="chat-input">
      <div className="chat-input__wrapper" style={{ display: 'flex', alignItems: 'center', opacity: isPlaybackActive ? 0.6 : 1 }}>
        <div style={{ width: '48px', marginRight: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)' }} title="チャット投稿" />
        </div>
        <textarea
          ref={inputRef}
          className="chat-input__textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isPlaybackActive ? "プレイバック再生中は送信できません" : "チャットメッセージを入力... (Ctrl + Enter で送信)"}
          rows={1}
          id="chat-input-textarea"
          disabled={isPlaybackActive}
          style={{ cursor: isPlaybackActive ? 'not-allowed' : 'text' }}
        />
        <div className="chat-input__buttons">
          <button
            className="chat-input__btn chat-input__btn--send"
            onClick={sendMessage}
            disabled={isPlaybackActive || !text.trim()}
            title="チャットとして送信"
            id="send-chat-btn"
            style={{ cursor: isPlaybackActive ? 'not-allowed' : 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
