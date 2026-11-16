import React, { useRef, useEffect, useState } from 'react';
import type { StreamNodeWithIndex, AuthorInfo } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { ChatMessage } from './ChatMessage';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ChatPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
  userId: string;
  currentAuthorInfo?: AuthorInfo;
  panelRef: React.RefObject<HTMLDivElement | null>;
  ratio: number;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
  isMobile?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  nodes,
  doc,
  userName,
  userId,
  currentAuthorInfo = { displayName: userName, realName: userName, userId },
  panelRef,
  ratio,
  onAfterEdit,
  onJumpToNode,
  isMobile = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const rafIdRef = useRef<number | null>(null);

  // 2章: 同時に開くメニューは1つだけ
  const [openMenuBlockId, setOpenMenuBlockId] = useState<string | null>(null);
  // 5章: 削除確認ダイアログの対象ノード
  const [deleteTargetNode, setDeleteTargetNode] = useState<StreamNodeWithIndex | null>(null);

  // アンマウント時にタイマーを解除するクリーンアップ
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Monitor user scrolling to toggle the bottom lock state
  const handleScroll = React.useCallback(() => {
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const container = messagesContainerRef.current;
      if (!container) return;
      const { scrollHeight, scrollTop, clientHeight } = container;
      const S = scrollHeight - scrollTop - clientHeight;

      // threshold = 150px
      const nearBottom = S < 150;
      isNearBottomRef.current = nearBottom;

      if (nearBottom) {
        setShowUnreadBanner((prev) => (prev ? false : prev));
      }
    });
  }, []);

  // Auto-scroll to bottom on new messages, if not locked
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Show unread banner only if new messages arrive while scrolled up
      setShowUnreadBanner(true);
    }
  }, [nodes.length]);

  // Instant scroll to bottom when panel is resized via split-handle
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
    return () => cancelAnimationFrame(id);
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
            isMenuOpen={openMenuBlockId === nodeWithIndex.node.blockId}
            onToggleMenu={(open) => setOpenMenuBlockId(open ? nodeWithIndex.node.blockId : null)}
            onRequestDelete={() => setDeleteTargetNode(nodeWithIndex)}
            onAfterEdit={onAfterEdit}
            onJumpToNode={onJumpToNode}
            isMobile={isMobile}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <DeleteConfirmModal
        isOpen={deleteTargetNode !== null}
        nodeWithIndex={deleteTargetNode}
        doc={doc}
        currentUserId={userId}
        currentAuthorInfo={currentAuthorInfo}
        onClose={() => setDeleteTargetNode(null)}
        onAfterEdit={onAfterEdit}
      />

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
