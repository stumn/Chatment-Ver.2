import React, { useRef, useEffect } from 'react';
import type { StreamNodeWithIndex, AuthorInfo } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { DocBlock } from './DocBlock';

interface DocPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  currentAuthorInfo: AuthorInfo;
  defaultEmphasis: number | 'h1';
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
  isCautiousMode?: boolean;
}

export const DocPanel: React.FC<DocPanelProps> = ({
  nodes,
  doc,
  currentAuthorInfo,
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
  isCautiousMode,
}) => {


  // 空白でないブロック数（件数カウント用）
  const nonEmptyCount = nodes.filter(n => n.node.content.trim().length > 0).length;

  if (nodes.length === 0) {
    return (
      <div className="doc-panel" id="doc-panel" style={{ position: 'relative' }}>
        <div className="doc-panel__content">
          {typeof activeDeletedIndex === 'number' ? (
            <div className="doc-paper">
              <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <div className="doc-paper">
                <p style={{
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: '16px',
                  padding: '0 4px',
                  textAlign: 'center',
                  lineHeight: '1.7',
                }}>
                  チャットからでも、ここドキュメントからでも、書き込めます。<br />
                  ドキュメントから書き込む場合は、前の行の最後でEnter（改行）すると、次の行が作れます。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="doc-panel" style={{ position: 'relative' }}>
      <div className="doc-panel__content">
        <div className="doc-paper">
          {nonEmptyCount < 5 && (
            <p style={{
              color: 'var(--text-muted)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '16px',
              padding: '0 4px',
              textAlign: 'center',
              lineHeight: '1.7',
            }}>
              チャットからでも、ここドキュメントからでも、書き込めます。<br />
              ドキュメントから書き込む場合は、前の行の最後でEnter（改行）すると、次の行が作れます。
            </p>
          )}
          {nodes.map((nodeWithIndex, arrayIndex) => (
            <React.Fragment key={nodeWithIndex.id}>
              {activeDeletedIndex === arrayIndex && (
                <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
              )}
              <DocBlock
                nodeWithIndex={nodeWithIndex}
                doc={doc}
                currentAuthorInfo={currentAuthorInfo}
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
                isCautiousMode={isCautiousMode}
              />
              {activeDeletedIndex === nodes.length && arrayIndex === nodes.length - 1 && (
                <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
