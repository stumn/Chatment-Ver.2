import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EmphasisLevel, AuthorInfo } from './types';
import { useLoroDoc } from './hooks/useLoroDoc';
import { usePlayback } from './hooks/usePlayback';
import { emitRatioChange, emitUserAction } from './loro/sync-client';
import { useOverflow } from './hooks/useOverflow';
import { useSplitView } from './hooks/useSplitView';
import { useDragDrop } from './hooks/useDragDrop';
import { UserSetup } from './components/UserSetup';
import { SplitView } from './components/SplitView';
import { DocPanel } from './components/DocPanel';
import { ChatPanel } from './components/ChatPanel';
import { ChatInput } from './components/ChatInput';
import { ConnectionStatus } from './components/ConnectionStatus';
import { GuideModal } from './components/GuideModal';
import { PlaybackControls } from './components/PlaybackControls';
import { OutlineSidebar } from './components/OutlineSidebar';
import { ExportDialog } from './components/ExportDialog';

import { AdminPanel } from './components/AdminPanel';
import { CautiousConfirmProvider } from './components/CautiousConfirmModal';

export const ChatWorkspace: React.FC<{ docId: string; isAdmin: boolean; roomTitle: string }> = ({ docId, isAdmin, roomTitle }) => {
  const [realName, setRealName] = useState<string | null>(null);
  const [currentAuthorInfo, setCurrentAuthorInfo] = useState<AuthorInfo | null>(null);
  const [handleNameOptions, setHandleNameOptions] = useState<AuthorInfo[]>([]);
  const [userId] = useState(() => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const [defaultEmphasis, setDefaultEmphasis] = useState<EmphasisLevel | 'h1'>(0);
  const [isExportOpen, setIsExportOpen] = useState(false);

  /** ログイン情報からハンドルネーム候補2件を生成 */
  const generateHandleNameOptions = useCallback((name: string, attribute: string, age: string, uid: string): AuthorInfo[] => {
    const ageLabel: Record<string, string> = {
      '10s': '10代', '20s': '20代', '30s': '30代', '40s': '40代', '50s': '50代', 'over60s': '60代以上'
    };
    const label = ageLabel[age] || age;
    const displayName2 = `${label}${attribute}`;
    return [
      { displayName: name, realName: name, userId: uid },
      { displayName: displayName2, realName: name, userId: uid },
    ];
  }, []);

  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('chatment-header-collapsed') === 'true';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('chatment-sidebar-collapsed') === 'true';
  });

  const [isCautiousMode, setIsCautiousMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('chatment-cautious-mode');
    return saved !== 'false';
  });
  const [cautiousTooltip, setCautiousTooltip] = useState<string | null>(null);

  const toggleCautiousMode = useCallback(() => {
    const next = !isCautiousMode;
    emitUserAction({
      type: 'cautious-mode',
      before: { enabled: isCautiousMode },
      after: { enabled: next },
      actionDetails: next ? '慎重モードをONにしました' : '慎重モードをOFFにしました',
    });
    setIsCautiousMode(next);
    localStorage.setItem('chatment-cautious-mode', String(next));
    setCautiousTooltip(next ? '他の人が書いた行を編集するとき確認します' : 'オフになりました。');
  }, [isCautiousMode]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('chatment-theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chatment-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!cautiousTooltip) return;

    const timeoutMs = cautiousTooltip === 'オフになりました。' ? 5000 : 10000;
    const timer = window.setTimeout(() => {
      setCautiousTooltip(null);
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [cautiousTooltip]);

  const toggleTheme = useCallback(() => {
    emitUserAction({
      type: 'theme-change',
      before: { theme },
      after: { theme: theme === 'light' ? 'dark' : 'light' },
      actionDetails: `テーマ変更: ${theme} → ${theme === 'light' ? 'dark' : 'light'}`,
    });
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, [theme]);

  const [useCtrlEnter, setUseCtrlEnter] = useState<boolean>(() => {
    const saved = localStorage.getItem('chat_use_ctrl_enter');
    return saved ? saved === 'true' : false;
  });

  const handleToggleCtrlEnter = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked;
    setUseCtrlEnter(nextVal);
    localStorage.setItem('chat_use_ctrl_enter', String(nextVal));
  }, []);

  const toggleHeader = useCallback(() => {
    setIsHeaderCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('chatment-header-collapsed', String(next));
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('chatment-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarCollapsed(false);
    localStorage.setItem('chatment-sidebar-collapsed', 'false');
  }, []);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const { doc, nodes, connectionState, userCount, isReady, hasReceivedServerSnapshot, triggerSave, ratios, ratioBands, undo, redo, canUndo, canRedo, myColorIndex } = useLoroDoc(realName, docId, isAdmin);
  const { ratio, setRatio, containerRef, handleMouseDown, handleDoubleClick, isDragging } = useSplitView({
    onDragStart: (startRatio) => {
      emitUserAction({
        type: 'split-drag-start',
        actionDetails: '仕切り位置ドラッグ開始',
        before: Number(startRatio.toFixed(3)),
      });
    },
    onDragEnd: (startRatio, endRatio, durationMs) => {
      emitRatioChange(endRatio);
      lastSentRatio.current = endRatio;
      emitUserAction({
        type: 'split-drag-end',
        actionDetails: `仕切り位置ドラッグ終了 (${durationMs}ms)`,
        before: Number(startRatio.toFixed(3)),
        after: Number(endRatio.toFixed(3)),
      });
    }
  });
  const { docNodes, chatNodes } = useOverflow(nodes, chatPanelRef, 36);
  const {
    isPlaybackMode,
    playbackSteps,
    currentStepIndex,
    isAutoplay,
    startPlayback,
    exitPlayback,
    handlePrev,
    handleNext,
    handlePrev3,
    handleNext3,
    handleScrub,
    togglePlay,
  } = usePlayback({ doc, nodes });

  const lastLoggedRatio = useRef<number>(ratio);
  const prevIsDragging = useRef<boolean>(false);

  useEffect(() => {
    if (!prevIsDragging.current && isDragging) {
      // ドラッグ開始時の比率を同期 (ジャンプ機能などで自動変更された場合に備える)
      lastLoggedRatio.current = ratio;
    }
    if (prevIsDragging.current && !isDragging) {
      if (ratio !== lastLoggedRatio.current) {
        emitUserAction({
          type: 'ratio-change',
          before: { ratio: lastLoggedRatio.current },
          after: { ratio: ratio },
          actionDetails: `スプリット比率を ${Math.round(ratio * 100)}% に変更しました`,
        });
        lastLoggedRatio.current = ratio;
      }
    }
    prevIsDragging.current = isDragging;
  }, [isDragging, ratio]);

  const handleRatioDoubleClick = useCallback(() => {
    const beforeRatio = ratio;
    handleDoubleClick();
    emitUserAction({
      type: 'ratio-change',
      before: { ratio: beforeRatio },
      after: { ratio: 0.5 },
      actionDetails: `スプリット比率を 50% に変更しました`,
    });
    lastLoggedRatio.current = 0.5;
  }, [ratio, handleDoubleClick]);

  const lastSentRatio = useRef<number | null>(null);
  const throttleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRatio = useRef<number>(ratio);

  useEffect(() => {
    latestRatio.current = ratio;
  }, [ratio]);

  // 初回接続時に現在の比率を同期
  useEffect(() => {
    if (connectionState === 'connected') {
      emitRatioChange(ratio);
      lastSentRatio.current = ratio;
    }
  }, [connectionState]);

  useEffect(() => {
    if (ratio === lastSentRatio.current) return;

    if (isDragging) {
      // ドラッグ中は300msごとにスロットル送信
      if (!throttleTimeout.current) {
        throttleTimeout.current = setTimeout(() => {
          throttleTimeout.current = null;
          emitRatioChange(latestRatio.current);
          lastSentRatio.current = latestRatio.current;
        }, 300);
      }
    } else {
      // ドラッグ外（ダブルクリックやクリック等の即時変更）
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
        throttleTimeout.current = null;
      }
      emitRatioChange(ratio);
      lastSentRatio.current = ratio;
    }
  }, [ratio, isDragging]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (throttleTimeout.current) clearTimeout(throttleTimeout.current);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, []);

  React.useEffect(() => {
    if (currentAuthorInfo && isReady) {
      const seen = localStorage.getItem('chatment-guide-seen');
      if (!seen) {
        setIsGuideOpen(true);
        localStorage.setItem('chatment-guide-seen', 'true');
      }
    }
  }, [currentAuthorInfo, isReady]);



  let dominantClass = 'dominant-neutral';
  let isDominantDoc = false;
  if (ratio > 0.65) {
    dominantClass = 'dominant-doc';
    isDominantDoc = true;
  } else if (ratio < 0.35) {
    dominantClass = 'dominant-chat';
  }

  const handleJumpToNode = useCallback((index: number, targetPanel: 'doc' | 'chat', source?: string) => {
    let targetBlockId = '';
    const nodeObj = nodes.find(n => n.index === index);
    if (nodeObj) {
      targetBlockId = nodeObj.id;
    }
    emitUserAction({
      type: source === 'minimap' ? 'minimap-jump' : (source === 'outline' ? 'outline-jump' : 'jump-to-node'),
      after: { targetBlockId, targetIndex: index, targetPanel },
      actionDetails: `${source || 'UI'} からジャンプ機能を利用しました。`,
    });

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
  }, [ratio, setRatio, nodes]);

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
  } = useDragDrop(doc, currentAuthorInfo, handleAfterEdit);

  if (!currentAuthorInfo) {
    return <UserSetup onComplete={(name, attribute, age) => {
      setRealName(name);
      const options = generateHandleNameOptions(name, attribute, age, userId);
      setHandleNameOptions(options);
      setCurrentAuthorInfo(options[0]); // デフォルトは本名
    }} />;
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
    <div className={`app ${isPlaybackMode ? 'playback-active' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`} id="app">
      <OutlineSidebar
        nodes={nodes}
        onJumpToNode={handleJumpToNode}
        isCollapsed={isSidebarCollapsed}
        onToggle={toggleSidebar}
        onOpenSidebar={openSidebar}
        docId={docId}
      />

      <header className="app-header" id="app-header">
        <div className="app-header__main-row">

          <div className="app-header__center-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 履歴操作 */}
            <div className="toolbar-group" title="履歴操作" style={{ display: 'flex', gap: '2px' }}>
              <button
                className="toolbar-btn"
                onClick={() => { emitUserAction({ type: 'undo', actionDetails: '取り消し操作' }); undo(); }}
                disabled={!canUndo}
                title="取り消し (Ctrl+Z)"
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C23.77 10.96 18.66 8 12.5 8z" />
                </svg>
              </button>
              <button
                className="toolbar-btn"
                onClick={() => { emitUserAction({ type: 'redo', actionDetails: 'やり直し操作' }); redo(); }}
                disabled={!canRedo}
                title="やり直し (Ctrl+Y)"
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="currentColor" d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-6.16 0-11.27 2.96-12.87 7.22l2.37.78c1.05-3.19 4.06-5.5 7.6-5.5 1.96 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
                </svg>
              </button>
            </div>

            <div className="toolbar-divider" style={{ width: '1px', height: '18px', background: 'var(--border-medium)' }} />

            {/* 各種メタ操作 */}
            <div className="app-header__meta-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Ctrl + Enter 送信設定 */}
              <div className="chat-ctrl-enter-container" title="Ctrl + Enter で送信" style={{ display: 'flex', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    cursor: isPlaybackMode ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                    opacity: isPlaybackMode ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useCtrlEnter}
                    onChange={handleToggleCtrlEnter}
                    disabled={isPlaybackMode}
                    id="chat-ctrl-enter-checkbox"
                    style={{ cursor: isPlaybackMode ? 'not-allowed' : 'pointer' }}
                  />
                  <span>Ctrl+Enter送信</span>
                </label>
              </div>

              <div className="toolbar-divider" style={{ width: '1px', height: '18px', background: 'var(--border-medium)' }} />

              <div className="cautious-mode-container" title={isCautiousMode ? "慎重モードをオフにする" : "慎重モードをオンにする"} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span className="cautious-mode-label" style={{ display: 'flex', alignItems: 'center' }}>
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    style={{ marginRight: '4px' }}
                  >
                    <defs>
                      <linearGradient id="leafGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#b8f05a" />
                        <stop offset="100%" stopColor="#7ccf3d" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M12 11
       C11 6.5 7 5.2 3.5 6.2
       C4.2 10.8 7.8 13 12 11Z"
                      fill="url(#leafGradient)"
                    />

                    <path
                      d="M12 11
       C13 7.5 16.8 7.2 20.5 8.6
       C19.8 12.2 16.5 13.4 12 11Z"
                      fill="url(#leafGradient)"
                    />

                    {/* 茎 */}
                    <path
                      d="M12 11V20"
                      stroke="#78c63a"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="btn-label-text">慎重モード</span>
                </span>
                <button
                  role="switch"
                  aria-checked={isCautiousMode}
                  className={`cautious-mode-switch ${isCautiousMode ? 'is-active' : ''}`}
                  onClick={toggleCautiousMode}
                >
                  <span className="cautious-mode-switch__thumb" />
                </button>
                {cautiousTooltip && (
                  <div className="cautious-mode-tooltip">
                    {cautiousTooltip}
                  </div>
                )}
              </div>

              <button
                className="guide-toggle-btn"
                onClick={() => { emitUserAction({ type: 'guide-open', actionDetails: 'ガイドを表示' }); setIsGuideOpen(true); }}
                title="体験ガイドを表示"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span className="btn-label-text">ガイド</span>
              </button>
              <button
                className="guide-toggle-btn"
                onClick={() => setIsExportOpen(true)}
                disabled={!hasReceivedServerSnapshot}
                title={hasReceivedServerSnapshot ? '文章を持ち出す' : '同期中です'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                <span className="btn-label-text">{hasReceivedServerSnapshot ? '持ち出す' : '同期中です'}</span>
              </button>

              <button
                className={`guide-toggle-btn ${isPlaybackMode ? 'guide-toggle-btn--active' : ''}`}
                onClick={isPlaybackMode ? exitPlayback : startPlayback}
                title={isPlaybackMode ? "これまでの流れの確認を終了" : "これまでの流れ（編集履歴）を確認する"}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <polyline points="3 3 3 8 8 8" />
                  <line x1="12" y1="7" x2="12" y2="12" />
                  <line x1="12" y1="12" x2="16" y2="14" />
                </svg>
                <span className="btn-label-text">これまでの流れ</span>
              </button>
            </div>
          </div>

          <div className="app-header__right" style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="toolbar-btn theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
              style={{ marginRight: '12px' }}
            >
              {theme === 'light' ? (
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.02-.39-1.41 0l-1.06 1.06c-.39.38-.39 1.02 0 1.41s1.02.39 1.41 0l1.06-1.06c.38-.38.38-1.02 0-1.41zm-12.37 12.37l-1.06 1.06c-.39.39-.39 1.02 0 1.41s1.02.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41z" />
                </svg>
              )}
              {isExportOpen && (
                <ExportDialog
                  nodes={nodes}
                  roomTitle={roomTitle}
                  roomUrl={`${window.location.origin}/#${docId}`}
                  isAdmin={isAdmin}
                  onClose={() => setIsExportOpen(false)}
                  onLog={({ type, order, format, settings, lines }) => {
                    const logSettings = order === 'both' ? settings.doc : settings[order];
                    emitUserAction({
                      type: `export-${type}`,
                      actionDetails: JSON.stringify({ order, format, includeAuthor: logSettings.includeAuthor, includeTime: logSettings.includeTime, includeReactions: logSettings.includeReactions, lines }),
                    });
                  }}
                />
              )}
            </button>
            <span className="app-header__user">
              {!isPlaybackMode && <span className="app-header__user-icon" title={`現在 ${userCount} 人が接続中`}></span>}
              <span>{currentAuthorInfo?.displayName || realName}</span>
              {!isPlaybackMode && <ConnectionStatus state={connectionState} userName={currentAuthorInfo?.displayName || ''} colorIndex={myColorIndex} />}
            </span>
          </div>
        </div>
      </header>

      <main className={`app-main ${dominantClass}`} style={{ position: 'relative' }}>
        <div className="split-view-shell">
          <SplitView
            ratio={ratio}
            onHandleMouseDown={handleMouseDown}
            onHandleDoubleClick={handleRatioDoubleClick}
            containerRef={containerRef}
            isPlaybackActive={isPlaybackMode}
            isDragging={isDragging}
            docPanel={
              <DocPanel
                nodes={docNodes}
                doc={doc}
                currentAuthorInfo={currentAuthorInfo || { displayName: '', realName: '', userId: '' }}
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
                isCautiousMode={isCautiousMode}
              />
            }
            chatPanel={
              <ChatPanel
                nodes={chatNodes}
                doc={doc}
                userName={currentAuthorInfo?.displayName || ''}
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
            myColorIndex={myColorIndex}
            onSelectRatio={(newRatio) => {
              console.log("[App] onSelectRatio called with newRatio:", newRatio);
              setRatio(newRatio);
            }}
          />
          <div className="split-view__footer">
            <ChatInput
              doc={doc}
              currentAuthorInfo={currentAuthorInfo || { displayName: '', realName: '', userId: '' }}
              handleNameOptions={handleNameOptions}
              onHandleNameChange={setCurrentAuthorInfo}
              onAfterSend={handleAfterEdit}
              isPlaybackActive={isPlaybackMode}
              useCtrlEnter={useCtrlEnter}
            />
          </div>
        </div>
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
          onTogglePlay={togglePlay}
          onScrub={handleScrub}
          onExit={exitPlayback}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  const [isAdminPanel, setIsAdminPanel] = useState(() => {
    const h = window.location.hash;
    return h === '#admin' || h === '#/admin';
  });

  const [roomState, setRoomState] = useState<{
    loading: boolean;
    error: string | null;
    verifiedDocId: string | null;
    isAdmin: boolean;
    title: string;
  }>({
    loading: true,
    error: null,
    verifiedDocId: null,
    isAdmin: false,
    title: 'Chatment',
  });

  const verifyRoom = useCallback(async (targetDocId: string) => {
    try {
      setRoomState(prev => ({ ...prev, loading: true, error: null }));
      
      const res = await fetch(`/api/rooms/${targetDocId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('指定されたルームが存在しないか、アクセスできません。');
        }
        throw new Error('ルームの接続確認に失敗しました。');
      }
      const room = await res.json();
      
      // Check closed/hidden status
      const searchParams = new URLSearchParams(window.location.search);
      const isAdminParam = searchParams.get('admin') === 'true';
      
      if (room.status !== 'open' && !isAdminParam) {
        throw new Error('このルームは終了しているか、アクセスできません。');
      }
      
      setRoomState({
        loading: false,
        error: null,
        verifiedDocId: targetDocId,
        isAdmin: isAdminParam,
        title: room.title || 'Chatment',
      });
    } catch (err: any) {
      setRoomState({
        loading: false,
        error: err.message || 'エラーが発生しました。',
        verifiedDocId: null,
        isAdmin: false,
        title: 'Chatment',
      });
    }
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash;
      setIsAdminPanel(h === '#admin' || h === '#/admin');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (isAdminPanel) return;
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!hash) {
      // ハッシュが空＝ルームIDなし → エラー
      setRoomState({ loading: false, error: 'ルームURLが指定されていません。管理者からルームのURLを受け取ってください。', verifiedDocId: null, isAdmin: false, title: 'Chatment' });
      return;
    }
    verifyRoom(hash);
  }, [isAdminPanel, verifyRoom, window.location.hash, window.location.search]);

  if (isAdminPanel) {
    return <AdminPanel />;
  }

  if (roomState.loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>ルームを確認中...</p>
      </div>
    );
  }

  if (roomState.error) {
    return (
      <div className="loading-screen" style={{ gap: '24px', padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2 style={{ color: 'var(--text-primary)' }}>アクセスできません</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.6' }}>{roomState.error}</p>
      </div>
    );
  }

  if (roomState.verifiedDocId) {
    return (
      <CautiousConfirmProvider>
        <ChatWorkspace docId={roomState.verifiedDocId} isAdmin={roomState.isAdmin} roomTitle={roomState.title} />
      </CautiousConfirmProvider>
    );
  }

  return null;
};
