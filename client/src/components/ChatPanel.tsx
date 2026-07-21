import React, { useRef, useEffect } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { ChatMessage } from './ChatMessage';

interface ChatPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
  userId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  ratio: number;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
  isPlaybackActive?: boolean;
  activeHighlightBlockId?: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  nodes,
  doc,
  userName,
  userId,
  panelRef,
  ratio,
  onAfterEdit,
  onJumpToNode,
  isPlaybackActive,
  activeHighlightBlockId,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showUnreadBanner, setShowUnreadBanner] = React.useState(false);

  // Monitor user scrolling to toggle the bottom lock state
  const handleScroll = React.useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollHeight, scrollTop, clientHeight } = container;
    const S = scrollHeight - scrollTop - clientHeight;

    // threshold = 150px
    const nearBottom = S < 150;
    isNearBottomRef.current = nearBottom;

    if (nearBottom) {
      setShowUnreadBanner(false);
    }
  }, []);

  // Auto-scroll to bottom on new messages, if not locked
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (!isPlaybackActive) {
      // Show unread banner only if new messages arrive while scrolled up
      setShowUnreadBanner(true);
    }
  }, [nodes.length, isPlaybackActive]);

  // Instant scroll to bottom when panel is resized via split-handle
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [ratio]);

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowUnreadBanner(false);
    isNearBottomRef.current = true;
  }, []);

  return (
    <div className="chat-panel" ref={panelRef as React.RefObject<HTMLDivElement>} id="chat-panel" style={{ position: 'relative' }}>
      <div
        className="chat-panel__messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {nodes.length < 3 && (
          <div className="chat-panel__empty">
            <p>チャット入力欄からメッセージを書き込んで送信してみましょう</p>
          </div>
        )}
        {nodes.map((nodeWithIndex) => (
          <ChatMessage
            key={nodeWithIndex.id}
            nodeWithIndex={nodeWithIndex}
            doc={doc}
            isOwn={nodeWithIndex.node.author.userId === userId}
            userId={userId}
            onAfterEdit={onAfterEdit}
            onJumpToNode={onJumpToNode}
            isPlaybackActive={isPlaybackActive}
            activeHighlightBlockId={activeHighlightBlockId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {showUnreadBanner && (
        <button
          className="chat-panel__unread-banner"
          onClick={scrollToBottom}
          id="unread-chat-banner"
        >
          ⇩ 新しいメッセージがあります
        </button>
      )}
    </div>
  );
};
