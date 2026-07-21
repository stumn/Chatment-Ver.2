import React, { useState } from 'react';
import type { AuthorInfo } from '../types';

interface BlockTimelineCircleProps {
  index: number;
  blockIndent: number;
  isChat: boolean;
  isIndentPending: boolean;
  showIndentMark: boolean;
  isContentEmpty: boolean;
  isFocused: boolean;
  blockAuthor: AuthorInfo;
  blockSubAuthors: AuthorInfo[];
  timestamp: number;
  totalReactions: number;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
  isH1?: boolean;
}

export const BlockTimelineCircle: React.FC<BlockTimelineCircleProps> = ({
  index,
  blockIndent,
  isChat,
  isIndentPending,
  showIndentMark,
  isContentEmpty,
  isFocused,
  blockAuthor,
  blockSubAuthors,
  timestamp,
  totalReactions,
  onJumpToNode,
  isH1,
}) => {
  const [showMeta, setShowMeta] = useState(false);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="doc-block__meta-toggle"
      onMouseEnter={() => !isContentEmpty && setShowMeta(true)}
      onMouseLeave={() => setShowMeta(false)}
      style={{
        visibility: (!isContentEmpty || isFocused) ? 'visible' : 'hidden',
        cursor: 'pointer',
      }}
      onClick={() => onJumpToNode(index, 'chat', 'doc-block')}
      title="チャット画面へジャンプ"
    >
      {isH1 ? (
        <div className="doc-block__timeline-h1-mark">#</div>
      ) : showIndentMark ? (
        <div
          className={`doc-block__timeline-circle doc-block__timeline-circle--indent-${blockIndent >= 2 ? 2 : blockIndent}`}
          style={
            isIndentPending
              ? (isChat ? { color: 'var(--accent-primary)', opacity: 0.4 } : { color: 'var(--text-muted)' })
              : (isChat ? { color: 'var(--accent-primary)' } : undefined)
          }
        >
          {blockIndent === 1 ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <path d="M3 1.5l4 3.5-4 3.5" />
            </svg>
          ) : blockIndent >= 2 ? (
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <path d="M3 1.5l4 3.5-4 3.5 M9 1.5l4 3.5-4 3.5" />
            </svg>
          ) : null}
        </div>
      ) : blockIndent === 0 ? (
        <div className={`doc-block__timeline-circle ${isIndentPending ? 'is-pending' : ''}`}></div>
      ) : (
        <div className="doc-block__timeline-circle-placeholder" style={{ width: '10px', height: '10px' }} />
      )}
      {showMeta && !isContentEmpty && (
        <div className="doc-block__meta-tooltip">
          <span className="doc-block__author" style={{ color: isChat ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
            {blockAuthor.displayName || '不明'}
            {blockSubAuthors.length > 0 && ` (+${blockSubAuthors.map(sa => sa.displayName).join('・')})`}
          </span>
          <span className="doc-block__time">{formatTime(timestamp)}</span>
          {totalReactions > 0 && <span className="doc-block__reaction-count">リアクション {totalReactions}件</span>}
        </div>
      )}
    </div>
  );
};
