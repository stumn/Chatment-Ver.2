import React, { useState, useEffect } from 'react';
import { loadUserName, saveUserName } from '../loro/local-storage';

interface UserSetupProps {
  onComplete: (name: string) => void;
}

export const UserSetup: React.FC<UserSetupProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [attribute, setAttribute] = useState('学部生');
  const [age, setAge] = useState('20s');

  // Load saved data for autofill on mount
  useEffect(() => {
    const savedName = loadUserName();
    if (savedName) {
      setName(savedName);
    }
    const savedAttr = localStorage.getItem('compact-chatment-user-attribute');
    if (savedAttr) {
      setAttribute(savedAttr);
    }
    const savedAge = localStorage.getItem('compact-chatment-user-age');
    if (savedAge) {
      setAge(savedAge);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    // Save to localStorage
    saveUserName(trimmed);
    localStorage.setItem('compact-chatment-user-attribute', attribute);
    localStorage.setItem('compact-chatment-user-age', age);

    onComplete(trimmed);
  };

  return (
    <div className="user-setup-overlay" id="user-setup">
      <div className="user-setup-modal user-setup-modal--login">
        <h2 className="user-login-title">ログイン</h2>
        <form onSubmit={handleSubmit} className="user-setup-form">
          <div className="user-login-field">
            <label htmlFor="username-input" className="user-login-label user-login-label--required">
              ニックネーム
            </label>
            <input
              id="username-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ニックネームを入力..."
              className="user-login-input"
              autoFocus
              maxLength={20}
              required
            />
          </div>

          <div className="user-login-field">
            <label htmlFor="attribute-select" className="user-login-label user-login-label--required">
              属性
            </label>
            <div className="user-login-select-wrapper">
              <select
                id="attribute-select"
                value={attribute}
                onChange={(e) => setAttribute(e.target.value)}
                className="user-login-select"
              >
                <option value="学部生">学部生</option>
                <option value="院生">院生</option>
                <option value="教員">教員</option>
                <option value="その他">その他</option>
              </select>
            </div>
          </div>

          <div className="user-login-field">
            <label htmlFor="age-select" className="user-login-label user-login-label--required">
              年代
            </label>
            <div className="user-login-select-wrapper">
              <select
                id="age-select"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="user-login-select"
              >
                <option value="10s">10s</option>
                <option value="20s">20s</option>
                <option value="30s">30s</option>
                <option value="40s">40s</option>
                <option value="50s">50s</option>
                <option value="over60s">over60s</option>
              </select>
            </div>
          </div>

          <div className="user-login-actions">
            <button
              type="submit"
              className="user-login-submit"
              disabled={!name.trim()}
              id="username-submit"
            >
              ログインする
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
