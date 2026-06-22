import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EmphasisLevel } from './types';
import { useLoroDoc } from './hooks/useLoroDoc';
import { emitRatioChange } from './loro/sync-client';
import { useOverflow } from './hooks/useOverflow';
import { useSplitView } from './hooks/useSplitView';
import { useDragDrop } from './hooks/useDragDrop';
import { UserSetup } from './components/UserSetup';
import { SplitView } from './components/SplitView';
import { DocPanel } from './components/DocPanel';
import { ChatPanel } from './components/ChatPanel';
import { ConnectionStatus } from './components/ConnectionStatus';
import { GuideModal } from './components/GuideModal';
import { PlaybackControls } from './components/PlaybackControls';

export const App: React.FC = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [userId] = useState(() => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const [defaultEmphasis, setDefaultEmphasis] = useState<EmphasisLevel>(0);
  const [displayFilter, setDisplayFilter] = useState<'all' | 'highlightAndStandard' | 'highlightOnly'>('all');

  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [playbackSteps, setPlaybackSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isAutoplay, setIsAutoplay] = useState(false);

  const chatPanelRef = useRef<HTMLDivElement>(null);

  const { doc, nodes, connectionState, userCount, isReady, triggerSave, docId, ratios } = useLoroDoc();
  const { ratio, setRatio, containerRef, handleMouseDown, handleDoubleClick } = useSplitView();
  const { docNodes, chatNodes } = useOverflow(nodes, chatPanelRef, 36);

  const lastSentRatio = useRef<number | null>(null);
  const throttleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRatio = useRef<number>(ratio);

  useEffect(() => {
    latestRatio.current = ratio;
  }, [ratio]);

  useEffect(() => {
    if (ratio === lastSentRatio.current) return;

    // 1. Throttle: Send ratio update every 150ms during continuous changes
    if (!throttleTimeout.current) {
      throttleTimeout.current = setTimeout(() => {
        throttleTimeout.current = null;
        emitRatioChange(latestRatio.current);
        lastSentRatio.current = latestRatio.current;
      }, 150);
    }

    // 2. Debounce: Ensure final position is sent 100ms after movements stop
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      debounceTimeout.current = null;
      if (latestRatio.current !== lastSentRatio.current) {
        emitRatioChange(latestRatio.current);
        lastSentRatio.current = latestRatio.current;
      }
    }, 100);
  }, [ratio]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (throttleTimeout.current) clearTimeout(throttleTimeout.current);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, []);

  React.useEffect(() => {
    if (userName && isReady) {
      const seen = localStorage.getItem('chatment-guide-seen');
      if (!seen) {
        setIsGuideOpen(true);
        localStorage.setItem('chatment-guide-seen', 'true');
      }
    }
  }, [userName, isReady]);

  const setStep = useCallback((index: number) => {
    if (!doc || playbackSteps.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(playbackSteps.length - 1, index));
    setCurrentStepIndex(clampedIndex);

    const step = playbackSteps[clampedIndex];
    if (step) {
      doc.checkout(step.frontiers);
    }
  }, [doc, playbackSteps]);

  const handlePrev = useCallback(() => {
    setIsAutoplay(false);
    setStep(currentStepIndex - 1);
  }, [currentStepIndex, setStep]);

  const handleNext = useCallback(() => {
    setIsAutoplay(false);
    setStep(currentStepIndex + 1);
  }, [currentStepIndex, setStep]);

  const handlePrev3 = useCallback(() => {
    setIsAutoplay(false);
    setStep(currentStepIndex - 3);
  }, [currentStepIndex, setStep]);

  const handleNext3 = useCallback(() => {
    setIsAutoplay(false);
    setStep(currentStepIndex + 3);
  }, [currentStepIndex, setStep]);

  const handleScrub = useCallback((index: number) => {
    setIsAutoplay(false);
    setStep(index);
  }, [setStep]);

  const getTargetBlockIdForChange = useCallback((change: any): string | null => {
    if (!doc) return null;

    // 1. Try message parsing
    if (change.message) {
      const msg = change.message;
      const parts = msg.split(':');
      const action = parts[0];

      if (action === 'chat' && parts.length >= 4) {
        return parts[2];
      }
      if (action === 'doc' && parts.length >= 4) {
        return parts[2];
      }
      if (action === 'edit' && parts.length >= 3) {
        return parts[1];
      }
      if (action === 'move' && parts.length >= 3) {
        return parts[1];
      }
      if (action === 'reaction' && parts.length >= 4) {
        return parts[2];
      }
      if (action === 'emphasis' && parts.length >= 3) {
        return parts[1];
      }
      if (action === 'delete' && parts.length >= 3) {
        return parts[1];
      }
    }

    // 2. Fallback: container paths
    try {
      const changedCids = doc.getChangedContainersIn({ peer: change.peer, counter: change.counter }, change.length);
      for (const cid of changedCids) {
        const path = doc.getPathToContainer(cid);
        if (path && path.length >= 2 && path[0] === 'stream') {
          const nodeIndex = path[1];
          if (typeof nodeIndex === 'number') {
            const stream = doc.getMovableList('stream');
            if (nodeIndex >= 0 && nodeIndex < stream.length) {
              const nodeMap = stream.get(nodeIndex);
              if (nodeMap && typeof (nodeMap as any).get === 'function') {
                const blockId = (nodeMap as any).get('blockId') as string;
                if (blockId) return blockId;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to find target block ID from container path:", e);
    }
    return null;
  }, [doc]);

  const startPlayback = useCallback(() => {
    const changesMap = doc?.getAllChanges();
    if (!changesMap) return;

    const allChanges: any[] = [];
    for (const changes of changesMap.values()) {
      allChanges.push(...changes);
    }
    allChanges.sort((a, b) => {
      if (a.lamport !== b.lamport) return a.lamport - b.lamport;
      return a.timestamp - b.timestamp;
    });

    if (allChanges.length === 0) {
      alert("再生する履歴がまだありません。メッセージやドキュメントを投稿してみましょう！");
      return;
    }

    const steps = [
      {
        change: null,
        frontiers: [],
        description: "🌱 初期状態（会話が始まる前）",
        targetBlockId: null,
        action: '',
        deletedIndex: null,
      },
      ...allChanges.map((change, i) => {
        const stepFrontiers = [{ peer: change.peer, counter: change.counter + change.length - 1 }];
        let desc = '';
        const targetBlockId = getTargetBlockIdForChange(change);
        let actionName = '';
        let deletedIndex: number | null = null;
        let finalTargetBlockId = targetBlockId;

        if (change.message) {
          const msg = change.message;
          const parts = msg.split(':');
          const action = parts[0];
          actionName = action;

          if (action === 'chat') {
            const author = parts[1] || '';
            const content = parts.slice(3).join(':') || parts.slice(2).join(':') || '';
            desc = `💬 ${author}: "${content}"`;
          } else if (action === 'doc') {
            const author = parts[1] || '';
            const content = parts.slice(3).join(':') || parts.slice(2).join(':') || '';
            desc = `📄 ${author} が新しいブロック「${content}」を追加`;
          } else if (action === 'move') {
            desc = `⇅ ドキュメントのブロックを並び替え`;
          } else if (action === 'reaction') {
            const author = parts[1] || '';
            const emoji = parts[3] || parts[2] || '';
            desc = `✨ ${author} がリアクション 「${emoji}」 を選択`;
          } else if (action === 'edit') {
            const content = parts.slice(2).join(':') || parts.slice(1).join(':') || '';
            desc = `✍️ ドキュメントを編集: 「${content}」`;
          } else if (action === 'delete') {
            desc = `🗑️ ドキュメントのブロックを削除`;
            if (parts.length >= 3) {
              finalTargetBlockId = parts[1];
              deletedIndex = parseInt(parts[2]);
            } else if (parts.length === 2) {
              deletedIndex = parseInt(parts[1]);
            }
          } else if (action === 'emphasis') {
            const levelStr = parts[2] || parts[1] || '0';
            const level = parseInt(levelStr);
            const levelName = level === 1 ? '太字' : level === -1 ? '控えめ' : '標準';
            desc = `🎨 強調度を「${levelName}」に変更`;
          } else {
            desc = msg;
          }
        } else {
          const d = new Date(change.timestamp * 1000);
          const timeStr = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          desc = `更新 by Peer ${change.peer} (${timeStr})`;
        }

        return {
          change,
          frontiers: stepFrontiers,
          description: desc,
          targetBlockId: finalTargetBlockId,
          action: actionName,
          deletedIndex,
        };
      })
    ];

    setPlaybackSteps(steps);
    setCurrentStepIndex(0);
    setIsPlaybackMode(true);

    // Checkout step 0 immediately
    if (steps[0] && doc) {
      doc.checkout(steps[0].frontiers);
    }
  }, [doc, getTargetBlockIdForChange]);

  const exitPlayback = useCallback(() => {
    if (!doc) return;
    setIsAutoplay(false);
    doc.attach();
    setIsPlaybackMode(false);
  }, [doc]);

  // Autoplay Effect
  React.useEffect(() => {
    if (isAutoplay) {
      const timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          const next = prev + 1;
          if (next < playbackSteps.length) {
            const step = playbackSteps[next];
            if (step && doc) {
              doc.checkout(step.frontiers);
            }
            return next;
          } else {
            setIsAutoplay(false);
            return prev;
          }
        });
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [isAutoplay, playbackSteps, doc]);

  // Playback Auto Scroll Follow
  React.useEffect(() => {
    if (isPlaybackMode && playbackSteps.length > 0) {
      const step = playbackSteps[currentStepIndex];
      if (step) {
        const timer = setTimeout(() => {
          if (step.action === 'delete' && step.deletedIndex !== null) {
            const elem = document.getElementById('doc-block-deletion-line');
            if (elem) {
              elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else if (step.targetBlockId) {
            const blockId = step.targetBlockId;
            const nodeObj = nodes.find(n => n.id === blockId);
            if (nodeObj) {
              const idx = nodeObj.index;
              const type = nodeObj.node.type;

              if (type === 'doc') {
                const docElem = document.getElementById(`doc-block-${idx}`);
                if (docElem) {
                  docElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              } else if (type === 'chat') {
                const chatElem = document.getElementById(`chat-message-${idx}`);
                if (chatElem) {
                  chatElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                const docElem = document.getElementById(`doc-block-${idx}`);
                if (docElem) {
                  docElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [currentStepIndex, isPlaybackMode, nodes, playbackSteps]);

  let dominantClass = 'dominant-neutral';
  let isDominantDoc = false;
  if (ratio > 0.65) {
    dominantClass = 'dominant-doc';
    isDominantDoc = true;
  } else if (ratio < 0.35) {
    dominantClass = 'dominant-chat';
  }

  const handleJumpToNode = useCallback((index: number, targetPanel: 'doc' | 'chat') => {
    let delay = 0;
    if (targetPanel === 'doc' && ratio < 0.2) {
      setRatio(0.4); // slightly leaning left so doc is visible
      delay = 150;
    } else if (targetPanel === 'chat' && ratio > 0.8) {
      setRatio(0.5);
      delay = 150;
    }

    setTimeout(() => {
      const targetId = targetPanel === 'doc' ? `doc-block-${index}` : `chat-message-${index}`;
      const elem = document.getElementById(targetId);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add flash animation via CSS class to prevent destroying inline properties
        elem.classList.remove('jump-flash-animated');
        // Force reflow to allow restarting animation if already present
        void elem.offsetWidth;
        elem.classList.add('jump-flash-animated');

        setTimeout(() => {
          elem.classList.remove('jump-flash-animated');
        }, 1000);
      }
    }, delay);
  }, [ratio, setRatio]);

  const filteredDocNodes = docNodes.filter(({ node, loroMap }) => {
    if (isPlaybackMode) return true; // Bypassing filter during playback

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

  const activeHighlightBlockId = isPlaybackMode ? playbackSteps[currentStepIndex]?.targetBlockId : null;
  const activeDeletedIndex = isPlaybackMode && playbackSteps[currentStepIndex]?.action === 'delete'
    ? playbackSteps[currentStepIndex]?.deletedIndex
    : null;

  return (
    <div className={`app ${isPlaybackMode ? 'playback-active' : ''}`} id="app">
      <header className="app-header" id="app-header">
        <div className="app-header__left">
          <h1 className="app-header__title">
            Chatment <span className="btn-label-text">ver.2</span> <span className="header-doc-id" style={{ fontSize: '12px', opacity: 0.6, marginLeft: '8px' }}>#{docId}</span>
          </h1>
        </div>

        <div className="app-header__center" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>

          <div className="segmented-control" title="新規ブロックの初期強調度">
            <button
              title="太字"
              onClick={() => setDefaultEmphasis(1)}
              className={`segmented-control__item segmented-control__item--bold ${defaultEmphasis === 1 ? 'segmented-control__item--active' : ''}`}
            >
              太<span className="btn-label-text">字</span>
            </button>
            <button
              title="標準"
              onClick={() => setDefaultEmphasis(0)}
              className={`segmented-control__item ${defaultEmphasis === 0 ? 'segmented-control__item--active' : ''}`}
            >
              標<span className="btn-label-text">準</span>
            </button>
            <button
              title="控えめ"
              onClick={() => setDefaultEmphasis(-1)}
              className={`segmented-control__item segmented-control__item--dimmed ${defaultEmphasis === -1 ? 'segmented-control__item--active' : ''}`}
            >
              控<span className="btn-label-text">えめ</span>
            </button>
          </div>

          <div className="segmented-control" title="表示フィルター">
            <button
              onClick={() => setDisplayFilter('all')}
              disabled={isPlaybackMode}
              className={`segmented-control__item ${displayFilter === 'all' ? 'segmented-control__item--active' : ''}`}
              style={{ opacity: isPlaybackMode && displayFilter !== 'all' ? 0.5 : 1 }}
            >
              すべて
            </button>
            <button
              onClick={() => setDisplayFilter('highlightAndStandard')}
              disabled={isPlaybackMode}
              className={`segmented-control__item ${displayFilter === 'highlightAndStandard' ? 'segmented-control__item--active' : ''}`}
              style={{ opacity: isPlaybackMode && displayFilter !== 'highlightAndStandard' ? 0.5 : 1 }}
            >
              標準＋太<span className="btn-label-text">字</span>
            </button>
            <button
              onClick={() => setDisplayFilter('highlightOnly')}
              disabled={isPlaybackMode}
              className={`segmented-control__item ${displayFilter === 'highlightOnly' ? 'segmented-control__item--active' : ''}`}
              style={{ opacity: isPlaybackMode && displayFilter !== 'highlightOnly' ? 0.5 : 1 }}
            >
              太字<span className="btn-label-text">のみ</span>
            </button>
          </div>

          <button
            className="guide-toggle-btn"
            onClick={() => setIsGuideOpen(true)}
            title="体験ガイドを表示"
          >
            💡 <span className="btn-label-text">ガイド</span>
          </button>

          <button
            className="guide-toggle-btn"
            onClick={isPlaybackMode ? exitPlayback : startPlayback}
            title={isPlaybackMode ? "プレイバックを終了" : "プレイバック履歴を再生"}
            style={{
              background: isPlaybackMode ? 'var(--accent-primary)' : '#eaf3ff',
              borderColor: isPlaybackMode ? 'var(--accent-primary)' : '#c8dfff',
              color: isPlaybackMode ? 'white' : '#1e60c4',
            }}
          >
            ⏱️ <span className="btn-label-text">履歴再生</span>
          </button>

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
              onJumpToNode={handleJumpToNode}
              isPlaybackActive={isPlaybackMode}
              activeHighlightBlockId={activeHighlightBlockId}
              activeDeletedIndex={activeDeletedIndex}
            />
          }
          chatPanel={
            <ChatPanel
              nodes={chatNodes}
              doc={doc}
              userName={userName}
              userId={userId}
              panelRef={chatPanelRef}
              ratio={ratio}
              onAfterEdit={handleAfterEdit}
              onJumpToNode={handleJumpToNode}
              isPlaybackActive={isPlaybackMode}
              activeHighlightBlockId={activeHighlightBlockId}
            />
          }
          ratios={ratios}
          onSelectRatio={(newRatio) => {
            console.log("[App] onSelectRatio called with newRatio:", newRatio);
            setRatio(newRatio);
          }}
        />
      </main>
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      {isPlaybackMode && (
        <PlaybackControls
          currentStep={currentStepIndex}
          totalSteps={playbackSteps.length}
          description={playbackSteps[currentStepIndex]?.description || ''}
          isAutoplay={isAutoplay}
          onPrev={handlePrev}
          onNext={handleNext}
          onPrev3={handlePrev3}
          onNext3={handleNext3}
          onTogglePlay={() => setIsAutoplay(prev => !prev)}
          onScrub={handleScrub}
          onExit={exitPlayback}
        />
      )}
    </div>
  );
};
