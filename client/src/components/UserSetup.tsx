import React, { useState } from 'react';
import { loadUserName, saveUserName } from '../loro/local-storage';

interface UserSetupProps {
  onComplete: (name: string) => void;
}

export const UserSetup: React.FC<UserSetupProps> = ({ onComplete }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveUserName(trimmed);
    onComplete(trimmed);
  };

  // Check if already saved
  React.useEffect(() => {
    const saved = loadUserName();
    if (saved) {
      onComplete(saved);
    }
  }, [onComplete]);

  return (
    <div className="user-setup-overlay" id="user-setup">
      <div className="user-setup-modal">
        <div className="user-setup-icon">💬</div>
        <h1 className="user-setup-title">Chatment ver.2</h1>
        <p className="user-setup-subtitle">
          直列結合による没入型共創プラットフォーム
        </p>
        <form onSubmit={handleSubmit} className="user-setup-form">
          <input
            id="username-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ユーザー名を入力..."
            className="user-setup-input"
            autoFocus
            maxLength={20}
          />
          <button
            type="submit"
            className="user-setup-button"
            disabled={!name.trim()}
            id="username-submit"
          >
            はじめる
          </button>
        </form>
      </div>
    </div>
  );
};
