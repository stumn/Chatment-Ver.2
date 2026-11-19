import React, { useState, useEffect } from 'react';
import { loadUserName, saveUserName } from '../loro/local-storage';

interface UserSetupProps {
  docId: string;
  onComplete: (name: string, attribute: string, age: string) => void;
}

/** 属性と年代の組み合わせで生成される登録禁止名のセット */
const ATTRIBUTES = ['学部生', '院生', '教員', 'その他'];
const AGES = ['10代', '20代', '30代', '40代', '50代', '60代以上'];

const BLOCKED_NAMES = new Set<string>();
for (const age of AGES) {
  for (const attr of ATTRIBUTES) {
    BLOCKED_NAMES.add(`${age}${attr}`);
  }
}

export const UserSetup: React.FC<UserSetupProps> = ({ docId, onComplete }) => {
  const [name, setName] = useState('');
  const [attribute, setAttribute] = useState('学部生');
  const [age, setAge] = useState('20s');
  const [nameError, setNameError] = useState('');
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [showNameConfirmation, setShowNameConfirmation] = useState(false);
  const usernameInputRef = React.useRef<HTMLInputElement>(null);

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

  const validateName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    // 半角スペース・全角スペース・タブなどを除去してから禁止名と照合
    const normalized = trimmed.replace(/[\s　\t]/g, '');
    if (normalized.includes('匿名')) {
      return '「匿名」を含むニックネームは使用できません。別の名前を入力してください。';
    }
    if (BLOCKED_NAMES.has(normalized)) {
      return `「${normalized}」はシステムが生成するハンドルネームと重複するため使用できません。別の名前を入力してください。`;
    }
    return '';
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateName(value));
  };

  const completeLogin = (trimmed: string) => {
    saveUserName(trimmed);
    localStorage.setItem('compact-chatment-user-attribute', attribute);
    localStorage.setItem('compact-chatment-user-age', age);
    try {
      localStorage.setItem(`chatment-room-name-${docId}`, trimmed);
    } catch { }
    onComplete(trimmed, attribute, age);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const error = validateName(trimmed);
    if (error) {
      setNameError(error);
      return;
    }

    setIsCheckingName(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`/api/rooms/${docId}`, { signal: controller.signal });
        if (response.ok) {
          const room = await response.json() as { userIds?: unknown };
          if (Array.isArray(room.userIds) && room.userIds.every((id): id is string => typeof id === 'string')) {
            let confirmedName = false;
            try {
              confirmedName = localStorage.getItem(`chatment-room-name-${docId}`) === trimmed;
            } catch { }
            if (room.userIds.includes(trimmed) && !confirmedName) {
              setShowNameConfirmation(true);
              return;
            }
          }
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    } catch { }
    setIsCheckingName(false);
    completeLogin(trimmed);
  };

  const handleConfirmSamePerson = () => {
    setShowNameConfirmation(false);
    setIsCheckingName(false);
    completeLogin(name.trim());
  };

  const handleChooseAnotherName = () => {
    setShowNameConfirmation(false);
    setNameError('その名前はこのルームで使われています。別の名前を入力してください。');
    requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
      usernameInputRef.current?.select();
    });
  };

  return (
    <div className="user-setup-overlay" id="user-setup">
      <div className="user-setup-modal user-setup-modal--login">
        {showNameConfirmation ? (
          <>
            <h2 className="user-login-title">「{name.trim()}」さんは、このルームにすでにいます</h2>
            <p>同じ人（別の端末や別のタブで入り直した場合など）なら、そのまま続けられます。</p>
            <div className="user-login-actions">
              <button type="button" className="user-login-submit" onClick={handleConfirmSamePerson}>
                同じ人です（続ける）
              </button>
              <button type="button" className="user-login-submit" onClick={handleChooseAnotherName}>
                別の人です（名前を変える）
              </button>
            </div>
          </>
        ) : (
        <>
          <h2 className="user-login-title">ログイン</h2>
          <form onSubmit={handleSubmit} className="user-setup-form">
          <div className="user-login-field">
            <label htmlFor="username-input" className="user-login-label user-login-label--required">
              ニックネーム
            </label>
            <input
              id="username-input"
              ref={usernameInputRef}
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="ニックネームを入力..."
              className={`user-login-input${nameError ? ' user-login-input--error' : ''}`}
              autoFocus
              maxLength={20}
              required
            />
            {nameError && (
              <p className="user-login-error">{nameError}</p>
            )}
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
              disabled={isCheckingName || !name.trim() || !!nameError}
              id="username-submit"
            >
              {isCheckingName ? '確認中…' : 'ログインする'}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
};
