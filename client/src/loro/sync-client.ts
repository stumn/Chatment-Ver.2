import { io, Socket } from 'socket.io-client';
import type { LoroDoc } from 'loro-crdt';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface SyncClientOptions {
  doc: LoroDoc;
  docId: string;
  onRemoteUpdate: () => void;
  onConnectionChange: (state: ConnectionState) => void;
  onUserCountChange?: (count: number) => void;
}

let socket: Socket | null = null;
let currentDocId: string | null = null;

/**
 * Initialize the sync client and connect to the server.
 */
export function initSyncClient(options: SyncClientOptions): () => void {
  const { doc, docId, onRemoteUpdate, onConnectionChange, onUserCountChange } = options;

  currentDocId = docId;
  onConnectionChange('connecting');

  socket = io({
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });

  socket.on('connect', () => {
    console.log('[Sync] Connected to server');
    onConnectionChange('connected');
    socket!.emit('join-doc', docId);
  });

  socket.on('sync-snapshot', (snapshotData: ArrayBuffer) => {
    try {
      doc.import(new Uint8Array(snapshotData));
      onRemoteUpdate();
      console.log('[Sync] Loaded server snapshot');
    } catch (err) {
      console.warn('[Sync] Failed to import server snapshot:', err);
    }
  });

  socket.on('receive-update', (updateData: ArrayBuffer) => {
    try {
      doc.import(new Uint8Array(updateData));
      onRemoteUpdate();
    } catch (err) {
      console.warn('[Sync] Failed to import remote update:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Sync] Disconnected from server');
    onConnectionChange('disconnected');
  });

  socket.on('connect_error', () => {
    onConnectionChange('disconnected');
  });

  socket.on('user-count', (count: number) => {
    onUserCountChange?.(count);
  });

  // Cleanup function
  return () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    currentDocId = null;
  };
}

/**
 * Send a local update to the server for broadcast.
 */
export function sendUpdate(doc: LoroDoc, docId: string): void {
  if (!socket || !socket.connected) return;

  try {
    const update = doc.export({ mode: 'update' });
    socket.emit('send-update', { docId, update });
  } catch (err) {
    console.warn('[Sync] Failed to send update:', err);
  }
}

/**
 * Get the current connection state.
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}
