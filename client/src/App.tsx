import React, { useState, useCallback, useRef } from 'react';
import { useLoroDoc } from './hooks/useLoroDoc';
import { useOverflow } from './hooks/useOverflow';
import { useSplitView } from './hooks/useSplitView';
import { useDragDrop } from './hooks/useDragDrop';
import { UserSetup } from './components/UserSetup';
import { SplitView } from './components/SplitView';
import { DocPanel } from './components/DocPanel';
import { ChatPanel } from './components/ChatPanel';
import { ConnectionStatus } from './components/ConnectionStatus';

export const App: React.FC = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [userId] = useState(() => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const { doc, nodes, connectionState, isReady, triggerSave } = useLoroDoc();
  const { ratio, containerRef, handleMouseDown, handleDoubleClick } = useSplitView();
  const { docNodes, chatNodes } = useOverflow(nodes, chatPanelRef, 72);

  const handleAfterEdit = useCallback(() => {
    triggerSave();
  }, [triggerSave]);

  const {
    dragState,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useDragDrop(doc, handleAfterEdit);

  if (!userName) {
    return <UserSetup onComplete={setUserName} />;
  }

  if (!isReady) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="app" id="app">
      <header className="app-header" id="app-header">
        <div className="app-header__left">
          <h1 className="app-header__title">
            <span className="app-header__icon">💬</span>
            Chatment ver.2
          </h1>
        </div>
        <div className="app-header__right">
          <span className="app-header__user">
            <span className="app-header__user-icon">👤</span>
            {userName}
          </span>
          <ConnectionStatus state={connectionState} />
        </div>
      </header>

      <main className="app-main">
        <SplitView
          ratio={ratio}
          onHandleMouseDown={handleMouseDown}
          onHandleDoubleClick={handleDoubleClick}
          containerRef={containerRef}
          docPanel={
            <DocPanel
              nodes={docNodes}
              doc={doc}
              userName={userName}
              dragState={dragState}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onAfterEdit={handleAfterEdit}
            />
          }
          chatPanel={
            <ChatPanel
              nodes={chatNodes}
              doc={doc}
              userName={userName}
              userId={userId}
              panelRef={chatPanelRef}
              onAfterEdit={handleAfterEdit}
            />
          }
        />
      </main>
    </div>
  );
};
