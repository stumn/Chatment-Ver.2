import { useState, useEffect, useRef, useCallback } from 'react';
import { LoroDoc } from 'loro-crdt';
import { createDoc, getAllNodes } from '../loro/schema';
import { initUndoManager, setupUndoKeyBindings, destroyUndoManager } from '../loro/undo-manager';
import { loadSnapshot, saveSnapshot, createAutoSave } from '../loro/local-storage';
import { initSyncClient, sendUpdate, type ConnectionState } from '../loro/sync-client';
import type { StreamNodeWithIndex } from '../types';

const DOC_ID = 'default';

export function useLoroDoc() {
  const docRef = useRef<LoroDoc | null>(null);
  const [nodes, setNodes] = useState<StreamNodeWithIndex[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isReady, setIsReady] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof createAutoSave> | null>(null);

  const refreshNodes = useCallback(() => {
    if (!docRef.current) return;
    const allNodes = getAllNodes(docRef.current);
    setNodes(allNodes);
  }, []);

  const triggerSave = useCallback(() => {
    if (!docRef.current) return;
    const snapshot = docRef.current.export({ mode: 'snapshot' });
    autoSaveRef.current?.(snapshot);
    sendUpdate(docRef.current, DOC_ID);
  }, []);

  useEffect(() => {
    // 1. Create LoroDoc
    const doc = createDoc();
    docRef.current = doc;

    // 2. Load from LocalStorage
    const saved = loadSnapshot(DOC_ID);
    if (saved) {
      try {
        doc.import(saved);
        console.log('[App] Restored from LocalStorage');
      } catch (err) {
        console.warn('[App] Failed to restore from LocalStorage:', err);
      }
    }

    // 3. Init UndoManager
    initUndoManager(doc);
    const cleanupKeys = setupUndoKeyBindings();

    // 4. Auto-save
    autoSaveRef.current = createAutoSave(DOC_ID, 500);

    // 5. Subscribe to changes
    const unsubscribe = doc.subscribe((event) => {
      refreshNodes();
      // Auto-save and broadcast local edits (like typing, D&D, or Undo/Redo)
      if (event.by === 'local' || event.by === 'checkout') {
        triggerSave();
      }
    });

    // 6. Init sync client
    const cleanupSync = initSyncClient({
      doc,
      docId: DOC_ID,
      onRemoteUpdate: () => {
        refreshNodes();
      },
      onConnectionChange: setConnectionState,
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
    };
  }, [refreshNodes]);

  return {
    doc: docRef.current,
    nodes,
    connectionState,
    isReady,
    refreshNodes,
    triggerSave,
    docId: DOC_ID,
  };
}
