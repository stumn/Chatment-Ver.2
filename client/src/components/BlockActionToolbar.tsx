import React from 'react';

interface BlockActionToolbarProps {
  isPlaybackActive?: boolean;
  showDragHandle: boolean;
  blockIndent: number;
  blockHeading: string | null;
  blockEmphasis: number;
  setIsDraggable: (draggable: boolean) => void;
  adjustIndent: (direction: number) => void;
  setBlockStyle: (style: 'h1' | 'normal' | 'fade') => void;
}

export const BlockActionToolbar: React.FC<BlockActionToolbarProps> = ({
  isPlaybackActive,
  showDragHandle,
  blockIndent,
  blockHeading,
  blockEmphasis,
  setIsDraggable,
  adjustIndent,
  setBlockStyle,
}) => {
  if (isPlaybackActive) return null;

  return (
    <div className="doc-block__action-toolbar" onClick={(e) => e.stopPropagation()}>
      {/* ドラッグハンドルをツールバーの左側に配置し、高さを縦全体に持たせる */}
      {showDragHandle && (
        <div
          className="action-toolbar__drag-handle"
          title="ドラッグしてこの行を並び替え"
          onMouseEnter={() => !isPlaybackActive && setIsDraggable(true)}
          onMouseLeave={() => setIsDraggable(false)}
          style={{
            cursor: isPlaybackActive ? 'not-allowed' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            fontSize: '13px',
            color: 'var(--text-muted)',
            userSelect: 'none',
            borderRight: '1px solid var(--border-medium)',
            marginRight: '6px',
          }}
        >
          ⣿
        </div>
      )}

      <div className="action-toolbar__controls-grid" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* 上段：インデント切替 */}
        <div className="action-toolbar__row" style={{ display: 'flex', gap: '2px' }}>
          <button
            className={`action-toolbar__btn ${blockIndent === 0 ? 'is-active' : ''}`}
            title="インデントなし (◯)"
            onClick={() => adjustIndent(-blockIndent)}
          >
            ◯
          </button>
          <button
            className={`action-toolbar__btn ${blockIndent === 1 ? 'is-active' : ''}`}
            title="インデント1段階 (›)"
            onClick={() => adjustIndent(1 - blockIndent)}
          >
            ›
          </button>
          <button
            className={`action-toolbar__btn ${blockIndent === 2 ? 'is-active' : ''}`}
            title="インデント2段階 (»)"
            onClick={() => adjustIndent(2 - blockIndent)}
          >
            »
          </button>
        </div>

        {/* 下段：見出し・標準・控えめ */}
        <div className="action-toolbar__row" style={{ display: 'flex', gap: '2px' }}>
          <button
            className={`action-toolbar__btn ${blockHeading === 'h1' ? 'is-active' : ''}`}
            title="見出し (H1)"
            onClick={() => setBlockStyle('h1')}
            style={{ fontSize: '10px' }}
          >
            H1
          </button>
          <button
            className={`action-toolbar__btn ${blockHeading !== 'h1' && blockEmphasis === 0 ? 'is-active' : ''}`}
            title="標準 (●)"
            onClick={() => setBlockStyle('normal')}
            style={{ fontSize: '10px' }}
          >
            ●
          </button>
          <button
            className={`action-toolbar__btn ${blockHeading !== 'h1' && blockEmphasis === -1 ? 'is-active' : ''}`}
            title="控えめ (●)"
            onClick={() => setBlockStyle('fade')}
            style={{ fontSize: '10px', color: '#999' }}
          >
            ●
          </button>
        </div>
      </div>
    </div>
  );
};
