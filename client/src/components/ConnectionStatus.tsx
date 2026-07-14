import React from 'react';
import { getSocketId, type ConnectionState, getUserColor } from '../loro/sync-client';

interface ConnectionStatusProps {
  state: ConnectionState;
  userName: string;
  colorIndex?: number;
}

const STATUS_CONFIG = {
  connected: { className: 'connected' },
  connecting: { className: 'connecting' },
  disconnected: { className: 'disconnected' },
} as const;

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state, userName, colorIndex }) => {
  const config = STATUS_CONFIG[state];
  // Telomereと同じseed（socket ID）を使って色を計算する（colorIndexが未設定の場合も一致させる）
  const colorSeed = getSocketId() ?? userName;
  const dotColor = state === 'connected'
    ? getUserColor(colorIndex, colorSeed)
    : state === 'connecting'
      ? '#f59e0b'
      : '#ef4444';

  return (
    <span className={`connection-status connection-status--${config.className}`} id="connection-status" title={state === 'connected' ? '接続中' : state === 'connecting' ? '接続確認中' : 'オフライン'}>
      <span className="connection-status__dot" style={{ backgroundColor: dotColor }} />
    </span>
  );
};
