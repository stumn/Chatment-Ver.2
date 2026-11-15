import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { StreamNodeWithIndex, EmphasisLevel, AuthorInfo } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { useBlockEditor } from '../hooks/useBlockEditor';
import { BlockTimelineCircle } from './BlockTimelineCircle';
import { BlockTimelineH1Button } from './BlockTimelineH1Button';
import { BlockActionToolbar } from './BlockActionToolbar';
import { useThemeCustomization } from '../contexts/ThemeCustomizationContext';
import {
  calculateReactionStats,
  calculateLevel,
  calculateStep,
  getDocBgIntensity,
} from '../utils/reactionUtils';
import { useRoom } from '../contexts/RoomContext';

interface DocBlockProps {
  nodeWithIndex: StreamNodeWithIndex;
  doc: LoroDoc | null;
  currentAuthorInfo: AuthorInfo;
  defaultEmphasis: number | 'h1';
  isFirstInDoc?: boolean;
  isLastInDoc?: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat', source?: string) => void;
  isCautiousMode?: boolean;
}

export const DocBlockComponent: React.FC<DocBlockProps> = ({
  nodeWithIndex,
  doc,
  currentAuthorInfo,
  defaultEmphasis,
  isFirstInDoc,
  isLastInDoc,
  isDropTarget,
  isDragging,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAfterEdit,
  onJumpToNode,
  isCautiousMode,
}) => {
  const { node, index, loroText, loroMap } = nodeWithIndex;
  const blockIndent = node.indent || 0;
  const blockHeading = node.heading ?? (/^[#＃]/.test(node.content) ? 'h1' : null);
  const isChat = node.type === 'chat';

  // このブロックの著者情報
  const blockAuthor: AuthorInfo = node.author;
  const blockSubAuthors = node.subAuthors || [];

  // エディタロジックとイベントをフックへ移管
  const {
    contentRef,
    isDraggable,
    setIsDraggable,
    isFocused,
    setIsFocused,
    handleFocus,
    handleBlur,
    handleInput,
    handleKeyDown,
    adjustIndent,
    setBlockStyle,
  } = useBlockEditor({
    doc,
    index,
    node,
    loroText,
    loroMap,
    currentAuthorInfo,
    defaultEmphasis,
    isFirstInDoc,
    isLastInDoc,
    isCautiousMode,
    onAfterEdit,
  });

  const getIndentMargin = (indent: number) => {
    if (indent === 1) return 32;
    if (indent >= 2) return 60;
    return 0;
  };

  const { R } = useRoom();
  const [isPulsing, setIsPulsing] = useState(false);
  const pulseTimerRef = useRef<number | null>(null);

  const triggerPulse = useCallback(() => {
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
    }
    setIsPulsing(true);
    pulseTimerRef.current = window.setTimeout(() => {
      setIsPulsing(false);
      pulseTimerRef.current = null;
    }, 400);
  }, []);

  // Read emphasis level from Map for doc blocks (block level styling)
  const blockEmphasis = blockHeading === 'h1' ? 0 : (loroMap?.get('emphasis') as EmphasisLevel || 0);

  // 共通ユーティリティから集計
  const stats = calculateReactionStats(node);
  const totalReactions = stats.attention;
  const emojiReactionCount = stats.emojiTotal;
  const hasEmojiReactions = emojiReactionCount > 0;
  const voteScore = stats.voteScore;

  const level = calculateLevel(voteScore, R);
  const step = calculateStep(level);

  const { themeSettings } = useThemeCustomization();
  const showEmojiIndicator = hasEmojiReactions && themeSettings.reactionIcon === 'smile';

  let dynamicStyle: React.CSSProperties = {
    marginLeft: `${getIndentMargin(blockIndent)}px`,
    width: `calc(100% - ${getIndentMargin(blockIndent)}px)`,
    transition: 'background 0.3s ease, margin-left 0.2s ease, width 0.2s ease',
  };

  if (voteScore !== 0) {
    const isPositive = voteScore > 0;
    // 背景色の濃さ: 強度 = 0.12 + (現行上限 - 0.12) * level。soft設定時は従来係数
    const effectiveIntensity = getDocBgIntensity(level, themeSettings.bgIntensity === 'soft');

    const hsl = isPositive ? '130, 60%, 45%' : '0, 70%, 55%';

    // ベースの背景（通常ベタ塗り vs グラデーション）
    // 「緑と赤の背景色について、右端から左にかけて薄くなっていき、中央で消えるようなグラデーションにする」
    const baseBackground = themeSettings.bgStyle === 'gradient'
      ? `linear-gradient(to left, hsla(${hsl}, ${effectiveIntensity}) 0%, hsla(${hsl}, ${effectiveIntensity * 0.35}) 35%, transparent 50%, transparent 100%)`
      : `hsla(${hsl}, ${effectiveIntensity})`;

    // インデントが最も深い部分（indent >= 2, margin = 60px）の投稿の半分と同じ幅
    // 最深ブロック幅 = (100% - 60px)。その半分 = 50% - 30px (親幅基準)。
    // 現在のブロック幅 = 100% - indentMargin。
    // したがって、現在のブロックに対する幅は calc(50% + (indentMargin / 2 - 30)px)
    const indentMargin = getIndentMargin(blockIndent);
    const maxIndentMargin = 60;
    const offsetPx = indentMargin / 2 - maxIndentMargin / 2;
    const stripeWidth = offsetPx === 0
      ? '50%'
      : `calc(50% ${offsetPx > 0 ? '+' : '-'} ${Math.abs(offsetPx)}px)`;

    // ストライプ（緑：右上がり＝135deg、赤：右下がり＝45deg、どの行でも最深インデントの半分幅）
    if (themeSettings.stripes === 'stripe') {
      const angle = isPositive ? '135deg' : '45deg';
      // 文字が重なっても邪魔にならないよう大幅に薄く調整
      const stripeAlpha = Math.min(0.09, effectiveIntensity * 0.08 + 0.03);
      const stripeColor = isPositive
        ? `hsla(130, 60%, 40%, ${stripeAlpha})`
        : `hsla(0, 70%, 50%, ${stripeAlpha})`;

      // 絵文字記号がある場合はその部分（右端44px）にストライプがかからないようにする
      const rightOffset = showEmojiIndicator ? 44 : 0;
      const finalStripeWidth = rightOffset > 0 ? `calc(${stripeWidth} - ${rightOffset}px)` : stripeWidth;
      const finalStripePos = rightOffset > 0 ? `right ${rightOffset}px center` : 'right center';

      dynamicStyle = {
        ...dynamicStyle,
        background: `repeating-linear-gradient(${angle}, ${stripeColor} 0px, ${stripeColor} 2px, transparent 2px, transparent 8px) ${finalStripePos} / ${finalStripeWidth} 100% no-repeat, ${baseBackground}`,
      };
    } else {
      dynamicStyle = {
        ...dynamicStyle,
        background: baseBackground,
      };
    }
  }
  const showDragHandle = true;
  const isContentEmpty = node.content === '';
  const showIndentMark = (blockIndent > 0) && (!isContentEmpty || isFocused);
  const isIndentPending = isFocused;

  const blockClass = [
    'doc-block',
    `doc-block--indent-${blockIndent}`,
    isChat ? 'doc-block--chat' : 'doc-block--doc',
    blockHeading === 'h1' ? 'doc-block--h1' : '',
    `doc-emphasis-${blockEmphasis}`,
    isDropTarget ? 'doc-block--drop-target' : '',
    isDragging ? 'doc-block--dragging' : '',
    isContentEmpty ? 'doc-block--empty' : '',
  ].filter(Boolean).join(' ');

  // Render content safely via HTML for contentEditable support without React child fights
  const renderContentAsHTML = (): string => {
    let text = node.content || '';
    if (!isFocused && blockHeading === 'h1') {
      text = text.replace(/^[#＃]\s*/, '');
    }
    const urlRegex = /(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef<>"]+)/g;
    return text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(urlRegex, (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" class="doc-inline-link" onclick="event.stopPropagation()">${url}</a>`
      );
  };

  React.useEffect(() => {
    if (contentRef.current) {
      const html = renderContentAsHTML();
      if (contentRef.current.innerHTML !== html) {
        contentRef.current.innerHTML = html;
      }
    }
  }, [isFocused, blockHeading, node.content]);

  return (
    <div
      className={`${blockClass} reaction-transition`}
      data-lv={step}
      style={dynamicStyle}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      id={`doc-block-${index}`}
    >
      {blockHeading === 'h1' ? (
        <BlockTimelineH1Button
          index={index}
          isFocused={isFocused}
          blockAuthor={blockAuthor}
          blockSubAuthors={blockSubAuthors}
          timestamp={node.timestamp}
          totalReactions={totalReactions}
          onJumpToNode={onJumpToNode}
        />
      ) : (
        <BlockTimelineCircle
          index={index}
          blockIndent={blockIndent}
          isChat={isChat}
          isIndentPending={isIndentPending}
          showIndentMark={showIndentMark}
          isContentEmpty={isContentEmpty}
          isFocused={isFocused}
          blockAuthor={blockAuthor}
          blockSubAuthors={blockSubAuthors}
          timestamp={node.timestamp}
          totalReactions={totalReactions}
          onJumpToNode={onJumpToNode}
        />
      )}
      <div className="doc-block__body">
        <div
          key={node.blockId}
          ref={contentRef}
          className="doc-block__content"
          contentEditable
          suppressContentEditableWarning
          onFocus={handleFocus}
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: renderContentAsHTML() }}
          style={{ cursor: 'text' }}
        />
      </div>
      {showEmojiIndicator && (
        <button
          type="button"
          className="doc-block__reaction-jump"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onJumpToNode(index, 'chat', 'doc-reaction');
          }}
          title={`絵文字リアクションへジャンプ (${emojiReactionCount}件)`}
          aria-label={`絵文字リアクションへジャンプ (${emojiReactionCount}件)`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="doc-block__reaction-jump-icon">
            <circle cx="12" cy="12" r="8.5" />
            <circle className="doc-block__reaction-jump-eye" cx="9" cy="10" r="1" />
            <circle className="doc-block__reaction-jump-eye" cx="15" cy="10" r="1" />
            <path d="M8.5 14c1.8 2.2 5.2 2.2 7 0" />
          </svg>
          <span className="doc-block__reaction-jump-count">{emojiReactionCount}</span>
        </button>
      )}
      <BlockActionToolbar
        showDragHandle={showDragHandle}
        blockIndent={blockIndent}
        blockHeading={blockHeading}
        blockEmphasis={blockEmphasis}
        setIsDraggable={setIsDraggable}
        adjustIndent={adjustIndent}
        setBlockStyle={setBlockStyle}
      />
    </div>
  );
};

export const DocBlock = React.memo(DocBlockComponent, (prevProps, nextProps) => {
  if (prevProps.isDropTarget !== nextProps.isDropTarget) return false;
  if (prevProps.isDragging !== nextProps.isDragging) return false;
  if (prevProps.isCautiousMode !== nextProps.isCautiousMode) return false;
  if (prevProps.defaultEmphasis !== nextProps.defaultEmphasis) return false;
  if (prevProps.nodeWithIndex.index !== nextProps.nodeWithIndex.index) return false;
  if (prevProps.nodeWithIndex.id !== nextProps.nodeWithIndex.id) return false;

  const prevNode = prevProps.nodeWithIndex.node;
  const nextNode = nextProps.nodeWithIndex.node;
  if (prevNode.content !== nextNode.content) return false;
  if (prevNode.timestamp !== nextNode.timestamp) return false;
  if (prevNode.reactions !== nextNode.reactions) return false;
  if (prevNode.emojiReactions !== nextNode.emojiReactions) return false;
  if ((prevNode as any).emphasis !== (nextNode as any).emphasis) return false;
  if ((prevNode as any).heading !== (nextNode as any).heading) return false;
  if ((prevNode as any).indent !== (nextNode as any).indent) return false;

  return true;
});
