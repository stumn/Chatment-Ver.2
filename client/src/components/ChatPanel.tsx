import React, { useRef, useEffect } from 'react';
import type { StreamNodeWithIndex } from '../types';
import type { LoroDoc } from 'loro-crdt';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatPanelProps {
  nodes: StreamNodeWithIndex[];
  doc: LoroDoc | null;
  userName: string;
  userId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  ratio: number;
  onAfterEdit: () => void;
  onJumpToNode: (index: number, target: 'doc' | 'chat') => void;
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
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nodes.length]);

  // Instant scroll to bottom when panel is resized via split-handle
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [ratio]);

  return (
    <div className="chat-panel" ref={panelRef as React.RefObject<HTMLDivElement>} id="chat-panel">
      <div className="chat-panel__messages">
        {nodes.length === 0 && (
          <div className="chat-panel__empty">
            <p>💬 メッセージを送信して会話を始めましょう</p>
          </div>
        )}
        {nodes.map((nodeWithIndex) => (
          <ChatMessage
            key={nodeWithIndex.id}
            nodeWithIndex={nodeWithIndex}
            doc={doc}
            isOwn={nodeWithIndex.node.author === userName}
            userId={userId}
            onAfterEdit={onAfterEdit}
            onJumpToNode={onJumpToNode}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput doc={doc} userName={userName} onAfterSend={onAfterEdit} />
    </div>
  );
};
