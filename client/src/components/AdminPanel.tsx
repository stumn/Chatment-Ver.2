import React, { useState, useEffect } from 'react';
import '../../styles/admin.css';

interface Room {
  _id: string;
  docId: string;
  title: string;
  status: 'open' | 'closed' | 'hidden';
  userIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const AdminPanel: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHiddenExpanded, setIsHiddenExpanded] = useState(false);

  // 新規作成ダイアログ用
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('ルーム一覧の取得に失敗しました。');
      const data = await res.json();
      setRooms(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreateRoom = async () => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error('ルームの作成に失敗しました。');
      const newRoom = await res.json();
      setRooms(prev => [newRoom, ...prev]);
      setNewTitle('');
      setIsCreating(false);
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  const handleUpdateStatus = async (roomId: string, newStatus: 'open' | 'closed' | 'hidden') => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('ステータスの更新に失敗しました。');
      const updated = await res.json();
      setRooms(prev => prev.map(r => r.docId === roomId ? updated : r));
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  const openRooms = rooms.filter(r => r.status === 'open');
  const closedRooms = rooms.filter(r => r.status === 'closed');
  const hiddenRooms = rooms.filter(r => r.status === 'hidden');

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const RoomRow = ({ room, statusBadge, actions }: { room: Room; statusBadge: React.ReactNode; actions: React.ReactNode }) => (
    <tr key={room.docId}>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{room.title || <em style={{ color: 'var(--text-muted)' }}>タイトルなし</em>}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{room.docId}</span>
        </div>
      </td>
      <td>{statusBadge}</td>
      <td>{room.userIds?.length || 0}人</td>
      <td>{formatDate(room.updatedAt)}</td>
      <td><div className="action-buttons">{actions}</div></td>
    </tr>
  );

  return (
    <div className="admin-layout">
      <div className="admin-container">
        <div className="admin-header">
          <div className="admin-title-group">
            <h1 className="admin-title">Chatment 管理画面</h1>
          </div>
          <div className="admin-actions">
            <button className="btn-primary" onClick={() => setIsCreating(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              新規ルーム作成
            </button>
          </div>
        </div>

        {/* 新規作成ダイアログ */}
        {isCreating && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>新規ルーム作成</h3>
            <div>
              <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                ルームタイトル
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="例: 2024年度 後期ゼミ"
                maxLength={60}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); if (e.key === 'Escape') setIsCreating(false); }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-base)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setIsCreating(false); setNewTitle(''); }}>キャンセル</button>
              <button className="btn-primary" onClick={handleCreateRoom}>作成する</button>
            </div>
          </div>
        )}

        {error && <div style={{ color: '#ef4444', padding: '16px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>{error}</div>}

        {isLoading ? (
          <div className="empty-state">読み込み中...</div>
        ) : (
          <>
            {/* 稼働中 (open) リスト */}
            <div className="admin-section">
              <h2 className="section-title">
                稼働中ルーム (open)
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>({openRooms.length}件)</span>
              </h2>
              {openRooms.length === 0 ? (
                <div className="empty-state">稼働中のルームはありません。</div>
              ) : (
                <div className="rooms-table-wrapper">
                  <table className="rooms-table">
                    <thead>
                      <tr>
                        <th>タイトル / ルームID</th>
                        <th>ステータス</th>
                        <th>参加ユーザー数</th>
                        <th>最終更新日時</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openRooms.map(room => (
                        <RoomRow
                          key={room.docId}
                          room={room}
                          statusBadge={
                            <>
                              <span className="status-badge status-badge--open">稼働中</span>
                              <a href={`#${room.docId}`} className="room-link" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', fontSize: 'var(--font-size-xs)' }}>
                                入室
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style={{ marginLeft: '2px' }}>
                                  <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                                </svg>
                              </a>
                            </>
                          }
                          actions={
                            <button className="btn-action" onClick={() => handleUpdateStatus(room.docId, 'closed')}>
                              終了する
                            </button>
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 終了 (closed) リスト */}
            <div className="admin-section">
              <h2 className="section-title">
                終了したルーム (closed)
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>({closedRooms.length}件)</span>
              </h2>
              {closedRooms.length === 0 ? (
                <div className="empty-state">終了したルームはありません。</div>
              ) : (
                <div className="rooms-table-wrapper">
                  <table className="rooms-table">
                    <thead>
                      <tr>
                        <th>タイトル / ルームID</th>
                        <th>ステータス</th>
                        <th>参加ユーザー数</th>
                        <th>最終更新日時</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedRooms.map(room => (
                        <RoomRow
                          key={room.docId}
                          room={room}
                          statusBadge={
                            <>
                              <span className="status-badge status-badge--closed">終了</span>
                              <a href={`#${room.docId}?admin=true`} className="room-link" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', fontSize: 'var(--font-size-xs)' }}>
                                プレビュー
                              </a>
                            </>
                          }
                          actions={
                            <>
                              <button className="btn-action btn-action--primary" onClick={() => handleUpdateStatus(room.docId, 'open')}>
                                再稼働 (open)
                              </button>
                              <button className="btn-action" onClick={() => handleUpdateStatus(room.docId, 'hidden')}>
                                非表示 (hidden)
                              </button>
                            </>
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 非表示 (hidden) リスト (アコーディオン) */}
            <div className="accordion">
              <div className="accordion-header" onClick={() => setIsHiddenExpanded(!isHiddenExpanded)}>
                <span>非表示のルーム (hidden) ({hiddenRooms.length}件)</span>
                <svg
                  className={`accordion-icon ${isHiddenExpanded ? 'accordion-icon--open' : ''}`}
                  viewBox="0 0 24 24" width="18" height="18" fill="currentColor"
                >
                  <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                </svg>
              </div>

              {isHiddenExpanded && (
                <div className="accordion-content">
                  {hiddenRooms.length === 0 ? (
                    <div className="empty-state">非表示のルームはありません。</div>
                  ) : (
                    <div className="rooms-table-wrapper">
                      <table className="rooms-table">
                        <thead>
                          <tr>
                            <th>タイトル / ルームID</th>
                            <th>ステータス</th>
                            <th>参加ユーザー数</th>
                            <th>最終更新日時</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hiddenRooms.map(room => (
                            <RoomRow
                              key={room.docId}
                              room={room}
                              statusBadge={
                                <>
                                  <span className="status-badge status-badge--hidden">非表示</span>
                                  <a href={`#${room.docId}?admin=true`} className="room-link" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', fontSize: 'var(--font-size-xs)' }}>
                                    プレビュー
                                  </a>
                                </>
                              }
                              actions={
                                <button className="btn-action" onClick={() => handleUpdateStatus(room.docId, 'closed')}>
                                  復活させる (closedに戻す)
                                </button>
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
