import React from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { DocBlock } from './DocBlock';
import { addDocNode } from '../loro/schema';

interface DocPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
  defaultEmphasis: number;
  dragState: { dragIndex: number | null; dropIndex: number | null };
  onDragStart: (index: number) => (e: React.DragEvent) => void;
  onDragOver: (index: number) => (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (index: number) => (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
  isPlaybackActive?: boolean;
  activeHighlightBlockId?: string | null;
  activeDeletedIndex?: number | null;
}

export const DocPanel: React.FC<DocPanelProps> = ({
  nodes,
  doc,
  userName,
  defaultEmphasis,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAfterEdit,
  onJumpToNode,
  isPlaybackActive,
  activeHighlightBlockId,
  activeDeletedIndex,
}) => {
  const [bgMenu, setBgMenu] = React.useState<{ x: number, y: number } | null>(null);
  

  const handleBgContextMenu = React.useCallback((e: React.MouseEvent) => {
    if (isPlaybackActive) return;
    // If the event isn't from the background itself, let it bubble if needed
    // Actually, DocBlock stops propagation on right-clicks.
    if ((e.target as HTMLElement).closest('.doc-block')) {
      return;
    }
    e.preventDefault();
    setBgMenu({ x: e.clientX, y: e.clientY });
  }, [isPlaybackActive]);

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
    if (doc && !isPlaybackActive) {
      addDocNode(doc, '', userName, defaultEmphasis);
      onAfterEdit();
    }
    setBgMenu(null);
  }, [doc, userName, defaultEmphasis, onAfterEdit, isPlaybackActive]);

  if (nodes.length === 0) {
    return (
      <div className="doc-panel" id="doc-panel" onContextMenu={handleBgContextMenu} style={{ position: 'relative' }}>
        <div className="doc-panel__content">
          {typeof activeDeletedIndex === 'number' ? (
            <div className="doc-paper">
              <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
            </div>
          ) : (
            <>
              {/* チャットが溢れる前の 1件目の仮書き込みエリア (CRDT上にはまだ追加されないが、入力で発火する想定) */}
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <div className="doc-paper">
                  <div 
                    className={`doc-block doc-block--doc doc-emphasis-${defaultEmphasis}`}
                    style={{ border: '1px dashed var(--border-medium)', background: 'transparent', width: '100%' }}
                  >
                    <div className="doc-block__body">
                      <div 
                        className="doc-block__content"
                        contentEditable={!isPlaybackActive}
                        suppressContentEditableWarning
                        data-placeholder="ここから書き始めることができます"
                        style={{ opacity: 0.8 }}
                        onInput={(e) => {
                          if (isPlaybackActive) return;
                          const val = e.currentTarget.textContent || '';
                          if (val.length > 0 && doc) {
                            import('../loro/schema').then(({ addDocNode }) => {
                              addDocNode(doc, val, userName, defaultEmphasis);
                              onAfterEdit();
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="doc-panel__empty">
                <div className="doc-panel__empty-icon">📄</div>
                <p className="doc-panel__empty-text">
                  チャットが溢れると、ここにドキュメントとして表示されます
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="doc-panel" onContextMenu={handleBgContextMenu} style={{ position: 'relative' }}>
      <div className="doc-panel__content">
        <div className="doc-paper">
          {nodes.map((nodeWithIndex, arrayIndex) => (
            <React.Fragment key={nodeWithIndex.id}>
              {activeDeletedIndex === arrayIndex && (
                <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
              )}
              <DocBlock
                nodeWithIndex={nodeWithIndex}
                doc={doc}
                userName={userName}
                defaultEmphasis={defaultEmphasis}
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
                onJumpToNode={onJumpToNode}
                isPlaybackActive={isPlaybackActive}
                activeHighlightBlockId={activeHighlightBlockId}
              />
              {activeDeletedIndex === nodes.length && arrayIndex === nodes.length - 1 && (
                <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
              )}
            </React.Fragment>
          ))}
        </div>
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
