import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { OutlineItem } from './OutlineSidebar';

interface MinimapDotsProps {
  items: OutlineItem[];
  totalNodesCount: number;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}

export const MinimapDots: React.FC<MinimapDotsProps> = ({
  items,
  totalNodesCount,
  onJumpToNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewHeight, setViewHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const isPointerOverRef = useRef(false);
  const scrollRafIdRef = useRef<number | null>(null);

  // ResizeObserver でコンテナ高さを取得
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setViewHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 内側の高さ = max(表示高さ, 掲載数 × 12px + 余白)
  const paddingTop = 20;
  const paddingBottom = 20;
  const minRequiredHeight = items.length * 12 + paddingTop + paddingBottom;
  const baseContentHeight = Math.max(viewHeight, minRequiredHeight);

  // ドットの配置計算: 文書位置に比例 & 12px以上の間隔を確保
  const { positionedDots, totalHeight } = useMemo(() => {
    if (items.length === 0) {
      return { positionedDots: [], totalHeight: baseContentHeight };
    }

    const maxIndex = Math.max(1, totalNodesCount - 1);
    const usableHeight = baseContentHeight - paddingTop - paddingBottom - 8;

    let prevY = -9999;
    const dots = items.map((item) => {
      const idealY = paddingTop + (item.index / maxIndex) * usableHeight;
      const y = Math.max(idealY, prevY + 12);
      prevY = y;
      return { ...item, y };
    });

    const finalHeight = Math.max(baseContentHeight, prevY + paddingBottom + 12);
    return { positionedDots: dots, totalHeight: finalHeight };
  }, [items, totalNodesCount, baseContentHeight]);

  // スクロール位置の追従 (rAFでまとめる)
  const handleScroll = useCallback(() => {
    if (scrollRafIdRef.current !== null) return;
    scrollRafIdRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
      scrollRafIdRef.current = null;
    });
  }, []);

  // ドキュメントのスクロールに合わせた簡易追従
  useEffect(() => {
    const docContent = document.querySelector('.doc-panel__content');
    if (!docContent) return;

    let rafId: number | null = null;
    const handleDocScroll = () => {
      if (isPointerOverRef.current) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isPointerOverRef.current || !containerRef.current) return;

        const maxDocScroll = docContent.scrollHeight - docContent.clientHeight;
        if (maxDocScroll <= 0) return;

        const ratio = docContent.scrollTop / maxDocScroll;
        const maxMinimapScroll = totalHeight - viewHeight;
        if (maxMinimapScroll > 0) {
          containerRef.current.scrollTop = ratio * maxMinimapScroll;
        }
      });
    };

    docContent.addEventListener('scroll', handleDocScroll, { passive: true });
    return () => {
      docContent.removeEventListener('scroll', handleDocScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [totalHeight, viewHeight]);

  // 描画: スクロール範囲の上下200pxに入るドットだけをDOMに作成
  const visibleDots = useMemo(() => {
    const minY = scrollTop - 200;
    const maxY = scrollTop + viewHeight + 200;
    return positionedDots.filter((dot) => dot.y >= minY && dot.y <= maxY);
  }, [positionedDots, scrollTop, viewHeight]);

  return (
    <div
      ref={containerRef}
      className="outline-sidebar__minimap outline-sidebar__minimap--scrollable"
      onScroll={handleScroll}
      onMouseEnter={() => { isPointerOverRef.current = true; }}
      onMouseLeave={() => { isPointerOverRef.current = false; }}
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: totalHeight > viewHeight ? 'auto' : 'hidden',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${totalHeight}px`,
        }}
      >
        {visibleDots.map((item) => {
          if (item.isH1) {
            return (
              <button
                key={item.blockId}
                className="outline-sidebar__minimap-h1-btn"
                style={{
                  top: `${item.y}px`,
                  opacity: item.opacity,
                }}
                data-lv={item.step}
                onClick={() => onJumpToNode(item.index, 'doc', 'minimap-dots')}
                aria-label={item.text}
              >
                #
                <span className="outline-sidebar__tooltip">{item.text}</span>
              </button>
            );
          }

          const dotClasses = [
            'outline-sidebar__minimap-dot',
            item.indent === 0 ? 'is-indent-0' : '',
            item.hasReactions ? 'has-reactions' : '',
            item.voteScore > 0 ? 'is-positive' : '',
            item.voteScore < 0 ? 'is-negative' : '',
            item.type === 'chat' ? 'is-chat' : 'is-doc',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={item.blockId}
              className={dotClasses}
              style={{
                top: `${item.y}px`,
                opacity: item.hasReactions ? item.opacity : undefined,
              }}
              data-lv={item.step}
              onClick={() => onJumpToNode(item.index, 'doc', 'minimap-dots')}
              aria-label={item.text}
            >
              <span className="outline-sidebar__tooltip">{item.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
