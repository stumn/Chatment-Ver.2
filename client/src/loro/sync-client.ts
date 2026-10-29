import { io, Socket } from 'socket.io-client';
import type { LoroDoc } from 'loro-crdt';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';
interface SyncClientOptions {
  doc: LoroDoc;
  docId: string;
  isAdmin?: boolean;
  onRemoteUpdate: () => void;
  onSnapshotReceived?: () => void;
  onConnectionChange: (state: ConnectionState) => void;
  onUserCountChange?: (count: number) => void;
  onRatioChange?: (ratios: { id: string; ratio: number; docId: string; userName?: string; colorIndex?: number }[]) => void;
  onRatioBandsChange?: (bands: number[]) => void;
  onLoginAck?: (ack: { userName: string; colorIndex: number }) => void;
}
let socket: Socket | null = null;
let currentDocId: string | null = null;

/**
 * Initialize the sync client and connect to the server.
 */
export function initSyncClient(options: SyncClientOptions): () => void {
  const { doc, docId, onRemoteUpdate, onConnectionChange, onUserCountChange, onRatioChange } = options;

  currentDocId = docId;
  onConnectionChange('connecting');

  socket = io({
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });

  socket.on('connect', () => {
    console.log('[Sync] Connected to server');
    onConnectionChange('connected');
    socket!.emit('join-doc', { docId, isAdmin: !!options.isAdmin });
  });

  socket.on('sync-snapshot', (snapshotData: ArrayBuffer) => {
    try {
      doc.import(new Uint8Array(snapshotData));
      onRemoteUpdate();
      options.onSnapshotReceived?.();
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
  socket.on('ratioChange', (ratios: any[]) => {
    onRatioChange?.(ratios);
  });
  socket.on('ratioBands', (bands: number[]) => {
    options.onRatioBandsChange?.(bands);
  });

  socket.on('login-ack', (ack: { userName: string; colorIndex: number }) => {
    options.onLoginAck?.(ack);
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

/**
 * Send ratio updates to the server.
 */
export function emitRatioChange(ratio: number): void {
  if (socket && socket.connected) {
    socket.emit('ratioChange', ratio);
  }
}

/** ユーザー操作ログ（ビフォアアフター付き）の型 */
export interface UserActionPayload {
  type: string;
  targetId?: string;
  before?: any;
  after?: any;
  contentPreview?: string;
  actionDetails?: string;
}

/**
 * Send a user action log (with before/after) to the server for MongoDB storage.
 */
export function emitUserAction(payload: UserActionPayload): void {
  if (socket && socket.connected) {
    socket.emit('user-action', payload);
  }
}
export function getSocketId(): string | null {
  return socket?.id ?? null;
}
export function login(userName: string, colorIndex?: number, attribute?: string, ageGroup?: string): void {
  if (socket && socket.connected) {
    socket.emit('login', { userName, colorIndex, attribute, ageGroup });
  }
}

const PALETTE = [
  '#3b82f6', // 0: ソフトブルー
  '#a78bfa', // 1: パステルパープル
  '#10b981', // 2: エメラルド
  '#f59e0b', // 3: ソフトアンバー
  '#ec4899', // 4: 優しいピンク
  '#14b8a6', // 5: ターコイズ
  '#f97316', // 6: ソフトオレンジ
];

const COLOR_MAP = [0, 4, 2, 6, 1, 5, 3];

export function getUserColor(colorIndex: number | undefined, idOrName: string): string {
  if (colorIndex !== undefined && colorIndex >= 0) {
    return PALETTE[COLOR_MAP[colorIndex % COLOR_MAP.length]];
  }
  let hash = 0;
  for (let i = 0; i < idOrName.length; i += 1) {
    hash = (hash << 5) - hash + idOrName.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[COLOR_MAP[idx]];
}
