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
  isPlaybackActive?: boolean;
  onAfterEdit: () => void;
  requestCautiousEditAsync: (actionLabel: string) => Promise<boolean>;
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
  isPlaybackActive,
  onAfterEdit,
  requestCautiousEditAsync,
  contentRef,
}: UseBlockLoroSyncProps) {

  const saveContentAndHeadingOnBlur = useCallback(() => {
    if (!doc || !contentRef.current || isPlaybackActive) return;
    const newText = contentRef.current.textContent || '';
    const currentText = loroMap?.get('content')?.toString() || '';

    const isH1 = /^[#＃]/.test(newText);
    const currentHeading = loroMap?.get('heading') || null;
    const nextHeading = isH1 ? 'h1' : null;

    const textChanged = newText !== currentText;
    const headingChanged = nextHeading !== currentHeading;

    if (textChanged || headingChanged) {
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
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, currentAuthorInfo, contentRef]);

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
    if (!doc || !loroMap || isPlaybackActive) return;
    if (!(await requestCautiousEditAsync('インデントの変更'))) return;

    if (contentRef.current) {
      const text = contentRef.current.textContent || '';
      const currentText = loroMap.get('content')?.toString() || '';
      if (text !== currentText) {
        updateDocContent(doc, index, text, currentAuthorInfo);
      }
    }

    const currentIndent = (loroMap.get('indent') as number) || 0;
    const nextIndent = Math.max(0, Math.min(2, currentIndent + direction));
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
  }, [doc, index, loroMap, onAfterEdit, isPlaybackActive, requestCautiousEditAsync, currentAuthorInfo, contentRef]);

  const setBlockStyle = useCallback(async (
    style: 'h1' | 'normal' | 'fade',
    getSelectionRange: () => { start: number; end: number } | null,
    setCaretAt: (charPos: number) => void,
    setPendingCaretPos: (pos: number | null) => void,
  ) => {
    if (!doc || !loroMap || isPlaybackActive) return;

    if (contentRef.current && document.activeElement !== contentRef.current) {
      contentRef.current.focus();
    }

    const savedRange = getSelectionRange();
    let text = contentRef.current ? (contentRef.current.textContent || '') : '';
    let removedLen = 0;
    let addedLen = 0;

    if (style !== 'h1') {
      const match = text.match(/^[#＃\s　]+/);
      if (match) {
        removedLen = match[0].length;
      }
      const cleaned = text.replace(/^[#＃\s　]+/g, '');
      if (text !== cleaned) {
        text = cleaned;
        if (contentRef.current) {
          contentRef.current.textContent = cleaned;
        }
      }
    } else {
      const match = text.match(/^[#＃][ 　]*/);
      if (!match) {
        text = '# ' + text;
        addedLen = 2;
        if (contentRef.current) {
          contentRef.current.textContent = text;
        }
      }
    }

    const currentText = loroMap.get('content')?.toString() || '';
    if (text !== currentText) {
      updateDocContent(doc, index, text, currentAuthorInfo);
    }

    const currentHeading = loroMap.get('heading') as string | null;
    const currentEmphasis = (loroMap.get('emphasis') as number) || 0;

    const currentStyle = currentHeading === 'h1' ? 'h1' : (currentEmphasis === -1 ? 'fade' : 'normal');
    if (currentStyle === style) {
      let targetPos = savedRange ? savedRange.start : text.length;
      if (addedLen > 0) targetPos += addedLen;
      if (removedLen > 0) targetPos = Math.max(0, targetPos - removedLen);
      setPendingCaretPos(targetPos);
      setCaretAt(targetPos);
      requestAnimationFrame(() => setCaretAt(targetPos));
      return;
    }

    if (!(await requestCautiousEditAsync('ブロックスタイルの変更'))) return;

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

    let targetPos = savedRange ? savedRange.start : text.length;
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
  }, [doc, loroMap, index, onAfterEdit, isPlaybackActive, requestCautiousEditAsync, currentAuthorInfo, contentRef]);

  return {
    saveContentAndHeadingOnBlur,
    moveUp,
    moveDown,
    adjustIndent,
    setBlockStyle,
  };
}
