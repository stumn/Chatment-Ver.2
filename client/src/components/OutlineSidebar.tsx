import React, { useState } from 'react';
import type { StreamNodeWithIndex } from '../types';

interface OutlineItem {
  index: number;
  text: string;
  isH1: boolean;
  blockId: string;
}

interface OutlineSidebarProps {
  nodes: StreamNodeWithIndex[];
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
}

export const OutlineSidebar: React.FC<OutlineSidebarProps> = ({ nodes, onJumpToNode }) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('chatment-sidebar-collapsed');
    return saved === 'true';
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('chatment-sidebar-collapsed', String(next));
      return next;
    });
  };

  // 見出し(H1)または太字(emphasis: 1)のノードを抽出
  const outlineItems: OutlineItem[] = nodes
    .filter(({ node }) => node.type === 'doc' && (node.heading === 'h1' || node.emphasis === 1))
    .map(({ node, index, id }) => ({
      index,
      text: node.content?.trim() || '(空の見出し)',
      isH1: 'heading' in node && node.heading === 'h1',
      blockId: id,
    }));

  // ミニマップドットの衝突回避アルゴリズム
  // 近接するドット同士が重なり合って隠れるのを防ぐため、最小間隔（4.5%）をあけて自動配置します。
  const sortedItems = [...outlineItems].sort((a, b) => a.index - b.index);
  const minSpacing = 4.5;
  let prevPos = -100;
  
  const positionedItems = sortedItems.map((item) => {
    let rawPos = nodes.length > 1 ? (item.index / (nodes.length - 1)) * 80 + 10 : 50;
    if (rawPos - prevPos < minSpacing) {
      rawPos = prevPos + minSpacing;
    }
    prevPos = rawPos;
    return { ...item, topPercent: Math.min(95, rawPos) };
  });

  return (
    <aside className={`outline-sidebar ${isCollapsed ? 'is-collapsed' : 'is-expanded'}`}>
      <div className="outline-sidebar__header">
        {!isCollapsed && <span className="outline-sidebar__title">目次</span>}
        <button 
          className="outline-sidebar__toggle-btn" 
          onClick={toggleSidebar}
          title={isCollapsed ? "目次を開く" : "目次を閉じる"}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            /* シンプルなメニュー/目次アイコン */
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          ) : (
            /* ChatGPTライクな閉じるアイコン (縦バーつき折りたたみシンボルに似たシンプルな✕) */
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </button>
      </div>

      <div className="outline-sidebar__body">
        {isCollapsed ? (
          /* 折りたたみ時：ミニマップドットインジケーター */
          <div className="outline-sidebar__minimap">
            {positionedItems.map((item) => {
              return (
                <button
                  key={item.blockId}
                  className={`outline-sidebar__minimap-dot ${item.isH1 ? 'is-h1' : 'is-bold'}`}
                  style={{ top: `${item.topPercent}%` }}
                  onClick={() => onJumpToNode(item.index, 'doc')}
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
            {outlineItems.length === 0 ? (
              <div className="outline-sidebar__empty">
                見出しがありません
              </div>
            ) : (
              outlineItems.map((item) => (
                <button
                  key={item.blockId}
                  className={`outline-sidebar__item ${item.isH1 ? 'outline-sidebar__item--h1' : 'outline-sidebar__item--bold'}`}
                  onClick={() => onJumpToNode(item.index, 'doc')}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
