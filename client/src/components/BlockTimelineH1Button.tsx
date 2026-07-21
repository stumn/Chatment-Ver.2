import React, { useState } from 'react';
import type { AuthorInfo } from '../types';

interface BlockTimelineH1ButtonProps {
  index: number;
  isFocused: boolean;
  blockAuthor: AuthorInfo;
  blockSubAuthors: AuthorInfo[];
  timestamp: number;
  totalReactions: number;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}

export const BlockTimelineH1Button: React.FC<BlockTimelineH1ButtonProps> = ({
  index,
  isFocused,
  blockAuthor,
  blockSubAuthors,
  timestamp,
  totalReactions,
  onJumpToNode,
}) => {
  const [showMeta, setShowMeta] = useState(false);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="doc-block__meta-toggle"
      onMouseEnter={() => setShowMeta(true)}
      onMouseLeave={() => setShowMeta(false)}
      style={{
        cursor: 'pointer',
        opacity: isFocused ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
      }}
      onClick={() => onJumpToNode(index, 'chat', 'doc-block')}
      title="チャット画面へジャンプ"
    >
      <div className="doc-block__timeline-h1-mark">#</div>
      
      {showMeta && (
        <div className="doc-block__meta-tooltip">
          <span className="doc-block__author" style={{ color: 'var(--accent-secondary)' }}>
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
