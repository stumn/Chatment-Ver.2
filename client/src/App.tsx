import React, { useState, useCallback, useRef } from 'react';
import type { EmphasisLevel } from './types';
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
  const [defaultEmphasis, setDefaultEmphasis] = useState<EmphasisLevel>(0);
  const [displayFilter, setDisplayFilter] = useState<'all' | 'highlightAndStandard' | 'highlightOnly'>('all');

  const chatPanelRef = useRef<HTMLDivElement>(null);

  const { doc, nodes, connectionState, userCount, isReady, triggerSave, docId } = useLoroDoc();
  const { ratio, containerRef, handleMouseDown, handleDoubleClick } = useSplitView();
  const { docNodes, chatNodes } = useOverflow(nodes, chatPanelRef, 36);

  let dominantClass = 'dominant-neutral';
  let isDominantDoc = false;
  if (ratio > 0.65) {
    dominantClass = 'dominant-doc';
    isDominantDoc = true;
  } else if (ratio < 0.35) {
    dominantClass = 'dominant-chat';
  }

  const filteredDocNodes = docNodes.filter(({ node, loroMap }) => {
    let emphasis = 0;
    if (loroMap) {
      if (node.type === 'chat') {
        // If the workspace is currently dominant-doc, chat nodes appear as muted (-1)
        emphasis = isDominantDoc ? -1 : 0;
      } else {
        emphasis = (loroMap.get('emphasis') as number) || 0;
      }
    }

    if (displayFilter === 'highlightOnly') return emphasis === 1;
    if (displayFilter === 'highlightAndStandard') return emphasis >= 0;
    return true; // all
  });

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
            Chatment ver.2 <span style={{ fontSize: '12px', opacity: 0.6, marginLeft: '8px' }}>#{docId}</span>
          </h1>
        </div>

        <div className="app-header__center" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--glass-bg)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', gap: '4px', paddingRight: '4px' }}>
              <button
                title="太字"
                onClick={() => setDefaultEmphasis(1)}
                style={{ width: '22px', height: '22px', borderRadius: '50%', background: defaultEmphasis === 1 ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${defaultEmphasis === 1 ? 'var(--text-primary)' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--text-primary)' }}>B</span>
              </button>
              <button
                title="標準"
                onClick={() => setDefaultEmphasis(0)}
                style={{ width: '22px', height: '22px', borderRadius: '50%', background: defaultEmphasis === 0 ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${defaultEmphasis === 0 ? 'var(--text-primary)' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#666' }} />
              </button>
              <button
                title="控えめ"
                onClick={() => setDefaultEmphasis(-1)}
                style={{ width: '22px', height: '22px', borderRadius: '50%', background: defaultEmphasis === -1 ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${defaultEmphasis === -1 ? '#aaa' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#aaa' }} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--glass-bg)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
            <select
              value={displayFilter}
              onChange={e => setDisplayFilter(e.target.value as any)}
              style={{ appearance: 'none', padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '11px', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
            >
              <option value="all">すべて</option>
              <option value="highlightAndStandard">標準＋太字</option>
              <option value="highlightOnly">太字のみ</option>
            </select>
          </div>

        </div>

        <div className="app-header__right">
          <span className="app-header__user">
            <span className="app-header__user-icon" title={`現在 ${userCount} 人が接続中`}></span>
            {userName}
          </span>
          <ConnectionStatus state={connectionState} />
        </div>
      </header>

      <main className={`app-main ${dominantClass}`}>
        <SplitView
          ratio={ratio}
          isDominantDoc={isDominantDoc}
          onHandleMouseDown={handleMouseDown}
          onHandleDoubleClick={handleDoubleClick}
          containerRef={containerRef}
          docPanel={
            <DocPanel
              nodes={filteredDocNodes}
              doc={doc}
              userName={userName}
              defaultEmphasis={defaultEmphasis}
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
