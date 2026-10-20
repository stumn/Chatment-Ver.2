import { useState, useCallback, useEffect, useRef } from 'react';
import { saveSplitRatio, loadSplitRatio } from '../loro/local-storage';

const DEFAULT_RATIO = 0.4; // 40% doc, 60% chat
const MIN_RATIO = 0.0;
const MAX_RATIO = 1.0;

interface UseSplitViewOptions {
  onDragStart?: (startRatio: number) => void;
  onDragEnd?: (startRatio: number, endRatio: number, durationMs: number) => void;
}

export function useSplitView(options?: UseSplitViewOptions) {
  const [ratio, setRatio] = useState(() => {
    return loadSplitRatio() ?? DEFAULT_RATIO;
  });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartTimeRef = useRef<number>(0);
  const dragStartRatioRef = useRef<number>(DEFAULT_RATIO);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartTimeRef.current = performance.now();
    dragStartRatioRef.current = ratio;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    options?.onDragStart?.(ratio);
  }, [ratio, options]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const minY = 8;
    const maxY = Math.max(minY, rect.height - 8);
    const clampedY = Math.min(maxY, Math.max(minY, y));

    const newRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, clampedY / rect.height));
    setRatio(newRatio);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    const duration = Math.round(performance.now() - dragStartTimeRef.current);
    const startRatio = dragStartRatioRef.current;
    const endRatio = ratio;

    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist ratio
    saveSplitRatio(ratio);
    options?.onDragEnd?.(startRatio, endRatio, duration);
  }, [ratio, options]);

  const handleDoubleClick = useCallback(() => {
    let nextRatio = 0.5;
    if (ratio >= 0.35 && ratio <= 0.65) {
      nextRatio = 0.0;
    } else if (ratio < 0.35) {
      nextRatio = 1.0;
    } else {
      nextRatio = 0.5;
    }
    setRatio(nextRatio);
    saveSplitRatio(nextRatio);
  }, [ratio]);

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
    isDragging,
  };
}
