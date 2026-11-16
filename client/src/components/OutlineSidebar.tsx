import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { StreamNodeWithIndex } from '../types';
import {
  calculateReactionStats,
  calculateLevel,
  calculateStep,
  getMinimapOpacity,
} from '../utils/reactionUtils';
import { useRoom } from '../contexts/RoomContext';
import { Minimap } from './Minimap';

export interface OutlineItem {
  index: number;
  text: string;
  isH1: boolean;
  blockId: string;
  positiveReactionCount: number;
  indent: number;
  hasReactions: boolean;
  voteScore: number;
  level: number;
  step: number;
  opacity: number;
  type: 'chat' | 'doc';
}

interface OutlineSidebarProps {
  nodes: StreamNodeWithIndex[];
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenSidebar?: () => void;
  roomTitle?: string;
}

const POSITIVE_REACTIONS = new Set(['👍', '❤️', '😂', '🎉', '👀', '⇧']);

/**
 * 【仕様書 §7 より】
 * 優先選択の処理 (positiveReactionCount による並べ替えなど)。
 * 仕様により削除せず保持しています（現行目次・ミニマップでは全件表示へ移行）。
 */
export function getPrioritizedItemsLegacy(outlineItems: OutlineItem[]): OutlineItem[] {
  if (outlineItems.length <= 14) return outlineItems;

  const withReactions = outlineItems
    .filter((item) => item.positiveReactionCount > 0)
    .sort((a, b) => b.positiveReactionCount - a.positiveReactionCount || a.index - b.index);
  const withoutReactions = outlineItems
    .filter((item) => item.positiveReactionCount === 0)
    .sort((a, b) => a.index - b.index);

  return [...withReactions, ...withoutReactions].slice(0, 14);
}

/** 目次項目コンポーネント (React.memo 最適化) */
const OutlineItemRow = React.memo<{
  blockId: string;
  index: number;
  text: string;
  isH1: boolean;
  indent: number;
  hasReactions: boolean;
  voteScore: number;
  step: number;
  opacity: number;
  type: 'chat' | 'doc';
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
}>(({
  blockId,
  index,
  text,
  isH1,
  indent,
  hasReactions,
  voteScore,
  step,
  opacity,
  type,
  onJumpToNode,
}) => {
  const dotClasses = [
    'outline-sidebar__item-dot',
    isH1 ? 'is-h1' : '',
    indent === 0 ? 'is-indent-0' : '',
    hasReactions ? 'has-reactions' : '',
    voteScore > 0 ? 'is-positive' : '',
    voteScore < 0 ? 'is-negative' : '',
    type === 'chat' ? 'is-chat' : 'is-doc',
  ].filter(Boolean).join(' ');

  return (
    <button
      key={blockId}
      className={`outline-sidebar__item ${isH1 ? 'outline-sidebar__item--h1' : 'outline-sidebar__item--bold'}`}
      onClick={() => onJumpToNode(index, 'doc', 'outline')}
      title={text}
      data-lv={step}
    >
      {!isH1 && (
        <span
          className={dotClasses}
          style={{ opacity: hasReactions ? opacity : undefined }}
        />
      )}
      <span className="outline-sidebar__item-text">{text}</span>
    </button>
  );
}, (prev, next) => {
  return (
    prev.blockId === next.blockId &&
    prev.index === next.index &&
    prev.text === next.text &&
    prev.isH1 === next.isH1 &&
    prev.indent === next.indent &&
    prev.hasReactions === next.hasReactions &&
    prev.voteScore === next.voteScore &&
    prev.step === next.step &&
    prev.opacity === next.opacity &&
    prev.type === next.type
  );
});

