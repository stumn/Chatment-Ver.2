import React from 'react';
import type { StreamNodeWithIndex, EmphasisLevel, AuthorInfo } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { useBlockEditor } from '../hooks/useBlockEditor';
import { BlockTimelineCircle } from './BlockTimelineCircle';
import { BlockTimelineH1Button } from './BlockTimelineH1Button';
import { BlockActionToolbar } from './BlockActionToolbar';

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
  isPlaybackActive?: boolean;
  activeHighlightBlockId?: string | null;
  isCautiousMode?: boolean;
}

export const DocBlock: React.FC<DocBlockProps> = ({
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
  isPlaybackActive,
  activeHighlightBlockId,
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
    isPlaybackActive,
    isCautiousMode,
    onAfterEdit,
  });

  const getIndentMargin = (indent: number) => {
    if (indent === 1) return 32;
    if (indent >= 2) return 60;
    return 0;
  };

  // Read emphasis level from Map for doc blocks (block level styling)
  const blockEmphasis = blockHeading === 'h1' ? 0 : (loroMap?.get('emphasis') as EmphasisLevel || 0);

  // Calculate total reactions and dynamic vote emphasis
  let totalReactions = 0;
  let upvotes = 0;
  let downvotes = 0;
  if ('reactions' in node && node.reactions) {
    totalReactions = Object.values(node.reactions).length;
    Object.values(node.reactions).forEach(emoji => {
      if (emoji === '⇧') upvotes++;
      if (emoji === '⇩') downvotes++;
    });
  }
  const voteScore = upvotes - downvotes;

  let dynamicStyle: React.CSSProperties = {
    marginLeft: `${getIndentMargin(blockIndent)}px`,
    width: `calc(100% - ${getIndentMargin(blockIndent)}px)`,
    transition: 'background 0.3s ease, margin-left 0.2s ease, width 0.2s ease',
  };
  if (voteScore > 0) {
    const intensity = Math.min(1.0, Math.floor(voteScore / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(130, 60%, 45%, ${intensity})` };
  } else if (voteScore < 0) {
    const intensity = Math.min(1.0, Math.floor(Math.abs(voteScore) / 2) * 0.15 + 0.1);
    dynamicStyle = { ...dynamicStyle, background: `hsla(0, 70%, 55%, ${intensity})` };
  }
  const isHighlighted = activeHighlightBlockId === nodeWithIndex.id;
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
    isHighlighted ? 'playback-highlight' : '',
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
      className={blockClass}
      style={dynamicStyle}
      draggable={isPlaybackActive ? false : isDraggable}
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
          contentEditable={!isPlaybackActive}
          suppressContentEditableWarning
          onFocus={handleFocus}
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: renderContentAsHTML() }}
          style={{ cursor: isPlaybackActive ? 'default' : 'text' }}
        />
      </div>
      <BlockActionToolbar
        isPlaybackActive={isPlaybackActive}
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
