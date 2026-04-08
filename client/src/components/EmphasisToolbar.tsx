import React from 'react';
import type { EmphasisLevel } from '../types';

interface EmphasisToolbarProps {
  position: { x: number; y: number };
  onApply: (level: EmphasisLevel) => void;
}

export const EmphasisToolbar: React.FC<EmphasisToolbarProps> = ({
  position,
  onApply,
}) => {
  return (
    <div
      className="emphasis-toolbar"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={e => e.preventDefault()}
      id="emphasis-toolbar"
    >
      <button
        className="emphasis-toolbar__btn emphasis-toolbar__btn--plus"
        onClick={() => onApply(1)}
        title="強調 (+1)"
      >
        <span className="emphasis-toolbar__icon">A</span>
        <span className="emphasis-toolbar__label">+1</span>
      </button>
      <button
        className="emphasis-toolbar__btn emphasis-toolbar__btn--default"
        onClick={() => onApply(0)}
        title="標準 (0)"
      >
        <span className="emphasis-toolbar__icon">A</span>
        <span className="emphasis-toolbar__label">0</span>
      </button>
      <button
        className="emphasis-toolbar__btn emphasis-toolbar__btn--minus"
        onClick={() => onApply(-1)}
        title="減調 (-1)"
      >
        <span className="emphasis-toolbar__icon">A</span>
        <span className="emphasis-toolbar__label">-1</span>
      </button>
    </div>
  );
};
