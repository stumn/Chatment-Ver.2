import React, { useState, useRef, useCallback } from 'react';
import type { StreamNodeWithIndex, EmphasisLevel } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { updateDocContent, applyEmphasis } from '../loro/schema';
import { EmphasisToolbar } from './EmphasisToolbar';

interface DocBlockProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  userName: string;
  isDropTarget: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onAfterEdit: () => void;
}

export const DocBlock: React.FC<DocBlockProps> = ({
  nodeWithIndex,
  doc,
  isDropTarget,
  isDragging,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAfterEdit,
}) => {
  const { node, index, loroText } = nodeWithIndex;
  const contentRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const isChat = node.type === 'chat';

  const handleBlur = useCallback(() => {
    if (!doc || !contentRef.current) return;
    const newText = contentRef.current.textContent || '';

    if (node.type === 'doc' && newText !== node.content) {
      updateDocContent(doc, index, newText);
      onAfterEdit();
    }

    setShowToolbar(false);
  }, [doc, index, node, onAfterEdit]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setShowToolbar(false);
      return;
    }

    if (node.type !== 'doc') return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();

    setToolbarPos({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    });
    setShowToolbar(true);
  }, [node.type]);

  const handleEmphasis = useCallback((level: EmphasisLevel) => {
    if (!doc || !loroText) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(contentRef.current!, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;

    if (start < end) {
      applyEmphasis(doc, loroText, start, end, level);
      onAfterEdit();
    }
    setShowToolbar(false);
  }, [doc, loroText, onAfterEdit]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const blockClass = [
    'doc-block',
    isChat ? 'doc-block--chat' : 'doc-block--doc',
    isDropTarget ? 'doc-block--drop-target' : '',
    isDragging ? 'doc-block--dragging' : '',
  ].filter(Boolean).join(' ');

  // Render content with emphasis marks for doc nodes
  const renderContent = () => {
    if (node.type === 'chat') {
      return node.content;
    }
    // For doc nodes, render with emphasis via toDelta if available
    if (loroText) {
      try {
        const delta = loroText.toDelta();
        return (delta as Array<{ insert: string; attributes?: { emphasis?: number } }>).map(
          (op, i) => {
            if (typeof op.insert !== 'string') return null;
            const emphasis = op.attributes?.emphasis;
            if (emphasis === 1) {
              return <span key={i} className="emphasis-plus">{op.insert}</span>;
            } else if (emphasis === -1) {
              return <span key={i} className="emphasis-minus">{op.insert}</span>;
            }
            return <span key={i}>{op.insert}</span>;
          }
        );
      } catch {
        return node.content;
      }
    }
    return node.content;
  };

  return (
    <div
      className={blockClass}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      id={`doc-block-${index}`}
    >
      <div className="doc-block__drag-handle" title="ドラッグで並び替え">⣿</div>
      <div className="doc-block__body">
        <div className="doc-block__meta">
          <span className="doc-block__author">{node.author}</span>
          <span className="doc-block__time">{formatTime(node.timestamp)}</span>
          {isChat && <span className="doc-block__badge">chat</span>}
        </div>
        <div
          ref={contentRef}
          className="doc-block__content"
          contentEditable={node.type === 'doc'}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onMouseUp={handleMouseUp}
        >
          {renderContent()}
        </div>
        {showToolbar && node.type === 'doc' && (
          <EmphasisToolbar
            position={toolbarPos}
            onApply={handleEmphasis}
          />
        )}
      </div>
    </div>
  );
};
