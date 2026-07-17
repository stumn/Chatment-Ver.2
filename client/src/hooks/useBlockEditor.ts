import { useState, useRef, useCallback, useEffect } from 'react';
import type { EmphasisLevel, AuthorInfo, StreamNode } from '../types';
import { LoroText, LoroMap, type LoroDoc } from 'loro-crdt';
import { updateDocContent, moveNode, insertDocNodeAfter, deleteDocNode, EMPTY_AUTHOR } from '../loro/schema';
import { emitUserAction } from '../loro/sync-client';

interface UseBlockEditorProps {
  doc: LoroDoc | null;
  index: number;
  node: StreamNode;
  loroText: LoroText | undefined;
  loroMap: LoroMap | undefined;
  currentAuthorInfo: AuthorInfo;
  defaultEmphasis: number | 'h1';
  isFirstInDoc?: boolean;
  isLastInDoc?: boolean;
  isPlaybackActive?: boolean;
  isCautiousMode?: boolean;
  onAfterEdit: () => void;
}

export function useBlockEditor({
  doc,
  index,
  node,
  loroText,
  loroMap,
  currentAuthorInfo,
  defaultEmphasis,
  isFirstInDoc,
  isLastInDoc,
  isPlaybackActive,
  isCautiousMode,
  onAfterEdit,
}: UseBlockEditorProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const hasEditPermissionRef = useRef(false);
  const isCanceledRef = useRef(false); // 慎重モードキャンセル時のblurスキップ用
  const [isDraggable, setIsDraggable] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isApplyingHashtagRef = useRef(false); // H1切り替え時の#挿入ループ防止フラグ

  const isChat = node.type === 'chat';
  const blockAuthor: AuthorInfo = node.author;
  const blockSubAuthors = node.subAuthors || [];
  const blockIndent = node.indent || 0;
  const blockHeading = node.heading ?? (/^[#＃]/.test(node.content) ? 'h1' : null);

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
    const confirmMessage = `${contentPreview}への${actionLabel}\nこのブロックの所有者は「${ownerName}」です。よろしいですか？`;
    if (window.confirm(confirmMessage)) {
      hasEditPermissionRef.current = true;
      return true;
    }
    return false;
  }, [isCautiousMode, blockAuthor, blockSubAuthors, currentAuthorInfo, node.content]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    hasEditPermissionRef.current = false;
    // 慎重モードでキャンセルされた場合はblurによる保存をスキップ
    if (isCanceledRef.current) return;
    if (!doc || !contentRef.current || isPlaybackActive) return;
    const newText = contentRef.current.textContent || '';
    const currentText = loroMap?.get('content')?.toString() || '';

    let isH1 = false;
    if (/^[#＃]/.test(newText)) {
      isH1 = true;
    }

    const currentHeading = loroMap?.get('heading') || null;
    const nextHeading = isH1 ? 'h1' : null;

    const textChanged = newText !== currentText;
    const headingChanged = nextHeading !== currentHeading;

    if (textChanged || headingChanged) {
      if (headingChanged && loroMap) {
        loroMap.set('heading', nextHeading);
        if (nextHeading === 'h1') {
          loroMap.set('indent', 0);
        }
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
    const textContent = contentRef.current?.textContent || '';

    // isAtStart: カーソルがブロックの先頭にあるか（テキストが空またはスペースのみの場合も含む）
    const srCheck = getSelectionRange();
    const isAtStart = srCheck
      ? (srCheck.start === 0 && srCheck.end === 0) || textContent.replace(/[\s　]+/g, '').length === 0
      : textContent.replace(/[\s　]+/g, '').length === 0;

    // Tab キーの処理 (インデント増減, 最大2に制限)
    if (e.key === 'Tab') {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデントの変更')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);

          // インデント変更時にH1を解除する
          const currentHeading = loroMap.get('heading') as string | null;
          if (currentHeading === 'h1') {
            loroMap.set('heading', null);
          }

          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          emitUserAction({
            type: 'indent',
            targetId: blockId,
            before: { indent: currentIndent },
            after: { indent: nextIndent },
            actionDetails: `インデント変更: ${currentIndent} → ${nextIndent}`,
          });
          onAfterEdit();

          // インデント操作後に不要なスペース（IMEオンでの全角スペース等）が入り込むのを防ぐため、
          // 次のイベントループで先頭の空白文字を消去する
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

    // Space / 全角スペース キーの処理 (インデント増加, 最大2に制限)
    if ((e.key === ' ' || e.key === '　' || e.code === 'Space') && !e.shiftKey) {
      if (isAtStart) {
        e.preventDefault();
        if (!requestCautiousEdit('インデントの変更')) return;
        if (doc && loroMap) {
          const currentIndent = loroMap.get('indent') as number || 0;
          const nextIndent = Math.min(2, currentIndent + 1);
          loroMap.set('indent', nextIndent);

          // インデント変更時にH1を解除する
          const currentHeading = loroMap.get('heading') as string | null;
          if (currentHeading === 'h1') {
            loroMap.set('heading', null);
          }

          const blockId = loroMap.get('blockId') as string || `blk-${index}`;
          doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
          emitUserAction({
            type: 'indent',
            targetId: blockId,
            before: { indent: currentIndent },
            after: { indent: nextIndent },
            actionDetails: `インデント変更: ${currentIndent} → ${nextIndent}`,
          });
          onAfterEdit();

          // インデント操作後に不要なスペース（IMEオンでの全角スペース等）が入り込むのを防ぐため、
          // 次のイベントループで先頭の空白文字を消去する
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
      const currentIndent = loroMap?.get('indent') as number || 0;

      if (isAtStart) {
        // インデントがあれば先にインデント減少（中身が空かどうかにかかわらず）
        if (currentIndent > 0) {
          e.preventDefault();
          if (!requestCautiousEdit('インデントの変更')) return;
          if (doc && loroMap) {
            loroMap.set('indent', currentIndent - 1);

            // インデント変更時にH1を解除する
            const currentHeading = loroMap.get('heading') as string | null;
            if (currentHeading === 'h1') {
              loroMap.set('heading', null);
            }

            const blockId = loroMap.get('blockId') as string || `blk-${index}`;
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

        // インデントがない先頭位置で、かつテキストが空の場合 → 空ブロック削除
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

        // インデントがない先頭位置で、かつテキストがある場合 → 前ブロックとマージ
        if (!isFirstInDoc && doc) {
          e.preventDefault();
          if (!requestCautiousEdit('ブロックのマージ')) return;

          const stream = doc.getMovableList('stream');
          const prevMap = stream.get(index - 1) as LoroMap;
          if (!prevMap) return;

          const prevLoroText = prevMap.get('content') as LoroText;
          const prevTextLen = prevLoroText ? prevLoroText.length : 0;
          const prevText = prevLoroText ? prevLoroText.toString() : '';

          // 現在のテキストを前ブロックの末尾に追加
          if (textContent.length > 0 && prevLoroText) {
            prevLoroText.insert(prevTextLen, textContent);
          }

          // 現在ブロックを削除
          stream.delete(index, 1);
          doc.commit({ message: `merge:${currentAuthorInfo.displayName}:${index}` });
          emitUserAction({
            type: 'merge',
            before: { prevText, currentText: textContent },
            after: { mergedText: prevText + textContent },
            actionDetails: `ブロックをマージ`,
          });
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
      if (/^[#＃]/.test(newText)) {
        isH1 = true;
      }
      let currentIndent = loroMap?.get('indent') as number || 0;
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

        const nextIndent = currentIndent; // 改行して新規ブロックを作成する際は前の行のインデントを維持する
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
    if (isChat) return;
    if (isApplyingHashtagRef.current) return;

    const currentHeading = loroMap.get('heading') as string | null;
    const currentText = loroText.toString();
    const match = currentText.match(/^[#＃][ 　]*/);

    if (currentHeading === 'h1') {
      if (!match) {
        isApplyingHashtagRef.current = true;
        loroText.insert(0, '# ');
        doc.commit({ message: `add-hashtag:${loroMap.get('blockId')}` });
        onAfterEdit();
        isApplyingHashtagRef.current = false;
      }
    }
  }, [blockHeading, doc, loroText, loroMap, onAfterEdit, isPlaybackActive, isChat]);

  const setBlockStyle = useCallback((style: 'h1' | 'normal' | 'fade') => {
    if (!doc || !loroMap || isPlaybackActive) return;

    let text = contentRef.current ? (contentRef.current.textContent || '') : '';

    if (style !== 'h1') {
      const cleaned = text.replace(/^[#＃\s　]+/g, '');
      if (text !== cleaned) {
        text = cleaned;
        if (contentRef.current) {
          contentRef.current.textContent = cleaned;
        }
      }
    }

    const currentText = loroMap.get('content')?.toString() || '';
    if (text !== currentText) {
      updateDocContent(doc, index, text, currentAuthorInfo);
    }

    const currentHeading = loroMap.get('heading') as string | null;
    const currentEmphasis = loroMap.get('emphasis') as number || 0;

    const currentStyle = currentHeading === 'h1' ? 'h1' : (currentEmphasis === -1 ? 'fade' : 'normal');
    if (currentStyle === style) return;

    if (!requestCautiousEdit('ブロックスタイルの変更')) return;

    const beforeStyle = currentHeading === 'h1' ? 'heading' : (currentEmphasis === -1 ? 'fade' : 'normal');

    if (style === 'h1') {
      loroMap.set('heading', 'h1');
      loroMap.set('emphasis', 0);
      loroMap.set('indent', 0);
    } else if (style === 'normal') {
      loroMap.set('heading', null);
      loroMap.set('emphasis', 0);
    } else if (style === 'fade') {
      loroMap.set('heading', null);
      loroMap.set('emphasis', -1);
    }

    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `format-style:${currentAuthorInfo.displayName}:${blockId}:${style}` });

    const afterStyle = style === 'h1' ? 'heading' : (style === 'fade' ? 'fade' : 'normal');
    emitUserAction({
      type: 'format-block',
      targetId: blockId,
      before: { style: beforeStyle },
      after: { style: afterStyle },
      actionDetails: `ブロックスタイル変更: ${beforeStyle} → ${afterStyle}`,
    });

    onAfterEdit();
  }, [doc, loroMap, index, onAfterEdit, isPlaybackActive, requestCautiousEdit, currentAuthorInfo]);

  const adjustIndent = useCallback((direction: number) => {
    if (!doc || !loroMap || isPlaybackActive) return;
    if (!requestCautiousEdit('インデントの変更')) return;

    if (contentRef.current) {
      const text = contentRef.current.textContent || '';
      const currentText = loroMap.get('content')?.toString() || '';
      if (text !== currentText) {
        updateDocContent(doc, index, text, currentAuthorInfo);
      }
    }

    const currentIndent = loroMap.get('indent') as number || 0;
    const nextIndent = Math.max(0, Math.min(2, currentIndent + direction));
    loroMap.set('indent', nextIndent);

    const currentHeading = loroMap.get('heading') as string | null;
    if (currentHeading === 'h1') {
      loroMap.set('heading', null);
    }

    const blockId = loroMap.get('blockId') as string || `blk-${index}`;
    doc.commit({ message: `indent:${currentAuthorInfo.displayName}:${blockId}:${nextIndent}` });
    emitUserAction({
      type: 'indent',
      targetId: blockId,
      before: { indent: currentIndent },
      after: { indent: nextIndent },
      actionDetails: `インデント変更: ${currentIndent} → ${nextIndent}`,
    });
    onAfterEdit();
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, requestCautiousEdit, currentAuthorInfo]);

  return {
    contentRef,
    isDraggable,
    setIsDraggable,
    isFocused,
    setIsFocused,
    handleBlur,
    handleInput,
    handleKeyDown,
    adjustIndent,
    setBlockStyle,
    requestCautiousEdit,
  };
}
