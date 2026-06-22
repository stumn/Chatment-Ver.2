import { useState, useEffect, useRef, useCallback } from 'react';
import { LoroDoc } from 'loro-crdt';
import { createDoc, getAllNodes } from '../loro/schema';
import { initUndoManager, setupUndoKeyBindings, destroyUndoManager } from '../loro/undo-manager';
import { loadSnapshot, saveSnapshot, createAutoSave } from '../loro/local-storage';
import { initSyncClient, sendUpdate, getSocketId, type ConnectionState } from '../loro/sync-client';
import type { StreamNodeWithIndex } from '../types';

const getDocIdFromHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash || 'default';
};

export function useLoroDoc() {
  const [docId, setDocId] = useState(() => getDocIdFromHash());
  const docRef = useRef<LoroDoc | null>(null);
  const [nodes, setNodes] = useState<StreamNodeWithIndex[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [userCount, setUserCount] = useState<number>(0);
  const [ratios, setRatios] = useState<{ id: string; ratio: number; docId: string }[]>([]);
  const [isReady, setIsReady] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof createAutoSave> | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setDocId(getDocIdFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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
      // Auto-save and broadcast local edits (like typing, D&D, or Undo/Redo)
      // Do not save when the document is in a detached / historical state
      if (event.by === 'local' && !doc.isDetached()) {
        triggerSave();
      }
    });

    // 6. Init sync client
    const cleanupSync = initSyncClient({
      doc,
      docId,
      onRemoteUpdate: () => {
        refreshNodes();
      },
      onConnectionChange: setConnectionState,
      onUserCountChange: setUserCount,
      onRatioChange: (ratioArray) => {
        const myId = getSocketId();
        const othersRatios = ratioArray.filter(r => r.id !== myId);
        setRatios(othersRatios);
      }
    });

    // 7. Initial render
    refreshNodes();
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
  }, [refreshNodes, docId]);

  return {
    doc: docRef.current,
    nodes,
    connectionState,
    userCount,
    isReady,
    refreshNodes,
    triggerSave,
    docId,
    ratios,
  };
}
