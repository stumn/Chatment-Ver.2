import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { StreamNodeWithIndex, EmphasisLevel, AuthorInfo, DocNodeData } from '../types';
import { LoroText, LoroMap, type LoroDoc } from 'loro-crdt';
import { updateDocContent, applyEmphasis, moveNode, insertDocNodeAfter, deleteDocNode, EMPTY_AUTHOR } from '../loro/schema';
// No EmphasisToolbar needed

interface DocBlockProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  currentAuthorInfo: AuthorInfo;
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
  currentAuthorInfo,
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
  const isCanceledRef = useRef(false); // 慎重モードキャンセル時のblurスキップ用
  const [isDraggable, setIsDraggable] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const isChat = node.type === 'chat';

  // このブロックの著者情報
  const blockAuthor: AuthorInfo = node.author;
  const blockSubAuthors: AuthorInfo[] = node.type === 'doc' ? ((node as DocNodeData).subAuthors || []) : [];

  /**
   * 慎重モードの許可チェック
   * actionLabel: ダイアログに表示する操作の説明
   */
  const requestCautiousEdit = useCallback((actionLabel: string) => {
    if (!isCautiousMode) return true;

    const isFirstAuthor = blockAuthor.userId === currentAuthorInfo.userId && blockAuthor.userId !== '';
    const isSubAuthor = blockSubAuthors.some(sa => sa.userId === currentAuthorInfo.userId && sa.userId !== '');
    if (isFirstAuthor || isSubAuthor) return true;
    if (!blockAuthor.displayName) return true; // 空ブロック
    if (hasEditPermissionRef.current) return true;

    const subNames = blockSubAuthors.map(sa => sa.displayName).filter(Boolean);
    const ownerName = blockAuthor.displayName + (subNames.length > 0 ? ` と ${subNames.join('・')}` : '');
    const contentPreview = node.content ? `「${node.content.substring(0, 15)}${node.content.length > 15 ? '…' : ''}」` : 'このブロック';
    const confirmMessage = `${contentPreview}への${actionLabel}\nこのブロックの所有者は「${ownerName}」です。共同編集者として追加されます。よろしいですか？`;
    if (window.confirm(confirmMessage)) {
      hasEditPermissionRef.current = true;
      return true;
    }
    return false;
  }, [isCautiousMode, blockAuthor, blockSubAuthors, currentAuthorInfo, node.content]);

  const handleBlur = useCallback(() => {
    hasEditPermissionRef.current = false;
    // 慎重モードでキャンセルされた場合はblurによる保存をスキップ
    if (isCanceledRef.current) return;
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
      updateDocContent(doc, index, newText, currentAuthorInfo);
      onAfterEdit();
    }
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, currentAuthorInfo]);

  const moveUp = useCallback(() => {
    if (!doc || isFirstInDoc) return;
    moveNode(doc, index, index - 1, currentAuthorInfo);
    onAfterEdit();
    setTimeout(() => {
      const nextBlock = document.getElementById(`doc-block-${index - 1}`);
      const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
      nextContent?.focus();
    }, 50);
  }, [doc, index, isFirstInDoc, onAfterEdit, currentAuthorInfo]);

  const moveDown = useCallback(() => {
    if (!doc || isLastInDoc) return;
    moveNode(doc, index, index + 1, currentAuthorInfo);
    onAfterEdit();
    setTimeout(() => {
      const nextBlock = document.getElementById(`doc-block-${index + 1}`);
      const nextContent = nextBlock?.querySelector('.doc-block__content') as HTMLElement;
      nextContent?.focus();
    }, 50);
  }, [doc, index, isLastInDoc, onAfterEdit, currentAuthorInfo]);

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

  /**
   * 正確なキャレット位置を取得する（URLリンクなどの子ノードがある場合でも正確）
   */
  const getSelectionRange = useCallback(() => {
    try {
      if (!contentRef.current) return null;
      const docObj = contentRef.current.ownerDocument;
      const win = docObj.defaultView;
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

  /**
   * キャレットを指定文字位置に設定する
   */
  const setCaretAt = useCallback((charPos: number) => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    const sel = window.getSelection();
    if (!sel) return;

    let currentPos = 0;
    let found = false;

    const traverse = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length || 0;
        if (currentPos + len >= charPos) {
          const range = document.createRange();
          range.setStart(node, charPos - currentPos);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          found = true;
          return true;
        }
        currentPos += len;
      } else {
        for (const child of Array.from(node.childNodes)) {
          if (traverse(child)) return true;
        }
      }
      return false;
    };

    traverse(el);

    // フォールバック: テキストの末尾
    if (!found) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const handleInput = useCallback(() => {
    if (!doc || !isLastInDoc || isPlaybackActive) return;
    const currentText = contentRef.current?.textContent || '';
    // If we are at the very last block, and user types something, append an empty block below.
    if (currentText.length > 0) {
      const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);
      insertDocNodeAfter(doc, index, '', EMPTY_AUTHOR, nextEmphasis);
      onAfterEdit();
    }
  }, [doc, isLastInDoc, index, defaultEmphasis, onAfterEdit, isPlaybackActive]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isPlaybackActive) {
      e.preventDefault();
      return;
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    // isAtStart: カーソルがブロックの先頭にあるか
    const srCheck = getSelectionRange();
    const isAtStart = srCheck ? srCheck.start === 0 && srCheck.end === 0 : false;

    // Tab キーの処理 (インデント増減, 最大2に制限)
    if (e.key === 'Tab') {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデントの変更')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);
          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          onAfterEdit();
        }
        return;
      }
    }

    // Space / 全角スペース キーの処理 (インデント増加, 最大2に制限)
    if ((e.key === ' ' || e.key === '　') && !e.shiftKey) {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデントの変更')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);
          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          onAfterEdit();
        }
        return;
      }
    }

    // Backspace キーの処理
    if (e.key === 'Backspace' && !e.shiftKey) {
      const textContent = contentRef.current?.textContent || '';

      if (isAtStart && textContent !== '') {
        // インデントがあれば先にインデント減少
        const currentIndent = loroMap?.get('indent') as number || 0;
        if (currentIndent > 0) {
          e.preventDefault();
          if (!requestCautiousEdit('インデントの変更')) return;
          if (doc && loroMap) {
            loroMap.set('indent', currentIndent - 1);
            const blockId = loroMap.get('blockId') as string || `blk-${index}`;
            doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${currentIndent - 1}` });
            onAfterEdit();
          }
          return;
        }

        // インデントがない先頭でBackspace → 前ブロックとマージ
        if (!isFirstInDoc && doc) {
          e.preventDefault();
          if (!requestCautiousEdit('ブロックのマージ')) return;

          const stream = doc.getMovableList('stream');
          const prevMap = stream.get(index - 1) as LoroMap;
          if (!prevMap) return;

          const prevLoroText = prevMap.get('content') as LoroText;
          const prevTextLen = prevLoroText ? prevLoroText.length : 0;

          // 現在のテキストを前ブロックの末尾に追加
          if (textContent.length > 0 && prevLoroText) {
            prevLoroText.insert(prevTextLen, textContent);
          }

          // 現在ブロックを削除
          stream.delete(index, 1);
          doc.commit({ message: `merge:${currentAuthorInfo.displayName}:${index}` });
          onAfterEdit();

          // 前ブロックのマージ位置にカーソルを移動
          setTimeout(() => {
            const prevBlock = document.getElementById(`doc-block-${index - 1}`);
            const prevContent = prevBlock?.querySelector('.doc-block__content') as HTMLElement;
            if (prevContent) {
              prevContent.focus();
              setCaretAt(prevTextLen);
            }
          }, 50);
          return;
        }
      }

      // 空ブロックを削除して前ブロックにフォーカス
      if (textContent === '') {
        e.preventDefault();
        if (!requestCautiousEdit('ブロックの削除')) return;
        focusNextBlock(-1);
        if (doc) {
          deleteDocNode(doc, index, currentAuthorInfo);
          onAfterEdit();
        }
        return;
      }
    }

    // Enterキーの処理 (IME変換中は無視)
    if (e.key === 'Enter' && !e.shiftKey) {
      // IME変換中（日本語変換候補選択中）はEnterを無視してブラウザに委ねる
      if ((e.nativeEvent as any).isComposing) {
        return;
      }
      e.preventDefault();

      if (!requestCautiousEdit('ブロックの分割')) return;

      // getSelectionRange() を使ってURLリンクがある場合でも正確な位置を取得
      const selRange = getSelectionRange();
      const sCaretPos = selRange ? selRange.start : (contentRef.current?.textContent?.length || 0);
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
        updateDocContent(doc, index, textBeforeCursor, currentAuthorInfo);

        const currentIndent = loroMap?.get('indent') as number || 0;
        const nextIndent = Math.min(2, currentIndent + 1); // 改行して新規ブロックを作成する際は前の行 + 1 のインデント (最大2に制限)

        const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);

        const hasSubstantialAfter = textAfterCursor.replace(/[\s　]+/g, '').length > 0;
        const nextSubAuthor = hasSubstantialAfter ? currentAuthorInfo : null;

        insertDocNodeAfter(doc, index, textAfterCursor, currentAuthorInfo, nextEmphasis, nextIndent, null, nextSubAuthor);
        onAfterEdit();
        // focus logic after render is deferred
        setTimeout(() => focusNextBlock(1), 50);
      }
      return;
    }

    // Delete キーでの空ブロック削除
    if (e.key === 'Delete' && !e.shiftKey) {
      if (contentRef.current?.textContent === '') {
        e.preventDefault();
        if (!requestCautiousEdit('ブロックの削除')) return;
        focusNextBlock(-1);
        if (doc) {
          deleteDocNode(doc, index, currentAuthorInfo);
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
        focusNextBlock(-1);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (blockIndent === 0) {
          moveDown();
        }
      } else {
        focusNextBlock(1);
      }
    } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const sel2 = window.getSelection();
      if (sel2 && sel2.rangeCount > 0 && sel2.isCollapsed) {
        const sr = getSelectionRange();
        if (sr && sr.start === 0 && sr.end === 0) {
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
          e.preventDefault();
          focusNextBlock(1);
        }
      }
    }
  }, [doc, index, node, currentAuthorInfo, defaultEmphasis, onAfterEdit, moveUp, moveDown, focusNextBlock, getSelectionRange, setCaretAt, loroMap, blockIndent, requestCautiousEdit, isFirstInDoc, isPlaybackActive]);


  useEffect(() => {
    const el = contentRef.current;
    if (!el || isPlaybackActive) return;

    const handleBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (!isCautiousMode) return;

      const isFirstAuthor = blockAuthor.userId === currentAuthorInfo.userId && blockAuthor.userId !== '';
      const isSubAuthor = blockSubAuthors.some(sa => sa.userId === currentAuthorInfo.userId && sa.userId !== '');
      if (isFirstAuthor || isSubAuthor) return;

      if (!blockAuthor.displayName) return; // 空ブロック

      const inputData = ie.data || '';
      const isWhitespaceOnly = ie.data !== null && inputData !== '' && inputData.trim().length === 0;

      if (isWhitespaceOnly) {
        return;
      }

      const contentPreview = node.content ? `「${node.content.substring(0, 15)}${node.content.length > 15 ? '…' : ''}」` : 'このブロック';
      if (!requestCautiousEdit(`${contentPreview}への書き込み`)) {
        ie.preventDefault();
        // DOM を元の内容に強制リセット（キャンセル時に変更が反映されないようにする）
        const originalText = loroMap?.get('content')?.toString() || '';
        isCanceledRef.current = true;
        el.blur();
        setTimeout(() => {
          isCanceledRef.current = false;
          if (el && el.textContent !== originalText) {
            el.textContent = originalText;
          }
        }, 0);
      }
    };

    el.addEventListener('beforeinput', handleBeforeInput);
    return () => {
      el.removeEventListener('beforeinput', handleBeforeInput);
    };
  }, [doc, index, node, currentAuthorInfo, isCautiousMode, isPlaybackActive, loroMap, requestCautiousEdit, blockAuthor, blockSubAuthors]);

  // H1ボタンなどで見出し状態が変化した際にテキストの先頭の「# 」を同期する処理
  useEffect(() => {
    if (!doc || !loroText || !loroMap || isPlaybackActive) return;

    // 最新の値を直接読み取る（staleクロージャ防止）
    const currentText = loroText.toString();
    const currentHeading = loroMap.get('heading') as string | null;

    if (currentHeading === 'h1') {
      // '# ' で始まっていない場合だけ挿入（'#' で始まる場合も含めて再チェック）
      if (!currentText.startsWith('# ')) {
        if (currentText.startsWith('#')) {
          // '#' はあるが '# ' ではない → スペースを挿入
          if (!currentText.startsWith('## ')) {
            loroText.insert(1, ' ');
            doc.commit({ message: `add-hashtag-space:${loroMap.get('blockId')}` });
            onAfterEdit();
          }
        } else {
          // '#' すらない → '# ' を先頭に挿入
          loroText.insert(0, '# ');
          doc.commit({ message: `add-hashtag:${loroMap.get('blockId')}` });
          onAfterEdit();
        }
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
    if (!requestCautiousEdit('見出し設定の変更')) return;
    const currentHeading = loroMap.get('heading') as string | null;
    const nextHeading = currentHeading === 'h1' ? null : 'h1';
    loroMap.set('heading', nextHeading);

    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `toggle-h1:${currentAuthorInfo.displayName}:${blockId}:${nextHeading}` });
    onAfterEdit();
  }, [doc, loroMap, index, onAfterEdit, isPlaybackActive, requestCautiousEdit, currentAuthorInfo]);

  const setEmphasis = useCallback((level: EmphasisLevel) => {
    if (!doc || !loroMap) return;
    if (!requestCautiousEdit('文字フォントの変更')) return;

    loroMap.set('emphasis', level);
    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `emphasis:${currentAuthorInfo.displayName}:${blockId}:${level}` });

    onAfterEdit();
  }, [doc, loroMap, onAfterEdit, index, requestCautiousEdit, currentAuthorInfo]);

  const adjustIndent = useCallback((direction: number) => {
    if (!doc || !loroMap || isPlaybackActive) return;
    if (!requestCautiousEdit('インデントの変更')) return;
    const currentIndent = loroMap.get('indent') as number || 0;
    const nextIndent = Math.max(0, Math.min(2, currentIndent + direction));
    loroMap.set('indent', nextIndent);
    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
    onAfterEdit();
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, requestCautiousEdit, currentAuthorInfo]);

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
    const intensity = Math.min(1.0, Math.floor(voteScore / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(130, 60%, 45%, ${intensity})` };
  } else if (voteScore < 0) {
    const intensity = Math.min(1.0, Math.floor(Math.abs(voteScore) / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(0, 70%, 55%, ${intensity})` };
  }
  const isHighlighted = activeHighlightBlockId === nodeWithIndex.id;
  const showDragHandle = true;
  const isContentEmpty = node.content === '';
  const blockClass = [
    'doc-block',
    `doc-block--indent-${blockIndent}`,
    isChat ? 'doc-block--chat' : 'doc-block--doc',
    blockHeading === 'h1' ? 'doc-block--h1' : '',
    `doc-emphasis-${blockEmphasis}`,
    isDropTarget ? 'doc-block--drop-target' : '',
    isDragging ? 'doc-block--dragging' : '',
    isHighlighted ? 'playback-highlight' : '',
    isContentEmpty ? 'doc-block--empty' : '',
  ].filter(Boolean).join(' ');

  // Render content safely via HTML for contentEditable support without React child fights
  const renderContentAsHTML = (): string => {
    const text = node.content || '';
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
              {blockAuthor.displayName || '不明'}
              {blockSubAuthors.length > 0 && ` (+${blockSubAuthors.map(sa => sa.displayName).join('・')})`}
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
            {/* 上段：インデント切替 */}
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
