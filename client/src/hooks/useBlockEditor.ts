import { useRef, useCallback } from 'react';
import type { AuthorInfo, StreamNode } from '../types';
import { LoroText, LoroMap, type LoroDoc } from 'loro-crdt';
import { useCautiousPermission } from './useCautiousPermission';
import { useBlockLoroSync } from './useBlockLoroSync';
import { useEditorKeystrokes } from './useEditorKeystrokes';

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
  isCautiousMode,
  onAfterEdit,
}: UseBlockEditorProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // 1. 関心の分離: 慎重モードパーミッション管理
  const {
    isCanceledRef,
    requestCautiousEditAsync,
    resetPermission,
  } = useCautiousPermission({
    contentRef,
    isCautiousMode,
    node,
    currentAuthorInfo,
  });

  // 2. 関心の分離: Loro CRDT ドキュメント書き込み・同期
  const {
    saveContentAndHeadingOnBlur,
    moveUp,
    moveDown,
    adjustIndent,
    setBlockStyle: rawSetBlockStyle,
  } = useBlockLoroSync({
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
  });

  // 3. 関心の分離: キーボード入力・イベントハンドリング
  const {
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
  } = useEditorKeystrokes({
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
  });

  const setBlockStyle = useCallback(
    (style: 'h1' | 'normal' | 'fade') => {
      return rawSetBlockStyle(style, getSelectionRange, setCaretAt, setPendingCaretPos);
    },
    [rawSetBlockStyle, getSelectionRange, setCaretAt, setPendingCaretPos],
  );

  return {
    contentRef,
    isDraggable,
    setIsDraggable,
    isFocused,
    setIsFocused,
    handleFocus,
    handleBlur,
    handleInput,
    handleKeyDown,
    adjustIndent,
    setBlockStyle,
    requestCautiousEdit: requestCautiousEditAsync,
  };
}
