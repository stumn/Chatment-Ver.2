import { useState, useEffect, useRef, useCallback } from 'react';
import { LoroDoc } from 'loro-crdt';
import { createDoc, getAllNodes } from '../loro/schema';
import { initUndoManager, setupUndoKeyBindings, destroyUndoManager, getUndoManager, undo as loroUndo, redo as loroRedo } from '../loro/undo-manager';
import { loadSnapshot, saveSnapshot, createAutoSave, loadUserColorIndex, saveUserColorIndex } from '../loro/local-storage';
import { initSyncClient, sendUpdate, getSocketId, login, type ConnectionState } from '../loro/sync-client';
import type { StreamNodeWithIndex } from '../types';

const getDocIdFromHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash || 'default';
};
export function useLoroDoc(userName: string | null, docId: string, isAdmin?: boolean) {
  const docRef = useRef<LoroDoc | null>(null);
  const [nodes, setNodes] = useState<StreamNodeWithIndex[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [userCount, setUserCount] = useState<number>(0);
  const [ratios, setRatios] = useState<{ id: string; ratio: number; docId: string; userName?: string; colorIndex?: number }[]>([]);
  const [ratioBands, setRatioBands] = useState<number[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasReceivedServerSnapshot, setHasReceivedServerSnapshot] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof createAutoSave> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [myColorIndex, setMyColorIndex] = useState<number | undefined>(undefined);
  const updateUndoRedoStatus = useCallback(() => {
    const um = getUndoManager();
    if (um) {
      setCanUndo(um.canUndo());
      setCanRedo(um.canRedo());
    }
  }, []);

  const refreshNodes = useCallback(() => {
    if (!docRef.current) return;
    const allNodes = getAllNodes(docRef.current);
    setNodes(allNodes);
  }, []);

  const triggerSave = useCallback(() => {
    if (!docRef.current) return;
    const snapshot = docRef.current.export({ mode: 'snapshot' });
    autoSaveRef.current?.(snapshot);
    sendUpdate(docRef.current, docId);
  }, [docId]);

  useEffect(() => {
    // 1. Create LoroDoc
    const doc = createDoc();
    docRef.current = doc;
    setHasReceivedServerSnapshot(false);

    // 2. Load from LocalStorage
    const saved = loadSnapshot(docId);
    if (saved) {
      try {
        doc.import(saved);
        console.log(`[App] Restored from LocalStorage (docId: ${docId})`);
      } catch (err) {
        console.warn(`[App] Failed to restore from LocalStorage (docId: ${docId}):`, err);
      }
    }

    // 3. Init UndoManager
    initUndoManager(doc);
    const cleanupKeys = setupUndoKeyBindings();

    // 4. Auto-save
    autoSaveRef.current = createAutoSave(docId, 500);

    // 5. Subscribe to changes
    const unsubscribe = doc.subscribe((event) => {
      refreshNodes();
      updateUndoRedoStatus();
      // Auto-save and broadcast local edits (like typing, D&D, or Undo/Redo)
      // Do not save when the document is in a detached / historical state
      if (event.by === 'local' && !doc.isDetached()) {
        triggerSave();
      }
    });
    const cleanupSync = initSyncClient({
      doc,
      docId,
      isAdmin,
      onRemoteUpdate: () => {
        refreshNodes();
      },
      onSnapshotReceived: () => setHasReceivedServerSnapshot(true),
      onConnectionChange: (state) => {
        setConnectionState(state);
        if (state === 'connected' && userName) {
          const saved = loadUserColorIndex(userName);
          const attribute = localStorage.getItem('compact-chatment-user-attribute') ?? '';
          const ageGroup = localStorage.getItem('compact-chatment-user-age') ?? '';
          login(userName, saved ?? undefined, attribute, ageGroup);
        }
      },
      onUserCountChange: setUserCount,
      onRatioChange: (ratioArray) => {
        const myId = getSocketId();
        const othersRatios = ratioArray.filter(r => r.id !== myId);
        setRatios(othersRatios);

        const myItem = ratioArray.find(r => r.id === myId);
        if (myItem && myItem.colorIndex !== undefined) {
          setMyColorIndex(myItem.colorIndex);
        }
      },
      onRatioBandsChange: (bands) => {
        setRatioBands(bands);
      },
      onLoginAck: (ack) => {
        if (userName === ack.userName) {
          setMyColorIndex(ack.colorIndex);
          saveUserColorIndex(ack.userName, ack.colorIndex);
        }
      }
    });

    // 7. Initial render
    refreshNodes();
    updateUndoRedoStatus();
    setIsReady(true);
    return () => {
      cleanupKeys();
      cleanupSync();
      unsubscribe();
      destroyUndoManager();
      docRef.current = null;
      setIsReady(false);
      setUserCount(0);
    };
  }, [refreshNodes, docId, userName, isAdmin]);

  return {
    doc: docRef.current,
    nodes,
    connectionState,
    userCount,
    isReady,
    hasReceivedServerSnapshot,
    refreshNodes,
    triggerSave,
    docId,
    ratios,
    ratioBands,
    canUndo,
    canRedo,
    myColorIndex,
    undo: useCallback(() => {
      const success = loroUndo();
      updateUndoRedoStatus();
      return success;
    }, [updateUndoRedoStatus]),
    redo: useCallback(() => {
      const success = loroRedo();
      updateUndoRedoStatus();
      return success;
    }, [updateUndoRedoStatus]),
  };
}
