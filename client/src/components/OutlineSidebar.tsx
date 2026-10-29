import React from 'react';
import type { StreamNodeWithIndex } from '../types';

interface OutlineItem {
  index: number;
  text: string;
  isH1: boolean;
  blockId: string;
  positiveReactionCount: number;
  indent: number;
  hasReactions: boolean;
  voteScore: number;
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

export const OutlineSidebar: React.FC<OutlineSidebarProps> = ({ nodes, onJumpToNode, isCollapsed, onToggle, onOpenSidebar, roomTitle }) => {
  const outlineItems: OutlineItem[] = nodes
    .filter(({ node }) => {
      const text = node.content?.trim() ?? '';
      if (!text) return false;
      const hasReactions =
        (!!node.reactions && Object.keys(node.reactions).length > 0) ||
        (!!node.emojiReactions && Object.keys(node.emojiReactions).length > 0);
      const isTopLevel = (node.indent ?? 0) === 0;
      // chatノードのH1判定：headingフィールドまたは#始まり
      const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');
      return isH1 || hasReactions || isTopLevel;
    })
    .map(({ node, index, id }) => {
      let upvotes = 0;
      let downvotes = 0;
      if ('reactions' in node && node.reactions) {
        Object.values(node.reactions).forEach(emoji => {
          if (emoji === '⇧') upvotes++;
          if (emoji === '⇩') downvotes++;
        });
      }
      const voteScore = upvotes - downvotes;
      const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');
      const legacyPositiveCount = Object.values(node.reactions ?? {}).filter((emoji) => POSITIVE_REACTIONS.has(emoji)).length;
      const emojiPositiveCount = Object.values(node.emojiReactions ?? {}).filter((v) => v === true).length;
      const positiveReactionCount = legacyPositiveCount + emojiPositiveCount;
      const hasReactions =
        (!!node.reactions && Object.keys(node.reactions).length > 0) ||
        (!!node.emojiReactions && Object.keys(node.emojiReactions).length > 0);

      return {
        index,
        text: node.content?.trim() ?? '',
        isH1,
        blockId: id,
        positiveReactionCount,
        indent: (node as any).indent ?? 0,
        hasReactions,
        voteScore,
        type: node.type,
      };
    });

  const prioritizedItems = (() => {
    if (outlineItems.length <= 14) return outlineItems;

    const withReactions = outlineItems
      .filter((item) => item.positiveReactionCount > 0)
      .sort((a, b) => b.positiveReactionCount - a.positiveReactionCount || a.index - b.index);
    const withoutReactions = outlineItems
      .filter((item) => item.positiveReactionCount === 0)
      .sort((a, b) => a.index - b.index);

    return [...withReactions, ...withoutReactions].slice(0, 14);
  })();

  // ミニマップドットの衝突回避アルゴリズム
  // 近接するドット同士が重なり合って隠れるのを防ぐため、最小間隔（4.5%）をあけて自動配置します。
  const sortedItems = [...prioritizedItems].sort((a, b) => a.index - b.index);
  const minSpacing = 4.5;
  let prevPos = -100;

  const positionedItems = sortedItems.map((item) => {
    // nodes.length > 1 の場合: 0〜96%の範囲にマップ（最初が上から始まるよう+2に変更）
    let rawPos = nodes.length > 1 ? (item.index / (nodes.length - 1)) * 94 + 2 : 50;
    if (rawPos - prevPos < minSpacing) {
      rawPos = prevPos + minSpacing;
    }
    prevPos = rawPos;
    return { ...item, topPercent: Math.min(97, rawPos) };
  });

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
        {!isCollapsed && (
          <div className="outline-sidebar__section">
            <div className="outline-sidebar__divider" />
            <span className="outline-sidebar__title">目次</span>
          </div>
        )}
      </div>

      <div className="outline-sidebar__body">
        {isCollapsed ? (
          /* 折りたたみ時：ミニマップドットインジケーター */
          <div className="outline-sidebar__minimap">
            {positionedItems.map((item) => {
              if (item.isH1) {
                return (
                  <button
                    key={item.blockId}
                    className="outline-sidebar__minimap-h1-btn"
                    style={{ top: `${item.topPercent}%` }}
                    onClick={() => onJumpToNode(item.index, 'doc', 'minimap')}
                    aria-label={item.text}
                  >
                    #
                    <span className="outline-sidebar__tooltip">{item.text}</span>
                  </button>
                );
              }

              const dotClasses = [
                'outline-sidebar__minimap-dot',
                item.isH1 ? 'is-h1' : '',
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
                  style={{ top: `${item.topPercent}%` }}
                  onClick={() => onJumpToNode(item.index, 'doc', 'minimap')}
                  aria-label={item.text}
                >
                  <span className="outline-sidebar__tooltip">{item.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* 展開時：見出しリスト */
          <div className="outline-sidebar__list">
            {prioritizedItems.length === 0 ? (
              <div className="outline-sidebar__empty">
                見出しがありません
              </div>
            ) : (
              prioritizedItems.map((item) => {
                const dotClasses = [
                  'outline-sidebar__item-dot',
                  item.isH1 ? 'is-h1' : '',
                  item.indent === 0 ? 'is-indent-0' : '',
                  item.hasReactions ? 'has-reactions' : '',
                  item.voteScore > 0 ? 'is-positive' : '',
                  item.voteScore < 0 ? 'is-negative' : '',
                  item.type === 'chat' ? 'is-chat' : 'is-doc',
                ].filter(Boolean).join(' ');

                return (
                  <button
                    key={item.blockId}
                    className={`outline-sidebar__item ${item.isH1 ? 'outline-sidebar__item--h1' : 'outline-sidebar__item--bold'}`}
                    onClick={() => onJumpToNode(item.index, 'doc', 'outline')}
                    title={item.text}
                  >
                    {!item.isH1 && <span className={dotClasses} />}
                    <span className="outline-sidebar__item-text">{item.text}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
