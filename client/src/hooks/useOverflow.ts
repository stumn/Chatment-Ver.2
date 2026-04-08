import { useState, useEffect, useCallback, useRef } from 'react';
import type { StreamNodeWithIndex } from '../types';

interface OverflowResult {
  docNodes: StreamNodeWithIndex[];
  chatNodes: StreamNodeWithIndex[];
  splitIndex: number;
}

/**
 * Calculate the overflow boundary between doc panel and chat panel.
 * Nodes that don't fit in the chat panel "float up" to the doc panel.
 */
export function useOverflow(
  allNodes: StreamNodeWithIndex[],
  chatPanelRef: React.RefObject<HTMLDivElement | null>,
  chatItemHeight: number = 72
): OverflowResult {
  const [splitIndex, setSplitIndex] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const recalculate = useCallback(() => {
    if (!chatPanelRef.current) {
      setSplitIndex(0);
      return;
    }

    const panelHeight = chatPanelRef.current.clientHeight;
    // Reserve space for the chat input area
    const availableHeight = panelHeight - 80;
    const maxVisibleItems = Math.max(1, Math.floor(availableHeight / chatItemHeight));
    const newSplitIndex = Math.max(0, allNodes.length - maxVisibleItems);
    setSplitIndex(newSplitIndex);
  }, [allNodes.length, chatPanelRef, chatItemHeight]);

  // Recalculate on node count change
  useEffect(() => {
    recalculate();
  }, [recalculate]);

  // Watch for panel resize
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      recalculate();
    });
    resizeObserverRef.current.observe(panel);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [chatPanelRef, recalculate]);

  return {
    docNodes: allNodes.slice(0, splitIndex),
    chatNodes: allNodes.slice(splitIndex),
    splitIndex,
  };
}
