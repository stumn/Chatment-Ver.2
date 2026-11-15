import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { OutlineItem } from './OutlineSidebar';

interface MinimapBandsProps {
  items: OutlineItem[];
  totalNodesCount: number;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}

interface BandData {
  bandIndex: number;
  items: OutlineItem[];
  chatCount: number;
  docCount: number;
  hasH1: boolean;
  representativeItem: OutlineItem | null;
  hasReactionsOnlyEmoji: boolean;
}

export const MinimapBands: React.FC<MinimapBandsProps> = ({
  items,
  totalNodesCount,
  onJumpToNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 48, height: 600 });
  const [hoveredBand, setHoveredBand] = useState<{
    bandIndex: number;
    y: number;
    text: string;
  } | null>(null);

  const [docVisibleRange, setDocVisibleRange] = useState<{ startRatio: number; endRatio: number }>({
    startRatio: 0,
    endRatio: 0.2,
  });

  const dirtyRef = useRef(true);

  // ResizeObserver でコンテナサイズを取得
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          dirtyRef.current = true;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 帯の数 = floor(高さpx / 4)
  const totalBands = Math.max(1, Math.floor(dimensions.height / 4));

  // 帯データへの割当
  const bands = useMemo<BandData[]>(() => {
    const bandList: BandData[] = Array.from({ length: totalBands }, (_, i) => ({
      bandIndex: i,
      items: [],
      chatCount: 0,
      docCount: 0,
      hasH1: false,
      representativeItem: null,
      hasReactionsOnlyEmoji: false,
    }));

    const maxIndex = Math.max(1, totalNodesCount);

    for (const item of items) {
      const bandIdx = Math.min(totalBands - 1, Math.max(0, Math.floor((item.index / maxIndex) * totalBands)));
      const b = bandList[bandIdx];
      b.items.push(item);
      if (item.type === 'chat') b.chatCount++;
      else b.docCount++;
      if (item.isH1) b.hasH1 = true;
    }

    for (const b of bandList) {
      if (b.items.length === 0) continue;

      // 帯内で level (または voteScore) が最大の投稿を代表とする
      let bestItem: OutlineItem | null = null;
      let maxLevel = -1;
      let hasEmojiOnly = false;

      for (const item of b.items) {
        if (item.voteScore !== 0) {
          if (item.level > maxLevel) {
            maxLevel = item.level;
            bestItem = item;
          }
        } else if (item.hasReactions) {
          hasEmojiOnly = true;
          if (!bestItem) bestItem = item;
        }
      }

      if (!bestItem) {
        bestItem = b.items[0];
      }

      b.representativeItem = bestItem;
      b.hasReactionsOnlyEmoji = (bestItem?.voteScore === 0 && (hasEmojiOnly || bestItem?.hasReactions));
    }

    dirtyRef.current = true;
    return bandList;
  }, [items, totalNodesCount, totalBands]);

  // ドキュメントの可視範囲監視
  useEffect(() => {
    const docContent = document.querySelector('.doc-panel__content');
    if (!docContent) return;

    let rafId: number | null = null;
    const updateVisibleRange = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const totalHeight = docContent.scrollHeight;
        const clientHeight = docContent.clientHeight;
        const scrollTop = docContent.scrollTop;

        if (totalHeight <= clientHeight) {
          setDocVisibleRange({ startRatio: 0, endRatio: 1 });
        } else {
          const startRatio = Math.max(0, scrollTop / totalHeight);
          const endRatio = Math.min(1, (scrollTop + clientHeight) / totalHeight);
          setDocVisibleRange({ startRatio, endRatio });
        }
        dirtyRef.current = true;
      });
    };

    updateVisibleRange();
    docContent.addEventListener('scroll', updateVisibleRange, { passive: true });
    window.addEventListener('resize', updateVisibleRange);

    return () => {
      docContent.removeEventListener('scroll', updateVisibleRange);
      window.removeEventListener('resize', updateVisibleRange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ダークモード切替の監視
  useEffect(() => {
    const observer = new MutationObserver(() => {
      dirtyRef.current = true;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Canvas 描画処理 (dirtyがあるときだけ)
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = dimensions.width;
    const height = dimensions.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // CSS変数の色を取得
    const style = getComputedStyle(document.documentElement);
    const posColor = style.getPropertyValue('--reaction-pos').trim() || '#2eb845';
    const negColor = style.getPropertyValue('--reaction-neg').trim() || '#dd3c3c';
    const splitChatColor = style.getPropertyValue('--split-chat').trim() || '#e8793a';
    const splitDocColor = style.getPropertyValue('--split-doc').trim() || '#3b82f6';
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#1c1917';

    const colWidth = Math.floor((width - 6) / 2);
    const leftX = 2;
    const rightX = leftX + colWidth + 2;

    // 各帯を描画 (4pxごと)
    for (let i = 0; i < totalBands; i++) {
      const b = bands[i];
      if (!b || b.items.length === 0) continue;

      const y = i * 4;

      // 左列: 発信元の多数派色 (橙/青、薄め)
      const isChatMajority = b.chatCount >= b.docCount;
      const leftColor = isChatMajority ? splitChatColor : splitDocColor;
      ctx.fillStyle = leftColor;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(leftX, y, colWidth, 3);

      // 右列: 代表投稿のリアクション
      if (b.representativeItem) {
        const rep = b.representativeItem;
        if (rep.voteScore > 0) {
          ctx.fillStyle = posColor;
          ctx.globalAlpha = 0.3 + 0.5 * rep.level;
          ctx.fillRect(rightX, y, colWidth, 3);
        } else if (rep.voteScore < 0) {
          ctx.fillStyle = negColor;
          ctx.globalAlpha = 0.3 + 0.5 * rep.level;
          ctx.fillRect(rightX, y, colWidth, 3);
        } else if (b.hasReactionsOnlyEmoji) {
          // 絵文字だけの帯: 薄い灰色の短い印
          ctx.fillStyle = '#a8a29e';
          ctx.globalAlpha = 0.5;
          ctx.fillRect(rightX, y, Math.max(4, colWidth * 0.5), 3);
        }
      }

      // 見出し (H1) を含む帯は、全幅の細い横線を重ねる
      if (b.hasH1) {
        ctx.fillStyle = textPrimary;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(leftX, y + 1, width - 4, 1.5);
      }
    }

    // ドキュメントで今見えている範囲を枠で示す
    ctx.globalAlpha = 1.0;
    const frameTop = Math.floor(docVisibleRange.startRatio * height);
    const frameHeight = Math.max(6, Math.floor((docVisibleRange.endRatio - docVisibleRange.startRatio) * height));

    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(1, frameTop, width - 2, frameHeight);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, frameTop, width - 2, frameHeight);

    dirtyRef.current = false;
  }, [dimensions, totalBands, bands, docVisibleRange]);

  useEffect(() => {
    let animId: number | null = null;
    const render = () => {
      if (dirtyRef.current) {
        drawCanvas();
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [drawCanvas]);

  // クリックで該当帯の代表投稿へジャンプ
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickY = e.clientY - rect.top;
    const bandIdx = Math.min(totalBands - 1, Math.max(0, Math.floor(clickY / 4)));
    const b = bands[bandIdx];
    if (b && b.representativeItem) {
      onJumpToNode(b.representativeItem.index, 'doc', 'minimap-bands');
    }
  };

  // ホバーで本文を表示
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseY = e.clientY - rect.top;
    const bandIdx = Math.min(totalBands - 1, Math.max(0, Math.floor(mouseY / 4)));
    const b = bands[bandIdx];
    if (b && b.representativeItem) {
      setHoveredBand({
        bandIndex: bandIdx,
        y: mouseY,
        text: b.representativeItem.text,
      });
    } else {
      setHoveredBand(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredBand(null);
  };

  return (
    <div
      ref={containerRef}
      className="outline-sidebar__minimap outline-sidebar__minimap--bands"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      {hoveredBand && (
        <span
          className="outline-sidebar__tooltip"
          style={{
            top: `${hoveredBand.y}px`,
            opacity: 1,
            pointerEvents: 'none',
          }}
        >
          {hoveredBand.text}
        </span>
      )}
    </div>
  );
};
