import { useRef, useCallback, useState } from 'react';
import type { LoroDoc } from 'loro-crdt';
import type { AuthorInfo } from '../types';
import { moveNode, EMPTY_AUTHOR } from '../loro/schema';

interface DragDropState {
  dragIndex: number | null;
  dropIndex: number | null;
}

export function useDragDrop(
  doc: LoroDoc | null,
  authorInfo: AuthorInfo | null,
  onAfterMove: () => void
) {
  const [dragState, setDragState] = useState<DragDropState>({
    dragIndex: null,
    dropIndex: null,
  });
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    return (e: React.DragEvent) => {
      dragIndexRef.current = index;
      setDragState({ dragIndex: index, dropIndex: null });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Add drag styling
      const target = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => {
        target.classList.add('dragging');
      });
    };
  }, []);

  const handleDragOver = useCallback((index: number) => {
    return (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragState(prev => ({ ...prev, dropIndex: index }));
    };
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragState(prev => ({ ...prev, dropIndex: null }));
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex === null || fromIndex === toIndex || !doc) return;

      moveNode(doc, fromIndex, toIndex, authorInfo || EMPTY_AUTHOR);
      onAfterMove();

      setDragState({ dragIndex: null, dropIndex: null });
      dragIndexRef.current = null;
    };
  }, [doc, authorInfo, onAfterMove]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('dragging');
    setDragState({ dragIndex: null, dropIndex: null });
    dragIndexRef.current = null;
  }, []);

  return {
    dragState,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
