import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineItem } from './OutlineSidebar';

interface MinimapProps {
  items: OutlineItem[];
  totalNodesCount: number;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}

interface PositionedItem extends OutlineItem {
  y: number;
}

const getLineLength = (): number => 1;

const getRowPitch = (): number => {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--minimap-row-pitch')
  );
  return Number.isFinite(value) ? value : 6;
};

export const Minimap: React.FC<MinimapProps> = ({
  items,
  totalNodesCount,
  onJumpToNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewHeight, setViewHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const [docVisibleRange, setDocVisibleRange] = useState({ top: 0, height: 1 });
  const isPointerOverRef = useRef(false);
  const scrollRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setViewHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { positionedItems, totalHeight } = useMemo(() => {
    const rowPitch = getRowPitch();
    const padding = 6;
    const minimumHeight = Math.max(viewHeight, items.length * rowPitch + padding * 2);
    if (items.length === 0) {
      return { positionedItems: [] as PositionedItem[], totalHeight: minimumHeight };
    }

    const maxIndex = Math.max(1, totalNodesCount - 1);
    const usableHeight = Math.max(0, minimumHeight - padding * 2);
    let previousY = -Infinity;
    const positioned = items.map((item) => {
      const idealY = padding + (item.index / maxIndex) * usableHeight;
      const y = Math.max(idealY, previousY + rowPitch);
      previousY = y;
      return { ...item, y };
    });

    return {
      positionedItems: positioned,
      totalHeight: Math.max(minimumHeight, previousY + padding),
    };
  }, [items, totalNodesCount, viewHeight]);

  const handleScroll = useCallback(() => {
    if (scrollRafIdRef.current !== null) return;
    scrollRafIdRef.current = requestAnimationFrame(() => {
      const minimap = containerRef.current;
      if (minimap) {
        setScrollTop(minimap.scrollTop);
      }
      scrollRafIdRef.current = null;
    });
  }, []);

  useEffect(() => {
    const docContent = document.querySelector('.doc-panel__content');
    if (!docContent) return;

    let rafId: number | null = null;
    const handleDocScroll = () => {
      if (isPointerOverRef.current || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isPointerOverRef.current || !containerRef.current) return;
        const maxDocScroll = docContent.scrollHeight - docContent.clientHeight;
        const maxMinimapScroll = totalHeight - viewHeight;
        if (maxDocScroll > 0 && maxMinimapScroll > 0) {
          containerRef.current.scrollTop = (docContent.scrollTop / maxDocScroll) * maxMinimapScroll;
        }
      });
    };

    docContent.addEventListener('scroll', handleDocScroll, { passive: true });
    const updateVisibleRange = () => {
      const totalDocHeight = docContent.scrollHeight;
      const visibleHeight = docContent.clientHeight;
      setDocVisibleRange(
        totalDocHeight > 0
          ? {
              top: (docContent.scrollTop / totalDocHeight) * totalHeight,
              height: (visibleHeight / totalDocHeight) * totalHeight,
            }
          : { top: 0, height: totalHeight }
      );
    };
    updateVisibleRange();
    docContent.addEventListener('scroll', updateVisibleRange, { passive: true });
    window.addEventListener('resize', updateVisibleRange);
    const docResizeObserver = new ResizeObserver(updateVisibleRange);
    docResizeObserver.observe(docContent);
    return () => {
      docContent.removeEventListener('scroll', handleDocScroll);
      docContent.removeEventListener('scroll', updateVisibleRange);
      window.removeEventListener('resize', updateVisibleRange);
      docResizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [totalHeight, viewHeight]);

  const visibleItems = useMemo(() => {
    const minY = scrollTop - 200;
    const maxY = scrollTop + viewHeight + 200;
    return positionedItems.filter((item) => item.y >= minY && item.y <= maxY);
  }, [positionedItems, scrollTop, viewHeight]);

  const findNearestItem = (clientY: number): PositionedItem | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || positionedItems.length === 0) return null;
    const y = clientY - rect.top + (containerRef.current?.scrollTop ?? 0);
    return positionedItems.reduce((nearest, item) =>
      Math.abs(item.y - y) < Math.abs(nearest.y - y) ? item : nearest
    );
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const item = findNearestItem(event.clientY);
    if (item) onJumpToNode(item.index, 'doc', 'minimap');
  };

  return (
    <div
      ref={containerRef}
      className="outline-sidebar__minimap outline-sidebar__minimap--scrollable"
      onScroll={handleScroll}
      onClick={handleClick}
      onMouseEnter={() => { isPointerOverRef.current = true; }}
      onMouseLeave={() => { isPointerOverRef.current = false; }}
      style={{ overflowY: totalHeight > viewHeight ? 'auto' : 'hidden' }}
    >
      <div className="outline-sidebar__minimap-content" style={{ height: `${totalHeight}px` }}>
        <div
          className="outline-sidebar__minimap-viewport"
          style={{ top: `${docVisibleRange.top}px`, height: `${docVisibleRange.height}px` }}
          aria-hidden="true"
        />
        {visibleItems.map((item) => (
          <div
            key={item.blockId}
            className="outline-sidebar__minimap-row"
            style={{ top: `${item.y - 6}px` }}
            aria-hidden="true"
          >
            <span className={`outline-sidebar__minimap-marker ${item.isH1 ? 'is-h1' : ''} ${item.type === 'chat' ? 'is-chat' : 'is-doc'}`} />
            <span
              className={`outline-sidebar__minimap-line ${item.isH1 ? 'is-h1' : ''} ${item.voteScore > 0 ? 'is-positive' : ''} ${item.voteScore < 0 ? 'is-negative' : ''}`}
              style={{
                opacity: item.voteScore === 0 && !item.isH1 ? 0 : 0.4,
                transform: `scaleX(${getLineLength()})`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
