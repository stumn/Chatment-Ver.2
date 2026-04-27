import { useState, useCallback, useEffect, useRef } from 'react';
import { saveSplitRatio, loadSplitRatio } from '../loro/local-storage';

const DEFAULT_RATIO = 0.4; // 40% doc, 60% chat
const MIN_RATIO = 0.0;
const MAX_RATIO = 1.0;

export function useSplitView() {
  const [ratio, setRatio] = useState(() => {
    return loadSplitRatio() ?? DEFAULT_RATIO;
  });
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, y / rect.height));
    setRatio(newRatio);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist ratio
    saveSplitRatio(ratio);
  }, [ratio]);

  const handleDoubleClick = useCallback(() => {
    setRatio(0.5);
    saveSplitRatio(0.5);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Save on ratio change (debounced via the mouseup)
  useEffect(() => {
    saveSplitRatio(ratio);
  }, [ratio]);

  return {
    ratio,
    setRatio,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
  };
}
