import React from 'react';
import { getSocketId, type ConnectionState } from '../loro/sync-client';

interface ConnectionStatusProps {
  state: ConnectionState;
  userName: string;
}

const STATUS_CONFIG = {
  connected: { className: 'connected' },
  connecting: { className: 'connecting' },
  disconnected: { className: 'disconnected' },
} as const;

const getHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const PALETTE = ['#3b82f6', '#a78bfa', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

const getPaletteColor = (value: string) => PALETTE[getHash(value) % PALETTE.length];

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state, userName }) => {
  const config = STATUS_CONFIG[state];
  const colorSeed = getSocketId() || userName;
  const dotColor = state === 'connected'
    ? getPaletteColor(colorSeed)
    : state === 'connecting'
      ? '#f59e0b'
      : '#ef4444';

  return (
    <span className={`connection-status connection-status--${config.className}`} id="connection-status" title={state === 'connected' ? '接続中' : state === 'connecting' ? '接続確認中' : 'オフライン'}>
      <span className="connection-status__dot" style={{ backgroundColor: dotColor }} />
    </span>
  );
};