export const OutlineSidebar: React.FC<OutlineSidebarProps> = ({
  nodes,
  onJumpToNode,
  isCollapsed,
  onToggle,
  onOpenSidebar,
  roomTitle,
}) => {
  const { R } = useRoom();

  // 全掲載アイテムの算出（掲載条件: H1・リアクションあり・indent===0）
  const computeOutlineItems = useCallback((): OutlineItem[] => {
    return nodes
      .filter(({ node }) => {
        const text = node.content?.trim() ?? '';
        if (!text) return false;
        const stats = calculateReactionStats(node);
        const hasReactions = stats.attention > 0;
        const isTopLevel = (node.indent ?? 0) === 0;
        const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');
        return isH1 || hasReactions || isTopLevel;
      })
      .map(({ node, index, id }) => {
        const stats = calculateReactionStats(node);
        const { up: upvotes, down: downvotes, voteScore } = stats;
        const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');

        const legacyPositiveCount = Object.values(node.reactions ?? {}).filter((emoji) => POSITIVE_REACTIONS.has(emoji)).length;
        const emojiPositiveCount = Object.values(node.emojiReactions ?? {}).filter((v) => v === true).length;
        const positiveReactionCount = legacyPositiveCount + emojiPositiveCount;
        const hasReactions = stats.attention > 0;

        const level = calculateLevel(voteScore, R);
        const step = calculateStep(level);
        const opacity = getMinimapOpacity(level);

        return {
          index,
          text: node.content?.trim() ?? '',
          isH1,
          blockId: id,
          positiveReactionCount,
          indent: (node as any).indent ?? 0,
          hasReactions,
          voteScore,
          level,
          step,
          opacity,
          type: node.type,
        };
      });
  }, [nodes, R]);

  // 目次・ミニマップの更新スロットル (250ms以上の間隔、最後の1回を必ず実行)
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>(() => computeOutlineItems());
  const throttleTimeoutRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef(false);

  useEffect(() => {
    if (throttleTimeoutRef.current !== null) {
      pendingUpdateRef.current = true;
      return;
    }

    setOutlineItems(computeOutlineItems());
    pendingUpdateRef.current = false;

    throttleTimeoutRef.current = window.setTimeout(() => {
      throttleTimeoutRef.current = null;
      if (pendingUpdateRef.current) {
        pendingUpdateRef.current = false;
        setOutlineItems(computeOutlineItems());
      }
    }, 250);

    return () => {
      if (throttleTimeoutRef.current !== null) {
        window.clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
    };
  }, [computeOutlineItems]);

  return (
    <aside className={`outline-sidebar ${isCollapsed ? 'is-collapsed' : 'is-expanded'}`}>
      <div className="outline-sidebar__header">
        <div className="outline-sidebar__header-main">
          <button
            type="button"
            className="outline-sidebar__brand"
            onClick={isCollapsed ? onOpenSidebar : undefined}
            title={isCollapsed ? '目次を開く' : undefined}
            aria-label={isCollapsed ? '目次を開く' : 'Chatment'}
          >
            {!isCollapsed && (
              <span className="outline-sidebar__brand-text">
                <span className="outline-sidebar__brand-name">Chatment</span>
                {roomTitle ? <span className="outline-sidebar__brand-room">{roomTitle}</span> : null}
              </span>
            )}
          </button>
          <button
            className="outline-sidebar__toggle-btn"
            onClick={onToggle}
            title={isCollapsed ? '目次を開く' : '目次を閉じる'}
            aria-expanded={!isCollapsed}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" width="18" height="18" fill="none">
              <rect x="4" y="4" width="56" height="40" rx="10" stroke="currentColor" strokeWidth="4" />
              <line x1="22" y1="4" x2="22" y2="44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* サイドバー展開時：目次タイトル */}
        {!isCollapsed && (
          <div className="outline-sidebar__section">
            <div className="outline-sidebar__divider" />
            <span className="outline-sidebar__title">目次</span>
          </div>
        )}
      </div>

      <div className="outline-sidebar__body">
        {isCollapsed ? (
          <Minimap
            items={outlineItems}
            totalNodesCount={nodes.length}
            onJumpToNode={onJumpToNode}
          />
        ) : (
          /* 展開時：見出しリスト (全件表示 & content-visibility: auto) */
          <div className="outline-sidebar__list">
            {outlineItems.length === 0 ? (
              <div className="outline-sidebar__empty">
                見出しがありません
              </div>
            ) : (
              outlineItems.map((item) => (
                <OutlineItemRow
                  key={item.blockId}
                  blockId={item.blockId}
                  index={item.index}
                  text={item.text}
                  isH1={item.isH1}
                  indent={item.indent}
                  hasReactions={item.hasReactions}
                  voteScore={item.voteScore}
                  step={item.step}
                  opacity={item.opacity}
                  type={item.type}
                  onJumpToNode={onJumpToNode}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
