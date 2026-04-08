import React from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { DocBlock } from './DocBlock';

interface DocPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
  dragState: { dragIndex: number | null; dropIndex: number | null };
  onDragStart: (index: number) => (e: React.DragEvent) => void;
  onDragOver: (index: number) => (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (index: number) => (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onAfterEdit: () => void;
}

export const DocPanel: React.FC<DocPanelProps> = ({
  nodes,
  doc,
  userName,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAfterEdit,
}) => {
  if (nodes.length === 0) {
    return (
      <div className="doc-panel" id="doc-panel">
        <div className="doc-panel__empty">
          <div className="doc-panel__empty-icon">📄</div>
          <p className="doc-panel__empty-text">
            チャットが溢れると、ここにドキュメントとして表示されます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="doc-panel" id="doc-panel">
      <div className="doc-panel__header">
        <span className="doc-panel__label">📄 Document</span>
        <span className="doc-panel__count">{nodes.length} blocks</span>
      </div>
      <div className="doc-panel__content">
        {nodes.map((nodeWithIndex) => (
          <DocBlock
            key={`doc-${nodeWithIndex.index}`}
            nodeWithIndex={nodeWithIndex}
            doc={doc}
            userName={userName}
            isDropTarget={dragState.dropIndex === nodeWithIndex.index}
            isDragging={dragState.dragIndex === nodeWithIndex.index}
            onDragStart={onDragStart(nodeWithIndex.index)}
            onDragOver={onDragOver(nodeWithIndex.index)}
            onDragLeave={onDragLeave}
            onDrop={onDrop(nodeWithIndex.index)}
            onDragEnd={onDragEnd}
            onAfterEdit={onAfterEdit}
          />
        ))}
      </div>
    </div>
  );
};
