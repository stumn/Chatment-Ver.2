import { useState, useEffect, useCallback, useRef } from 'react';
import type { StreamNodeWithIndex } from '../types';

interface OverflowResult {
  docNodes: StreamNodeWithIndex[];
  chatNodes: StreamNodeWithIndex[];
  splitIndex: number;
}

/**
 * Separate nodes for document panel and chat panel.
 * - docNodes: Contains all nodes, preserving the movable list order.
 * - chatNodes: Contains only nodes with content, sorted chronologically, showing the latest.
 */
export function useOverflow(
  allNodes: StreamNodeWithIndex[],
  chatPanelRef: React.RefObject<HTMLDivElement | null>,
  chatItemHeight: number = 72
): OverflowResult {
  const [splitIndex, setSplitIndex] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const calculateNodes = useCallback(() => {
    if (!chatPanelRef.current) {
      setSplitIndex(0);
      return { docNodes: allNodes, chatNodes: [] };
    }

    const panelHeight = chatPanelRef.current.clientHeight;
    // Reserve space for the chat input area
    const availableHeight = panelHeight - 80;
    const maxVisibleItems = Math.max(1, Math.floor(availableHeight / chatItemHeight));

    return maxVisibleItems;
  }, [chatPanelRef, chatItemHeight]);

  const [maxVisible, setMaxVisible] = useState<number>(0);

  // Recalculate on resize
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      setMaxVisible(calculateNodes() as number);
    });
    resizeObserverRef.current.observe(panel);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [chatPanelRef, calculateNodes]);

  // Initial calculation
  useEffect(() => {
    setMaxVisible(calculateNodes() as number);
  }, [calculateNodes]);

  // Derive chat nodes from allNodes based on timestamp and maxVisible
  const validChatCandidates = allNodes
    .filter(n => {
      // Hide empty document nodes
      if (n.node.type === 'doc' && (!n.node.content || n.node.content.trim() === '')) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.node.timestamp - b.node.timestamp);

  const startIndex = Math.max(0, validChatCandidates.length - Math.max(1, maxVisible));
  const chatNodes = validChatCandidates.slice(startIndex);

  return {
    docNodes: allNodes,
    chatNodes,
    splitIndex: maxVisible, // keeping property for interface compatibility, tho its meaning changed
  };
}
