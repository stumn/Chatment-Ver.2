import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { LoroDoc } from 'loro-crdt';
import type { AuthorInfo } from '../types';
import { addChatNode } from '../loro/schema';
import { emitUserAction } from '../loro/sync-client';

interface ChatInputProps {
  doc: LoroDoc | null;
  currentAuthorInfo: AuthorInfo;
  handleNameOptions: AuthorInfo[];
  onHandleNameChange: (info: AuthorInfo) => void;
  onAfterSend: () => void;
  useCtrlEnter: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  doc,
  currentAuthorInfo,
  handleNameOptions,
  onHandleNameChange,
  onAfterSend,
  useCtrlEnter,
}) => {
  const [text, setText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const sendMessage = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !doc) return;

    addChatNode(doc, trimmed, currentAuthorInfo);
    setText('');
    onAfterSend();

    // Refocus input
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [text, doc, currentAuthorInfo, onAfterSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (useCtrlEnter) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          sendMessage();
        }
      } else {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          sendMessage();
        }
      }
    }
  }, [sendMessage, useCtrlEnter]);

  const handleSelectOption = (info: AuthorInfo) => {
    emitUserAction({
      type: 'handle-name-change',
      before: { displayName: currentAuthorInfo.displayName },
      after: { displayName: info.displayName },
      actionDetails: `ハンドルネーム変更: ${currentAuthorInfo.displayName} → ${info.displayName}`,
    });
    onHandleNameChange(info);
    setDropdownOpen(false);
  };

  return (
    <div className="chat-input" id="chat-input">
      <div className="chat-input__wrapper" style={{ display: 'flex', alignItems: 'center' }}>

        {/* ハンドルネームドロップダウン */}
        <div
          className="chat-input__handle-dropdown"
          ref={dropdownRef}
          style={{ position: 'relative', flexShrink: 0, marginRight: '10px' }}
        >
          <button
            className="chat-input__handle-btn"
            onClick={() => setDropdownOpen(prev => !prev)}
            title="ハンドルネームを変更"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            id="handle-name-btn"
          >
            <span className="chat-input__handle-name">{currentAuthorInfo.displayName || '名無し'}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <polyline points="2 3 5 7 8 3" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="chat-input__handle-menu" role="listbox">
              {handleNameOptions.map((opt, i) => (
                <button
                  key={i}
                  className={`chat-input__handle-option${opt.displayName === currentAuthorInfo.displayName ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={opt.displayName === currentAuthorInfo.displayName}
                  onClick={() => handleSelectOption(opt)}
                >
                  <span className="chat-input__handle-option-name">{opt.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={inputRef}
          className="chat-input__textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            useCtrlEnter
              ? 'チャットメッセージを入力... (Ctrl + Enter で送信)'
              : 'チャットメッセージを入力... (Enter で送信)'
          }
          rows={1}
          id="chat-input-textarea"
        />
        <div className="chat-input__buttons">
          <button
            className="chat-input__btn chat-input__btn--send"
            onClick={sendMessage}
            disabled={!text.trim()}
            title="チャットとして送信"
            id="send-chat-btn"
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
