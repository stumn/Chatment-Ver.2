import React from 'react';

interface BlockActionToolbarProps {
  showDragHandle: boolean;
  blockIndent: number;
  blockHeading: string | null;
  blockEmphasis: number;
  setIsDraggable: (draggable: boolean) => void;
  adjustIndent: (direction: number) => void;
  setBlockStyle: (style: 'h1' | 'normal' | 'fade') => void;
  side: 'left' | 'right';
}

export const BlockActionToolbar: React.FC<BlockActionToolbarProps> = ({
  showDragHandle,
  blockIndent,
  blockHeading,
  blockEmphasis,
  setIsDraggable,
  adjustIndent,
  setBlockStyle,
  side,
}) => {
  return (
    <div className={`doc-block__action-toolbar doc-block__action-toolbar--${side}`} onClick={(e) => e.stopPropagation()}>
      {/* ドラッグハンドルをツールバーの左側に配置し、高さを縦全体に持たせる */}
      {showDragHandle && (
        <div
          className="action-toolbar__drag-handle"
          title="ドラッグしてこの行を並び替え"
          onMouseEnter={() => setIsDraggable(true)}
          onMouseLeave={() => setIsDraggable(false)}
          style={{
            cursor: 'grab',
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustIndent(-blockIndent)}
          >
            ◯
          </button>
          <button
            className={`action-toolbar__btn ${blockIndent === 1 ? 'is-active' : ''}`}
            title="インデント1段階 (›)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustIndent(1 - blockIndent)}
          >
            ›
          </button>
          <button
            className={`action-toolbar__btn ${blockIndent === 2 ? 'is-active' : ''}`}
            title="インデント2段階 (»)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustIndent(2 - blockIndent)}
          >
            »
          </button>
        </div>

        {/* 下段：見出し・標準 */}
        <div className="action-toolbar__row" style={{ display: 'flex', gap: '2px' }}>
          <button
            className={`action-toolbar__btn ${blockHeading === 'h1' ? 'is-active' : ''}`}
            title="見出し (H1)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setBlockStyle('h1')}
            style={{ fontSize: '10px' }}
          >
            H1
          </button>
          <button
            className={`action-toolbar__btn ${blockHeading !== 'h1' && blockEmphasis === 0 ? 'is-active' : ''}`}
            title="標準 (●)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setBlockStyle('normal')}
            style={{ fontSize: '10px' }}
          >
            ●
          </button>
        </div>
      </div>
    </div>
  );
};
