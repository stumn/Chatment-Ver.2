import React from 'react';
import type { ConnectionState } from '../loro/sync-client';

interface ConnectionStatusProps {
  state: ConnectionState;
}

const STATUS_CONFIG = {
  connected: { emoji: '🟢', label: 'Online', className: 'connected' },
  connecting: { emoji: '🟡', label: 'Connecting...', className: 'connecting' },
  disconnected: { emoji: '🔴', label: 'Offline', className: 'disconnected' },
} as const;

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state }) => {
  const config = STATUS_CONFIG[state];

  return (
    <div className={`connection-status connection-status--${config.className}`} id="connection-status">
      <span className="connection-status__dot">{config.emoji}</span>
      <span className="connection-status__label">{config.label}</span>
    </div>
  );
};
