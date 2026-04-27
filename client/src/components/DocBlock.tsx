import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { StreamNodeWithIndex, EmphasisLevel } from '../types';
import { LoroText, type LoroDoc } from 'loro-crdt';
import { updateDocContent, applyEmphasis, moveNode, insertDocNodeAfter, deleteDocNode } from '../loro/schema';
// No EmphasisToolbar needed

interface DocBlockProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  userName: string;
  defaultEmphasis: number;
  isFirstInDoc?: boolean;
  isLastInDoc?: boolean;
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
  userName,
  defaultEmphasis,
  isFirstInDoc,
  isLastInDoc,
  isDropTarget,
  isDragging,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAfterEdit,
}) => {
  const { node, index, loroText, loroMap } = nodeWithIndex;
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDraggable, setIsDraggable] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, selectionRange: { start: number, end: number } | null } | null>(null);
  const [renderKey, setRenderKey] = useState(0); // Used to forcefully remount contentEditable
  const isChat = node.type === 'chat';

  const handleBlur = useCallback(() => {
    if (!doc || !contentRef.current) return;
    const newText = contentRef.current.textContent || '';
    if (newText !== node.content) {
      updateDocContent(doc, index, newText);
      onAfterEdit();
    }
  }, [doc, index, node.content, onAfterEdit]);

  const moveUp = useCallback(() => {
    if (!doc || isFirstInDoc) return;
    moveNode(doc, index, index - 1);
    onAfterEdit();
    setContextMenu(null);
    setTimeout(() => {
      const nextBlock = document.getElementById(`doc-block-${index - 1}`);
      const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
      nextContent?.focus();
    }, 50);
  }, [doc, index, isFirstInDoc, onAfterEdit]);

  const moveDown = useCallback(() => {
    if (!doc || isLastInDoc) return;
    moveNode(doc, index, index + 1);
    onAfterEdit();
    setContextMenu(null);
    setTimeout(() => {
      const nextBlock = document.getElementById(`doc-block-${index + 1}`);
      const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
      nextContent?.focus();
    }, 50);
  }, [doc, index, isLastInDoc, onAfterEdit]);

  const focusNextBlock = useCallback((offset: number) => {
    const nextBlock = document.getElementById(`doc-block-${index + offset}`);
    const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
    if (nextContent) {
      nextContent.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(nextContent);
      if (offset < 0) {
        range.collapse(false); // end of line
      } else {
        range.collapse(true); // start of line
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [index]);

  const getSelectionRange = useCallback(() => {
    try {
      if (!contentRef.current) return null;
      const doc = contentRef.current.ownerDocument;
      const win = doc.defaultView;
      if (!win) return null;
      const sel = win.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);

        // Ensure selection is inside this doc block
        if (!contentRef.current.contains(range.commonAncestorContainer)) {
          return null;
        }

        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(contentRef.current);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        const start = preCaretRange.toString().length;
        const end = start + range.toString().length;
        return { start, end };
      }
    } catch (e) {
      console.error('Failed to get selection range:', e);
    }
    return null;
  }, []);

  const handleInput = useCallback(() => {
    if (!doc || !isLastInDoc) return;
    const currentText = contentRef.current?.textContent || '';
    // If we are at the very last block, and user types something, append an empty block below.
    if (currentText.length > 0) {
      insertDocNodeAfter(doc, index, '', userName, defaultEmphasis);
      onAfterEdit();
    }
  }, [doc, isLastInDoc, index, userName, defaultEmphasis, onAfterEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      const caretPos = range?.startOffset || 0;
      const newText = contentRef.current?.textContent || '';

      // Delete any remnants after the cursor and insert a new block with them
      const textAfterCursor = newText.substring(caretPos);
      if (doc) {
        if (caretPos < newText.length) {
          updateDocContent(doc, index, newText.substring(0, caretPos));
        } else {
          updateDocContent(doc, index, newText);
        }

        insertDocNodeAfter(doc, index, textAfterCursor, userName, defaultEmphasis);
        onAfterEdit();
        // focus logic after render is deferred
        setTimeout(() => focusNextBlock(1), 50);
      }
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.shiftKey) {
      if (contentRef.current?.textContent === '') {
        e.preventDefault();
        // Remove block and focus previous
        focusNextBlock(-1);
        if (doc) {
          deleteDocNode(doc, index);
          onAfterEdit();
        }
        return;
      }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        moveUp();
      } else {
        // focus previous block
        focusNextBlock(-1);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        moveDown();
      } else {
        // focus next block
        focusNextBlock(1);
      }
    } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const sr = getSelectionRange();
        if (sr && sr.start === 0 && sr.end === 0) {
          // At the very beginning of the line
          e.preventDefault();
          focusNextBlock(-1);
        }
      }
    } else if (e.key === 'ArrowRight' && !e.shiftKey) {
      const textLen = contentRef.current?.textContent?.length || 0;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const sr = getSelectionRange();
        if (sr && sr.start === textLen && sr.end === textLen) {
          // At the very end of the line
          e.preventDefault();
          focusNextBlock(1);
        }
      }
    }
  }, [doc, index, node, userName, defaultEmphasis, onAfterEdit, moveUp, moveDown, focusNextBlock, getSelectionRange]);


  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore if right clicking the drag handle or info button
    if ((e.target as HTMLElement).closest('.doc-block__meta-toggle') ||
      (e.target as HTMLElement).closest('.doc-block__drag-handle')) {
      return;
    }

    const sr = getSelectionRange();
    setContextMenu({ x: e.clientX, y: e.clientY, selectionRange: sr });
  }, [getSelectionRange]);

  useEffect(() => {
    if (contextMenu) {
      const closeMenu = () => setContextMenu(null);
      // Slight delay to avoid immediate closure if triggered weirdly
      const timer = setTimeout(() => {
        window.addEventListener('click', closeMenu);
        window.addEventListener('contextmenu', closeMenu);
      }, 10);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', closeMenu);
        window.removeEventListener('contextmenu', closeMenu);
      };
    }
  }, [contextMenu]);

  const setEmphasis = useCallback((level: EmphasisLevel) => {
    if (!doc || !loroMap) return;

    // Apply the block-level style mapping (simple key-value setting)
    loroMap.set('emphasis', level);
    doc.commit();

    onAfterEdit();
    setContextMenu(null);
  }, [doc, loroMap, onAfterEdit]);

  // moveUp and moveDown have been moved up
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  // Read emphasis level from Map for doc blocks (block level styling)
  const blockEmphasis = loroMap?.get('emphasis') as EmphasisLevel || 0;

  console.log(`[DocBlock Debug] Block ${index} Connection:`, {
    hasDoc: !!doc,
    hasMap: !!loroMap,
    hasText: !!loroText,
    blockEmphasis,
    textLength: loroText?.length
  });

  // Calculate total reactions
  let totalReactions = 0;
  if ('reactions' in node && node.reactions) {
    totalReactions = Object.values(node.reactions).length;
  }

  const isOrganized = node.isOrganized ?? (isChat ? false : true);

  const blockClass = [
    'doc-block',
    isChat ? 'doc-block--chat' : 'doc-block--doc',
    isOrganized ? 'doc-block--organized' : 'doc-block--unorganized',
    contextMenu ? 'doc-block--focused' : '',
    `doc-emphasis-${blockEmphasis}`,
    totalReactions >= 5 ? 'doc-block--highly-reacted' : '',
    isDropTarget ? 'doc-block--drop-target' : '',
    isDragging ? 'doc-block--dragging' : '',
  ].filter(Boolean).join(' ');

  // Render content safely via HTML for contentEditable support without React child fights
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const renderContentAsHTML = (): string => {
    // インライン装飾(LoroTextデルタ等)は廃止されたため、単純なプレーンテキストとして出力
    return escapeHtml(node.content || '');
  };

  const isContentEmpty = node.content === '';

  return (
    <div
      className={blockClass}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      id={`doc-block-${index}`}
      onContextMenu={handleContextMenu}
    >
      <div
        className="doc-block__meta-toggle"
        onMouseEnter={() => !isContentEmpty && setShowMeta(true)}
        onMouseLeave={() => setShowMeta(false)}
        style={{ visibility: isContentEmpty ? 'hidden' : 'visible' }}
      >
        <div className="doc-block__timeline-circle"></div>
        {showMeta && !isContentEmpty && (
          <div className="doc-block__meta-tooltip">
            <span className="doc-block__author">{node.author}</span>
            <span className="doc-block__time">{formatTime(node.timestamp)}</span>
            {totalReactions > 0 && <span className="doc-block__reaction-count">リアクション {totalReactions}件</span>}
          </div>
        )}
      </div>
      <div
        className="doc-block__drag-handle"
        title="ドラッグで並び替え"
        onMouseEnter={() => setIsDraggable(true)}
        onMouseLeave={() => setIsDraggable(false)}
      >⣿</div>
      <div className="doc-block__body">
        <div
          ref={contentRef}
          className="doc-block__content"
          contentEditable={true}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          dangerouslySetInnerHTML={{ __html: renderContentAsHTML() }}
        />
      </div>

      {contextMenu && (
        <div
          className="doc-block__context-menu"
          style={{ position: 'fixed', top: contextMenu.y - 40, left: contextMenu.x, zIndex: 100000 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <button className="context-menu__item" title="太字" onMouseDown={(e) => e.preventDefault()} onClick={() => setEmphasis(1)}>
            <span style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--text-primary)' }}>B</span>
          </button>
          <button className="context-menu__item" title="標準" onMouseDown={(e) => e.preventDefault()} onClick={() => setEmphasis(0)}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#666' }}></span>
          </button>
          <button className="context-menu__item" title="控えめ" onMouseDown={(e) => e.preventDefault()} onClick={() => setEmphasis(-1)}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#aaa' }}></span>
          </button>
          <div className="context-menu__divider"></div>

          <button className="context-menu__item" title="上へ移動 (Ctrl+↑)" onMouseDown={(e) => e.preventDefault()} onClick={moveUp}>
             <span style={{ fontSize: '12px', lineHeight: 1 }}>↑</span>
          </button>
          <button className="context-menu__item" title="下へ移動 (Ctrl+↓)" onMouseDown={(e) => e.preventDefault()} onClick={moveDown}>
             <span style={{ fontSize: '12px', lineHeight: 1 }}>↓</span>
          </button>
        </div>
      )}
    </div>
  );
};
