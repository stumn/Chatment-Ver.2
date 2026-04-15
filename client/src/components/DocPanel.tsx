import React from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { DocBlock } from './DocBlock';
import { addDocNode } from '../loro/schema';

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
  const [bgMenu, setBgMenu] = React.useState<{ x: number, y: number } | null>(null);

  const handleBgContextMenu = React.useCallback((e: React.MouseEvent) => {
    // If the event isn't from the background itself, let it bubble if needed
    // Actually, DocBlock stops propagation on right-clicks.
    if ((e.target as HTMLElement).closest('.doc-block')) {
      return;
    }
    e.preventDefault();
    setBgMenu({ x: e.clientX, y: e.clientY });
  }, []);

  React.useEffect(() => {
    if (bgMenu) {
      const close = () => setBgMenu(null);
      const timer = setTimeout(() => {
        window.addEventListener('click', close);
        window.addEventListener('contextmenu', close);
      }, 10);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', close);
        window.removeEventListener('contextmenu', close);
      };
    }
  }, [bgMenu]);

  const insertBlock = React.useCallback(() => {
    if (doc) {
      addDocNode(doc, '', userName);
      onAfterEdit();
    }
    setBgMenu(null);
  }, [doc, userName, onAfterEdit]);

  if (nodes.length === 0) {
    return (
      <div className="doc-panel" id="doc-panel" onContextMenu={handleBgContextMenu}>
        <div className="doc-panel__empty">
          <div className="doc-panel__empty-icon">📄</div>
          <p className="doc-panel__empty-text">
            チャットが溢れると、ここにドキュメントとして表示されます
          </p>
        </div>
        
        {bgMenu && (
          <div 
            className="doc-block__context-menu"
            style={{ position: 'fixed', top: bgMenu.y, left: bgMenu.x, zIndex: 100000 }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button className="context-menu__item" onClick={insertBlock}>
              ➕ 新しいブロックを追加
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="doc-panel" onContextMenu={handleBgContextMenu}>
      <div className="doc-panel__content">
        {nodes.map((nodeWithIndex, arrayIndex) => (
          <DocBlock
            key={`doc-${nodeWithIndex.index}`}
            nodeWithIndex={nodeWithIndex}
            doc={doc}
            userName={userName}
            isFirstInDoc={arrayIndex === 0}
            isLastInDoc={arrayIndex === nodes.length - 1}
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
      
      {bgMenu && (
        <div 
          className="doc-block__context-menu"
          style={{ position: 'fixed', top: bgMenu.y, left: bgMenu.x, zIndex: 100000 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <button className="context-menu__item" onClick={insertBlock}>
            ➕ 新しいブロックを追加
          </button>
        </div>
      )}
    </div>
  );
};
