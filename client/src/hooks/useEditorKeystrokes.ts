import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { AuthorInfo, StreamNode } from '../types';
import { LoroText, LoroMap, type LoroDoc } from 'loro-crdt';
import { updateDocContent, insertDocNodeAfter, deleteDocNode, EMPTY_AUTHOR } from '../loro/schema';
import { emitUserAction } from '../loro/sync-client';

interface UseEditorKeystrokesProps {
  doc: LoroDoc | null;
  index: number;
  node: StreamNode;
  loroText: LoroText | undefined;
  loroMap: LoroMap | undefined;
  currentAuthorInfo: AuthorInfo;
  defaultEmphasis: number | 'h1';
  isFirstInDoc?: boolean;
  isLastInDoc?: boolean;
  onAfterEdit: () => void;
  requestCautiousEditAsync: (actionLabel: string, afterState?: { content?: string; indent?: number; heading?: string | null; emphasis?: number; isDeleted?: boolean }) => Promise<boolean>;
  saveContentAndHeadingOnBlur: () => Promise<void> | void;
  moveUp: () => void;
  moveDown: () => void;
  contentRef: RefObject<HTMLDivElement | null>;
  isCanceledRef: React.MutableRefObject<boolean>;
  resetPermission: () => void;
}

export function useEditorKeystrokes({
  doc,
  index,
  node,
  loroText,
  loroMap,
  currentAuthorInfo,
  defaultEmphasis,
  isFirstInDoc,
  isLastInDoc,
  onAfterEdit,
  requestCautiousEditAsync,
  saveContentAndHeadingOnBlur,
  moveUp,
  moveDown,
  contentRef,
  isCanceledRef,
  resetPermission,
}: UseEditorKeystrokesProps) {
  const [isDraggable, setIsDraggable] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isApplyingHashtagRef = useRef(false);
  const pendingCaretPosRef = useRef<number | null>(null);

  const isChat = node.type === 'chat';
  const blockIndent = node.indent || 0;
  const blockHeading = node.heading ?? (/^[#＃]/.test(node.content) ? 'h1' : null);

  const setPendingCaretPos = useCallback((pos: number | null) => {
    pendingCaretPosRef.current = pos;
  }, []);

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
  }, [contentRef]);

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

    const traverse = (n: Node): boolean => {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = n.textContent?.length || 0;
        if (currentPos + len >= charPos) {
          const range = document.createRange();
          range.setStart(n, charPos - currentPos);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          found = true;
          return true;
        }
        currentPos += len;
      } else {
        for (const child of Array.from(n.childNodes)) {
          if (traverse(child)) return true;
        }
      }
      return false;
    };

    traverse(el);

    if (!found) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [contentRef]);

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

  const handleFocus = useCallback(() => {
    const wasFocused = isFocused;
    setIsFocused(true);

    if (!wasFocused && blockHeading === 'h1') {
      const range = getSelectionRange();
      if (range !== null) {
        const match = (node.content || '').match(/^[#＃][ 　]*/);
        const prefixLen = match ? match[0].length : 2;
        requestAnimationFrame(() => {
          setCaretAt(range.start + prefixLen);
        });
      }
    }
  }, [isFocused, blockHeading, node.content, getSelectionRange, setCaretAt]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    resetPermission();
    if (isCanceledRef.current) return;
    saveContentAndHeadingOnBlur();
  }, [resetPermission, saveContentAndHeadingOnBlur, isCanceledRef]);

  const handleInput = useCallback(() => {
    if (!doc) return;

    if (!isLastInDoc) return;
    const currentText = contentRef.current?.textContent || '';
    if (currentText.length > 0) {
      const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);
      insertDocNodeAfter(doc, index, '', EMPTY_AUTHOR, nextEmphasis);
      onAfterEdit();
    }
  }, [doc, isLastInDoc, index, defaultEmphasis, onAfterEdit, contentRef]);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    const textContent = contentRef.current?.textContent || '';
    const srCheck = getSelectionRange();
    const isAtStart = srCheck
      ? (srCheck.start === 0 && srCheck.end === 0) || textContent.replace(/[\s　]+/g, '').length === 0
      : textContent.replace(/[\s　]+/g, '').length === 0;

    // Tab キーの処理
    if (e.key === 'Tab') {
      if (isAtStart) {
        e.preventDefault();
        if (blockHeading === 'h1' || (loroMap && loroMap.get('heading') === 'h1')) return;
        if (!(await requestCautiousEditAsync('インデントの変更'))) return;
        if (doc && loroMap) {
          const currentIndent = (loroMap.get('indent') as number) || 0;
          const nextIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);

          const currentHeading = loroMap.get('heading') as string | null;
          if (currentHeading === 'h1') {
            loroMap.set('heading', null);
          }

          const blockId = (loroMap.get('blockId') as string) || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          emitUserAction({
            type: 'indent',
            targetId: blockId,
            before: { indent: currentIndent },
            after: { indent: nextIndent },
            actionDetails: `インデント変更: ${currentIndent} → ${nextIndent}`,
          });
          onAfterEdit();

          setTimeout(() => {
            if (contentRef.current && doc) {
              const text = contentRef.current.textContent || '';
              const cleanedText = text.replace(/^[\s　\t]+/g, '');
              if (text !== cleanedText) {
                contentRef.current.textContent = cleanedText;
                updateDocContent(doc, index, cleanedText, currentAuthorInfo);
              }
            }
          }, 20);
        }
        return;
      }
    }

    // Space キーの処理
    if ((e.key === ' ' || e.key === '　' || e.code === 'Space') && !e.shiftKey) {
      if (isAtStart) {
        e.preventDefault();
        if (blockHeading === 'h1' || (loroMap && loroMap.get('heading') === 'h1')) return;
        if (!(await requestCautiousEditAsync('インデントの変更'))) return;
        if (doc && loroMap) {
          const currentIndent = (loroMap.get('indent') as number) || 0;
          const nextIndent = Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);

          const currentHeading = loroMap.get('heading') as string | null;
          if (currentHeading === 'h1') {
            loroMap.set('heading', null);
          }

          const blockId = (loroMap.get('blockId') as string) || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          emitUserAction({
            type: 'indent',
            targetId: blockId,
            before: { indent: currentIndent },
            after: { indent: nextIndent },
            actionDetails: `インデント変更: ${currentIndent} → ${nextIndent}`,
          });
          onAfterEdit();

          setTimeout(() => {
            if (contentRef.current && doc) {
              const text = contentRef.current.textContent || '';
              const cleanedText = text.replace(/^[\s　\t]+/g, '');
              if (text !== cleanedText) {
                contentRef.current.textContent = cleanedText;
                updateDocContent(doc, index, cleanedText, currentAuthorInfo);
              }
            }
          }, 20);
        }
        return;
      }
    }

    // Backspace キーの処理
    if (e.key === 'Backspace' && !e.shiftKey) {
      const currentIndent = (loroMap?.get('indent') as number) || 0;
      const currentHeading = loroMap?.get('heading') as string | null;

      if (doc && loroMap && currentHeading === 'h1') {
        const srCheck2 = getSelectionRange();
        if (srCheck2 && srCheck2.start <= 2) {
          e.preventDefault();
          if (!(await requestCautiousEditAsync('スタイルの変更'))) return;

          loroMap.set('heading', null);

          const cleanedText = textContent.replace(/^[#＃]\s*/, '');
          updateDocContent(doc, index, cleanedText, currentAuthorInfo);
          if (contentRef.current) {
            contentRef.current.textContent = cleanedText;
          }

          const blockId = (loroMap.get('blockId') as string) || `blk-${index}`;
          doc.commit({ message: `format-style:${currentAuthorInfo.displayName}:${blockId}:normal` });
          onAfterEdit();

          setTimeout(() => {
            setCaretAt(0);
          }, 10);
          return;
        }
      }

      if (isAtStart) {
        if (currentIndent > 0) {
          e.preventDefault();
          if (!(await requestCautiousEditAsync('インデントの変更'))) return;
          if (doc && loroMap) {
            loroMap.set('indent', currentIndent - 1);

            const currentHeading2 = loroMap.get('heading') as string | null;
            if (currentHeading2 === 'h1') {
              loroMap.set('heading', null);
            }

            const blockId = (loroMap.get('blockId') as string) || `blk-${index}`;
            doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${currentIndent - 1}` });
            emitUserAction({
              type: 'indent',
              targetId: blockId,
              before: { indent: currentIndent },
              after: { indent: currentIndent - 1 },
              actionDetails: `インデント変更: ${currentIndent} → ${currentIndent - 1}`,
            });
            onAfterEdit();
          }
          return;
        }

        if (textContent === '') {
          e.preventDefault();
          if (!(await requestCautiousEditAsync('ブロックの削除'))) return;
          focusNextBlock(-1);
          if (doc) {
            deleteDocNode(doc, index, currentAuthorInfo);
            onAfterEdit();
          }
          return;
        }

        if (!isFirstInDoc && doc) {
          e.preventDefault();
          if (!(await requestCautiousEditAsync('ブロックのマージ'))) return;

          const stream = doc.getMovableList('stream');
          const prevMap = stream.get(index - 1) as LoroMap;
          if (!prevMap) return;

          const prevLoroText = prevMap.get('content') as LoroText;
          const prevTextLen = prevLoroText ? prevLoroText.length : 0;
          const prevText = prevLoroText ? prevLoroText.toString() : '';

          if (textContent.length > 0 && prevLoroText) {
            prevLoroText.insert(prevTextLen, textContent);
          }

          stream.delete(index, 1);
          doc.commit({ message: `merge:${currentAuthorInfo.displayName}:${index}` });
          emitUserAction({
            type: 'merge',
            before: { prevText, currentText: textContent },
            after: { mergedText: prevText + textContent },
            actionDetails: `ブロックをマージ`,
          });
          onAfterEdit();

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
    }

    // Ctrl + Enter での手動確定処理
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      await saveContentAndHeadingOnBlur();
      return;
    }

    // Enter キーの処理（ブロックの分割 or 行追加）
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.nativeEvent as any).isComposing) {
        return;
      }
      e.preventDefault();

      const selRange = getSelectionRange();
      const newText = contentRef.current?.textContent || '';
      const sCaretPos = selRange ? selRange.start : newText.length;
      const isAtEnd = sCaretPos >= newText.length;

      // ブロック途中の場合のみ「ブロックの分割」の確認ダイアログを表示（文末の場合は対象外としてそのまま行追加）
      if (!isAtEnd) {
        const textBefore = newText.substring(0, sCaretPos);
        const textAfter = newText.substring(sCaretPos);
        const isH1 = /^[#＃]/.test(textBefore);
        if (!(await requestCautiousEditAsync('ブロックの分割', {
          content: `${textBefore}\n↓\n${textAfter}`,
          heading: isH1 ? 'h1' : null,
        }))) {
          return;
        }
      }

      let isH1 = false;
      if (/^[#＃]/.test(newText)) {
        isH1 = true;
      }
      let currentIndent = (loroMap?.get('indent') as number) || 0;
      if (loroMap) {
        loroMap.set('heading', isH1 ? 'h1' : null);
        if (isH1) {
          loroMap.set('indent', 0);
          currentIndent = 0;
        }
      }

      const textAfterCursor = newText.substring(sCaretPos);
      const textBeforeCursor = newText.substring(0, sCaretPos);

      if (doc) {
        updateDocContent(doc, index, textBeforeCursor, currentAuthorInfo);

        const nextIndent = currentIndent;
        const nextEmphasis = defaultEmphasis === 'h1' ? 0 : (defaultEmphasis as number);
        const hasSubstantialAfter = textAfterCursor.replace(/[\s　]+/g, '').length > 0;
        const nextSubAuthor = hasSubstantialAfter ? currentAuthorInfo : null;

        insertDocNodeAfter(doc, index, textAfterCursor, currentAuthorInfo, nextEmphasis, nextIndent, null, nextSubAuthor);
        onAfterEdit();
        setTimeout(() => focusNextBlock(1), 50);
      }
      return;
    }

    // Delete キーの処理
    if (e.key === 'Delete' && !e.shiftKey) {
      if (contentRef.current?.textContent === '') {
        e.preventDefault();
        if (!(await requestCautiousEditAsync('ブロックの削除'))) return;
        focusNextBlock(-1);
        if (doc) {
          deleteDocNode(doc, index, currentAuthorInfo);
          onAfterEdit();
        }
        return;
      }
    }

    // Arrow Keys の処理
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
  }, [doc, index, currentAuthorInfo, defaultEmphasis, onAfterEdit, moveUp, moveDown, focusNextBlock, getSelectionRange, setCaretAt, loroMap, blockIndent, requestCautiousEditAsync, isFirstInDoc, blockHeading, contentRef]);

  // DOM再描画やReactレンダリング直後にキャレット位置を復元するパトロール用Effect
  useEffect(() => {
    if (pendingCaretPosRef.current !== null && contentRef.current) {
      const pos = pendingCaretPosRef.current;
      pendingCaretPosRef.current = null;
      setCaretAt(pos);
      requestAnimationFrame(() => setCaretAt(pos));
    }
  }, [node.content, blockHeading, setCaretAt, contentRef]);

  // H1ボタンなどで見出し状態が変化した際にテキストの先頭の「# 」を同期する処理
  useEffect(() => {
    if (!doc || !loroText || !loroMap) return;
    if (isChat) return;
    if (isApplyingHashtagRef.current) return;

    const currentHeading = loroMap.get('heading') as string | null;
    const currentText = loroText.toString();
    const match = currentText.match(/^[#＃][ 　]*/);

    if (currentHeading === 'h1') {
      if (!match) {
        const savedRange = getSelectionRange();
        isApplyingHashtagRef.current = true;
        loroText.insert(0, '# ');
        doc.commit({ message: `add-hashtag:${loroMap.get('blockId')}` });
        onAfterEdit();
        isApplyingHashtagRef.current = false;

        if (savedRange !== null) {
          const targetPos = savedRange.start + 2;
          pendingCaretPosRef.current = targetPos;
          setCaretAt(targetPos);
          requestAnimationFrame(() => {
            setCaretAt(targetPos);
          });
        }
      }
    }
  }, [blockHeading, doc, loroText, loroMap, onAfterEdit, isChat, getSelectionRange, setCaretAt]);

  return {
    isDraggable,
    setIsDraggable,
    isFocused,
    setIsFocused,
    handleFocus,
    handleBlur,
    handleInput,
    handleKeyDown,
    getSelectionRange,
    setCaretAt,
    setPendingCaretPos,
  };
}
