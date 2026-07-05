import React, { useRef } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { DocBlock } from './DocBlock';

interface DocPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
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

/**
 * 空状態のドキュメント入力行コンポーネント
 * IMEコンポジション中はonInputを無視し、確定後（onCompositionEnd or Enter or Blur）にのみ登録する
 */
const EmptyDocInputRow: React.FC<{
  index: number;
  isFirst: boolean;
  isPlaybackActive?: boolean;
  defaultEmphasis: number | 'h1';
  doc: LoroDoc | null;
  userName: string;
  onAfterEdit: () => void;
}> = ({ index, isFirst, isPlaybackActive, defaultEmphasis, doc, userName, onAfterEdit }) => {
  const isComposingRef = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    if (isPlaybackActive || isComposingRef.current) return;
    const val = elRef.current?.textContent || '';
    if (val.length > 0 && doc) {
      import('../loro/schema').then(({ addDocNode }) => {
        if (defaultEmphasis === 'h1') {
          addDocNode(doc, val, userName, 0, 0, 'h1');
        } else {
          addDocNode(doc, val, userName, defaultEmphasis);
        }
        onAfterEdit();
      });
    }
  };

  return (
    <div
      className={`doc-block doc-block--doc doc-emphasis-${defaultEmphasis}`}
      style={{ border: '1px dashed var(--border-medium)', background: 'transparent', width: '100%', marginBottom: '8px' }}
    >
      <div className="doc-block__body">
        <div
          ref={elRef}
          className="doc-block__content"
          contentEditable={!isPlaybackActive}
          suppressContentEditableWarning
          data-placeholder={index === 0 ? 'ここから書き始めることができます' : ''}
          style={{ opacity: 0.8, minHeight: '1.5em' }}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            // IME確定後にcommitはしない（Enter or Blur で行う）
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isComposingRef.current) {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
};

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
  isCautiousMode,
}) => {
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
                {[0, 1, 2].map((i) => (
                  <EmptyDocInputRow
                    key={i}
                    index={i}
                    isFirst={i === 0}
                    isPlaybackActive={isPlaybackActive}
                    defaultEmphasis={defaultEmphasis}
                    doc={doc}
                    userName={userName}
                    onAfterEdit={onAfterEdit}
                  />
                ))}
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
          {nodes.length < 5 && (
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
                isCautiousMode={isCautiousMode}
              />
              {activeDeletedIndex === nodes.length && arrayIndex === nodes.length - 1 && (
                <div id="doc-block-deletion-line" className="doc-block-deletion-line" />
              )}
            </React.Fragment>
          ))}
          {/* 1〜2件のとき: ノードの下に3行の空白書き込みエリア */}
          {nodes.length > 0 && nodes.length < 3 && [0, 1, 2].map((i) => (
            <EmptyDocInputRow
              key={`trailing-${i}`}
              index={i}
              isFirst={false}
              isPlaybackActive={isPlaybackActive}
              defaultEmphasis={defaultEmphasis}
              doc={doc}
              userName={userName}
              onAfterEdit={onAfterEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
