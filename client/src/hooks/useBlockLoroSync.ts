import { useCallback, type RefObject } from 'react';
import type { AuthorInfo, StreamNode } from '../types';
import { LoroText, LoroMap, type LoroDoc } from 'loro-crdt';
import { updateDocContent, moveNode, insertDocNodeAfter, deleteDocNode, EMPTY_AUTHOR } from '../loro/schema';
import { emitUserAction } from '../loro/sync-client';

interface UseBlockLoroSyncProps {
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
  contentRef: RefObject<HTMLDivElement | null>;
}

export function useBlockLoroSync({
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
  contentRef,
}: UseBlockLoroSyncProps) {

  const saveContentAndHeadingOnBlur = useCallback(async () => {
    if (!doc || !contentRef.current) return;
    const newText = contentRef.current.textContent || '';
    const currentText = loroMap?.get('content')?.toString() || node.content || '';

    const isH1 = /^[#＃]/.test(newText);
    const currentHeading = (loroMap?.get('heading') as string | null) ?? (node.heading || null);
    const nextHeading = isH1 ? 'h1' : null;

    const textChanged = newText !== currentText;
    const headingChanged = nextHeading !== currentHeading;

    if (textChanged || headingChanged) {
      const currentIndent = (loroMap?.get('indent') as number) || node.indent || 0;
      const nextIndent = nextHeading === 'h1' ? 0 : currentIndent;
      const actionLabel = headingChanged ? 'ブロックスタイルの変更' : 'テキストの編集';

      const ok = await requestCautiousEditAsync(actionLabel, {
        content: newText,
        heading: nextHeading,
        indent: nextIndent,
      });

      if (!ok) {
        if (contentRef.current) {
          contentRef.current.textContent = currentText;
        }
        return;
      }

      if (headingChanged && loroMap) {
        loroMap.set('heading', nextHeading);
        if (nextHeading === 'h1') {
          loroMap.set('indent', 0);
          loroMap.set('emphasis', 0);
        }
      }
      updateDocContent(doc, index, newText, currentAuthorInfo);
      onAfterEdit();
    }
  }, [doc, index, node, loroMap, onAfterEdit, currentAuthorInfo, contentRef, requestCautiousEditAsync]);

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

  const adjustIndent = useCallback(async (direction: number) => {
    if (!doc || !loroMap) return;
    const currentIndent = (loroMap.get('indent') as number) || 0;
    const nextIndent = Math.max(0, Math.min(2, currentIndent + direction));
    const currentHeading = loroMap.get('heading') as string | null;
    const rawText = contentRef.current ? (contentRef.current.textContent || '') : (node.content || '');

    // H1ブロックをインデント変更した場合、H1を解除して先頭の # も除去する
    let nextHeading = currentHeading;
    let nextText = rawText;
    if (currentHeading === 'h1') {
      nextHeading = null;
      nextText = rawText.replace(/^[#＃][ 　]*/, '');
    }

    if (!(await requestCautiousEditAsync('インデントの変更', {
      indent: nextIndent,
      heading: nextHeading,
      content: nextText,
    }))) return;

    if (currentHeading === 'h1') {
      loroMap.set('heading', null);
    }

    if (nextText !== rawText) {
      updateDocContent(doc, index, nextText, currentAuthorInfo);
      if (contentRef.current) {
        contentRef.current.textContent = nextText;
      }
    }

    loroMap.set('indent', nextIndent);

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
  }, [doc, index, node.content, loroMap, onAfterEdit, requestCautiousEditAsync, currentAuthorInfo, contentRef]);

  const setBlockStyle = useCallback(async (
    style: 'h1' | 'normal' | 'fade',
    getSelectionRange: () => { start: number; end: number } | null,
    setCaretAt: (charPos: number) => void,
    setPendingCaretPos: (pos: number | null) => void,
  ) => {
    if (!doc || !loroMap) return;

    if (contentRef.current && document.activeElement !== contentRef.current) {
      contentRef.current.focus();
    }

    const savedRange = getSelectionRange();
    const rawText = contentRef.current ? (contentRef.current.textContent || '') : (node.content || '');
    const currentHeading = loroMap.get('heading') as string | null;
    const currentEmphasis = (loroMap.get('emphasis') as number) || 0;
    const currentStyle = currentHeading === 'h1' ? 'h1' : (currentEmphasis === -1 ? 'fade' : 'normal');

    if (currentStyle === style) {
      return;
    }

    // 変更後の状態を計算（モーダル許可前の DOM 変更は行わない）
    let nextText = rawText;
    let nextHeading: string | null = null;
    let nextEmphasis = 0;
    let nextIndent = (loroMap.get('indent') as number) || 0;
    let addedLen = 0;
    let removedLen = 0;

    if (style === 'h1') {
      const match = rawText.match(/^[#＃][ 　]*/);
      if (!match) {
        nextText = '# ' + rawText;
        addedLen = 2;
      } else {
        nextText = rawText;
      }
      nextHeading = 'h1';
      nextEmphasis = 0;
      nextIndent = 0;
    } else {
      const match = rawText.match(/^[#＃\s　]+/);
      if (match) {
        removedLen = match[0].length;
      }
      nextText = rawText.replace(/^[#＃\s　]+/g, '');
      nextHeading = null;
      nextEmphasis = style === 'fade' ? -1 : 0;
    }

    // モーダル確認（キャンセルされた場合はここで復元せずそのまま安全に終了）
    if (!(await requestCautiousEditAsync('ブロックスタイルの変更', {
      heading: nextHeading,
      emphasis: nextEmphasis,
      indent: nextIndent,
      content: nextText,
    }))) return;

    // 許可が降りてから DOM 及び Loro Doc を更新
    if (contentRef.current && contentRef.current.textContent !== nextText) {
      contentRef.current.textContent = nextText;
    }

    const currentDocText = loroMap.get('content')?.toString() || '';
    if (nextText !== currentDocText) {
      updateDocContent(doc, index, nextText, currentAuthorInfo);
    }

    const beforeStyle = currentStyle;
    loroMap.set('heading', nextHeading);
    loroMap.set('emphasis', nextEmphasis);
    loroMap.set('indent', nextIndent);

    const blockId = (loroMap.get('blockId') as string) || `blk-${index}`;
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

    let targetPos = savedRange ? savedRange.start : nextText.length;
    if (addedLen > 0) {
      targetPos += addedLen;
    } else if (removedLen > 0) {
      targetPos = Math.max(0, targetPos - removedLen);
    }

    setPendingCaretPos(targetPos);
    setCaretAt(targetPos);
    requestAnimationFrame(() => {
      setCaretAt(targetPos);
    });
    setTimeout(() => {
      setCaretAt(targetPos);
    }, 0);
  }, [doc, loroMap, index, node.content, onAfterEdit, requestCautiousEditAsync, currentAuthorInfo, contentRef]);

  return {
    saveContentAndHeadingOnBlur,
    moveUp,
    moveDown,
    adjustIndent,
    setBlockStyle,
  };
}
