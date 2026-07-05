import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { StreamNodeWithIndex, EmphasisLevel } from '../types';
import { LoroText, type LoroDoc } from 'loro-crdt';
import { updateDocContent, applyEmphasis, moveNode, insertDocNodeAfter, deleteDocNode } from '../loro/schema';
// No EmphasisToolbar needed

interface DocBlockProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  userName: string;
  defaultEmphasis: number | 'h1';
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
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
  isPlaybackActive?: boolean;
  activeHighlightBlockId?: string | null;
  isCautiousMode?: boolean;
}

const getIndentMargin = (indent: number) => {
  if (indent === 1) return 32;
  if (indent >= 2) return 60;
  return 0;
};

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
  onJumpToNode,
  isPlaybackActive,
  activeHighlightBlockId,
  isCautiousMode,
}) => {
  const { node, index, loroText, loroMap } = nodeWithIndex;
  const blockIndent = node.type === 'doc' ? (node as any).indent || 0 : 0;
  const blockHeading = node.type === 'doc' ? (node as any).heading || null : null;
  const contentRef = useRef<HTMLDivElement>(null);
  const hasEditPermissionRef = useRef(false);
  const [isDraggable, setIsDraggable] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [renderKey, setRenderKey] = useState(0); // Used to forcefully remount contentEditable
  const isChat = node.type === 'chat';

  const requestCautiousEdit = useCallback((actionLabel: string) => {
    if (!isCautiousMode) return true;

    const isFirstAuthor = node.author === userName;
    const isSubAuthor = (loroMap?.get('subAuthor') as string | undefined) === userName;
    if (isFirstAuthor || isSubAuthor) return true;
    if (!node.author) return true;
    if (hasEditPermissionRef.current) return true;

    const subAuthorVal = loroMap?.get('subAuthor') as string | undefined;
    const ownerName = node.author + (subAuthorVal ? ` と ${subAuthorVal}` : '');
    const confirmMessage = `${actionLabel}を行いますか？\nこのブロックの所有者は「${ownerName}」です。編集（共同編集者として追加）しますか？`;
    if (window.confirm(confirmMessage)) {
      hasEditPermissionRef.current = true;
      return true;
    }
    return false;
  }, [isCautiousMode, node.author, loroMap, userName]);

  const handleBlur = useCallback(() => {
    hasEditPermissionRef.current = false;
    if (!doc || !contentRef.current || isPlaybackActive) return;
    const newText = contentRef.current.textContent || '';
    const currentText = loroMap?.get('content')?.toString() || '';

    let isH1 = false;
    if (newText.startsWith('#')) {
      isH1 = true;
    }

    const currentHeading = loroMap?.get('heading') || null;
    const nextHeading = isH1 ? 'h1' : null;

    const textChanged = newText !== currentText;
    const headingChanged = nextHeading !== currentHeading;

    if (textChanged || headingChanged) {
      if (headingChanged && loroMap) {
        loroMap.set('heading', nextHeading);
      }
      updateDocContent(doc, index, newText, userName);
      onAfterEdit();
    }
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, userName]);

  const moveUp = useCallback(() => {
    if (!doc || isFirstInDoc) return;
    moveNode(doc, index, index - 1, userName);
    onAfterEdit();
    setTimeout(() => {
      const nextBlock = document.getElementById(`doc-block-${index - 1}`);
      const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
      nextContent?.focus();
    }, 50);
  }, [doc, index, isFirstInDoc, onAfterEdit]);

  const moveDown = useCallback(() => {
    if (!doc || isLastInDoc) return;
    moveNode(doc, index, index + 1, userName);
    onAfterEdit();
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
    if (!doc || !isLastInDoc || isPlaybackActive) return;
    const currentText = contentRef.current?.textContent || '';
    // If we are at the very last block, and user types something, append an empty block below.
    if (currentText.length > 0) {
      const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);
      insertDocNodeAfter(doc, index, '', userName, nextEmphasis);
      onAfterEdit();
    }
  }, [doc, isLastInDoc, index, userName, defaultEmphasis, onAfterEdit, isPlaybackActive]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isPlaybackActive) {
      e.preventDefault();
      return;
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const caretPos = range ? range.startOffset : 0;
    const isAtStart = range ? (
      caretPos === 0 && (
        range.startContainer === contentRef.current ||
        range.startContainer.parentNode === contentRef.current ||
        contentRef.current?.textContent === ''
      )
    ) : false;

    // Tab キーの処理 (インデント増減, 最大2に制限)
    if (e.key === 'Tab') {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデント')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);
          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${userName}:${blockId}:${nextIndent}` });
          onAfterEdit();
        }
        return;
      }
    }

    // Space / 全角スペース キーの処理 (インデント増加, 最大2に制限)
    if ((e.key === ' ' || e.key === '　') && !e.shiftKey) {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデント')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);
          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${userName}:${blockId}:${nextIndent}` });
          onAfterEdit();
        }
        return;
      }
    }

    // Backspace キーの処理 (インデント減少)
    if (e.key === 'Backspace' && !e.shiftKey) {
      if (isAtStart && contentRef.current?.textContent !== '') {
        const currentIndent = loroMap?.get('indent') as number || 0;
        if (currentIndent > 0) {
          e.preventDefault();
          if (!requestCautiousEdit('インデント')) return;
          if (doc && loroMap) {
            loroMap.set('indent', currentIndent - 1);
            const blockId = loroMap.get('blockId') as string || `blk-${index}`;
            doc.commit({ message: `indent:${userName}:${blockId}:${currentIndent - 1}` });
            onAfterEdit();
          }
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const selection = window.getSelection();
      const sRange = selection?.getRangeAt(0);
      const sCaretPos = sRange?.startOffset || 0;
      const newText = contentRef.current?.textContent || '';

      // # の検知を行って現在の行の見出し情報を更新する
      let isH1 = false;
      if (newText.startsWith('#')) {
        isH1 = true;
      }
      if (loroMap) {
        loroMap.set('heading', isH1 ? 'h1' : null);
      }

      const textAfterCursor = newText.substring(sCaretPos);
      const textBeforeCursor = newText.substring(0, sCaretPos);

      if (doc) {
        updateDocContent(doc, index, textBeforeCursor, userName);

        const currentIndent = loroMap?.get('indent') as number || 0;
        const nextIndent = Math.min(2, currentIndent + 1); // 改行して新規ブロックを作成する際は前の行 + 1 のインデント (最大2に制限)

        const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);

        const currentAuthor = node.author || userName;
        const hasSubstantialAfter = textAfterCursor.replace(/[\s　]+/g, '').length > 0;
        const nextSubAuthor = hasSubstantialAfter ? userName : null;

        insertDocNodeAfter(doc, index, textAfterCursor, currentAuthor, nextEmphasis, nextIndent, null, nextSubAuthor);
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
          deleteDocNode(doc, index, userName);
          onAfterEdit();
        }
        return;
      }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (blockIndent === 0) {
          moveUp();
        }
      } else {
        // focus previous block
        focusNextBlock(-1);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (blockIndent === 0) {
          moveDown();
        }
      } else {
        // focus next block
        focusNextBlock(1);
      }
    } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const sel2 = window.getSelection();
      if (sel2 && sel2.rangeCount > 0 && sel2.isCollapsed) {
        const sr = getSelectionRange();
        if (sr && sr.start === 0 && sr.end === 0) {
          // At the very beginning of the line
          e.preventDefault();
          focusNextBlock(-1);
        }
      }
    } else if (e.key === 'ArrowRight' && !e.shiftKey) {
      const textLen = contentRef.current?.textContent?.length || 0;
      const sel2 = window.getSelection();
      if (sel2 && sel2.rangeCount > 0 && sel2.isCollapsed) {
        const sr = getSelectionRange();
        if (sr && sr.start === textLen && sr.end === textLen) {
          // At the very end of the line
          e.preventDefault();
          focusNextBlock(1);
        }
      }
    }
  }, [doc, index, node, userName, defaultEmphasis, onAfterEdit, moveUp, moveDown, focusNextBlock, getSelectionRange, loroMap, blockIndent, requestCautiousEdit]);



  useEffect(() => {
    const el = contentRef.current;
    if (!el || isPlaybackActive) return;

    const handleBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (!isCautiousMode) return;

      const isFirstAuthor = node.author === userName;
      const isSubAuthor = (loroMap?.get('subAuthor') as string) === userName;
      if (isFirstAuthor || isSubAuthor) return;

      if (!node.author) return;

      const inputData = ie.data || '';
      const isWhitespaceOnly = ie.data !== null && inputData !== '' && inputData.trim().length === 0;

      if (isWhitespaceOnly) {
        return;
      }

      if (!requestCautiousEdit('編集')) {
        ie.preventDefault();
        el.blur();
      }
    };

    el.addEventListener('beforeinput', handleBeforeInput);
    return () => {
      el.removeEventListener('beforeinput', handleBeforeInput);
    };
  }, [doc, index, node, userName, isCautiousMode, isPlaybackActive, loroMap, requestCautiousEdit]);

  // H1ボタンなどで見出し状態が変化した際にテキストの先頭の「# 」を同期する処理
  useEffect(() => {
    if (!doc || !loroText || !loroMap || isPlaybackActive) return;

    const currentText = loroText.toString();
    const currentHeading = loroMap.get('heading') as string | null;

    if (currentHeading === 'h1') {
      if (!currentText.startsWith('#')) {
        loroText.insert(0, '# ');
        doc.commit({ message: `add-hashtag:${loroMap.get('blockId')}` });
        onAfterEdit();
      }
    } else {
      if (currentText.startsWith('# ')) {
        loroText.delete(0, 2);
        doc.commit({ message: `remove-hashtag:${loroMap.get('blockId')}` });
        onAfterEdit();
      } else if (currentText.startsWith('#')) {
        loroText.delete(0, 1);
        doc.commit({ message: `remove-hashtag:${loroMap.get('blockId')}` });
        onAfterEdit();
      }
    }
  }, [blockHeading, doc, loroText, loroMap, onAfterEdit, isPlaybackActive]);

  const toggleH1 = useCallback(() => {
    if (!doc || !loroMap || isPlaybackActive) return;
    if (!requestCautiousEdit('見出し')) return;
    const currentHeading = loroMap.get('heading') as string | null;
    const nextHeading = currentHeading === 'h1' ? null : 'h1';
    loroMap.set('heading', nextHeading);

    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `toggle-h1:${userName}:${blockId}:${nextHeading}` });
    onAfterEdit();
  }, [doc, loroMap, index, onAfterEdit, isPlaybackActive, requestCautiousEdit]);

  const setEmphasis = useCallback((level: EmphasisLevel) => {
    if (!doc || !loroMap) return;
    if (!requestCautiousEdit('強調')) return;

    // Apply the block-level style mapping (simple key-value setting)
    loroMap.set('emphasis', level);
    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `emphasis:${userName}:${blockId}:${level}` });

    onAfterEdit();
  }, [doc, loroMap, onAfterEdit, index, requestCautiousEdit]);

  const adjustIndent = useCallback((direction: number) => {
    if (!doc || !loroMap || isPlaybackActive) return;
    if (!requestCautiousEdit('インデント')) return;
    const currentIndent = loroMap.get('indent') as number || 0;
    const nextIndent = Math.max(0, Math.min(2, currentIndent + direction));
    loroMap.set('indent', nextIndent);
    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `indent:${userName}:${blockId}:${nextIndent}` });
    onAfterEdit();
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, requestCautiousEdit]);

  // moveUp and moveDown have been moved up
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  // Read emphasis level from Map for doc blocks (block level styling)
  const blockEmphasis = loroMap?.get('emphasis') as EmphasisLevel || 0;


  // Calculate total reactions and dynamic vote emphasis
  let totalReactions = 0;
  let upvotes = 0;
  let downvotes = 0;
  if ('reactions' in node && node.reactions) {
    totalReactions = Object.values(node.reactions).length;
    Object.values(node.reactions).forEach(emoji => {
      if (emoji === '⇧') upvotes++;
      if (emoji === '⇩') downvotes++;
    });
  }
  const voteScore = upvotes - downvotes;

  let dynamicStyle: React.CSSProperties = {
    marginLeft: `${getIndentMargin(blockIndent)}px`,
    width: `calc(100% - ${getIndentMargin(blockIndent)}px)`,
    transition: 'background 0.3s ease, margin-left 0.2s ease, width 0.2s ease',
  };
  if (voteScore > 0) {
    // 2 votes = 0.15 intensity step
    const intensity = Math.min(1.0, Math.floor(voteScore / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(130, 60%, 45%, ${intensity})` };
  } else if (voteScore < 0) {
    const intensity = Math.min(1.0, Math.floor(Math.abs(voteScore) / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(0, 70%, 55%, ${intensity})` };
  }
  const isHighlighted = activeHighlightBlockId === nodeWithIndex.id;
  const showDragHandle = true;
  const blockClass = [
    'doc-block',
    `doc-block--indent-${blockIndent}`,
    isChat ? 'doc-block--chat' : 'doc-block--doc',
    blockHeading === 'h1' ? 'doc-block--h1' : '',
    `doc-emphasis-${blockEmphasis}`,
    isDropTarget ? 'doc-block--drop-target' : '',
    isDragging ? 'doc-block--dragging' : '',
    isHighlighted ? 'playback-highlight' : '',
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
    const text = node.content || '';
    // URLを検出して<a>タグに変換（半角スペース・全角文字手前で区切る）
    const urlRegex = /(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef<>"]+)/g;
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#039;')
               .replace(urlRegex, (url) =>
                 `<a href="${url}" target="_blank" rel="noopener noreferrer" class="doc-inline-link" onclick="event.stopPropagation()">${url}</a>`
               );
  };

  const isContentEmpty = node.content === '';

  return (
    <div
      className={blockClass}
      style={dynamicStyle}
      draggable={isPlaybackActive ? false : isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      id={`doc-block-${index}`}
    >
      <div
        className="doc-block__meta-toggle"
        onMouseEnter={() => !isContentEmpty && setShowMeta(true)}
        onMouseLeave={() => setShowMeta(false)}
        style={{ visibility: isContentEmpty ? 'hidden' : 'visible', cursor: 'pointer' }}
        onClick={() => onJumpToNode(index, 'chat')}
        title="チャット画面へジャンプ"
      >
        {isChat ? (
          <div className="doc-block__timeline-circle"></div>
        ) : (
          <div className={`doc-block__timeline-circle doc-block__timeline-circle--indent-${blockIndent >= 2 ? 2 : blockIndent}`}>
            {blockIndent === 1 ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <path d="M3 1.5l4 3.5-4 3.5" />
              </svg>
            ) : blockIndent >= 2 ? (
              <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <path d="M3 1.5l4 3.5-4 3.5 M9 1.5l4 3.5-4 3.5" />
              </svg>
            ) : null}
          </div>
        )}
        {showMeta && !isContentEmpty && (
          <div className="doc-block__meta-tooltip">
            <span className="doc-block__author" style={{ color: isChat ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
              {node.author || '不明'}
              {node.type === 'doc' && (node as any).subAuthor && ` (+${(node as any).subAuthor})`}
            </span>
            <span className="doc-block__time">{formatTime(node.timestamp)}</span>
            {totalReactions > 0 && <span className="doc-block__reaction-count">リアクション {totalReactions}件</span>}
          </div>
        )}
      </div>
      <div className="doc-block__body">
        <div
          ref={contentRef}
          className="doc-block__content"
          contentEditable={!isPlaybackActive}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: renderContentAsHTML() }}
          style={{ cursor: isPlaybackActive ? 'default' : 'text' }}
        />
      </div>
      {/* ホバー時に用紙の右側外側（余白）に出っ張って表示される直感的な2段アクションツールバー */}
      {!isPlaybackActive && (
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
                marginRight: '6px'
              }}
            >
              ⣿
            </div>
          )}

          <div className="action-toolbar__controls-grid" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* 上段：インデント切替 (現在のインデント状態を◯/›/»で表現し、クリックで選択) */}
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
                onClick={() => {
                  if (blockHeading !== 'h1' && blockEmphasis !== 0) setEmphasis(0);
                  toggleH1();
                }}
                style={{ fontSize: '10px' }}
              >
                H1
              </button>
              <button
                className={`action-toolbar__btn ${blockHeading !== 'h1' && blockEmphasis === 0 ? 'is-active' : ''}`}
                title="標準 (●)"
                onClick={() => {
                  if (blockHeading === 'h1') toggleH1();
                  if (blockEmphasis !== 0) setEmphasis(0);
                }}
                style={{ fontSize: '10px' }}
              >
                ●
              </button>
              <button
                className={`action-toolbar__btn ${blockHeading !== 'h1' && blockEmphasis === -1 ? 'is-active' : ''}`}
                title="控えめ (●)"
                onClick={() => {
                  if (blockHeading === 'h1') toggleH1();
                  setEmphasis(-1);
                }}
                style={{ fontSize: '10px', color: '#999' }}
              >
                ●
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
