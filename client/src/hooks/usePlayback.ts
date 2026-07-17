import { useState, useEffect, useCallback, useRef } from 'react';
import type { LoroDoc } from 'loro-crdt';
import type { StreamNodeWithIndex } from '../types';
import { emitUserAction } from '../loro/sync-client';

interface UsePlaybackProps {
  doc: LoroDoc | null;
  nodes: StreamNodeWithIndex[];
}

export function usePlayback({ doc, nodes }: UsePlaybackProps) {
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [playbackSteps, setPlaybackSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isAutoplay, setIsAutoplay] = useState(false);

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
    emitUserAction({ type: 'playback-start', actionDetails: 'これまでの流れを開始' });

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
    emitUserAction({ type: 'playback-exit', actionDetails: 'これまでの流れを終了' });
  }, [doc]);

  // Autoplay Effect
  useEffect(() => {
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
  useEffect(() => {
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

  const togglePlay = useCallback(() => {
    setIsAutoplay(prev => !prev);
  }, []);

  return {
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
  };
}
