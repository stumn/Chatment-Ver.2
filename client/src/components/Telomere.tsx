import React from 'react';
import { getUserColor } from '../loro/sync-client';

interface TelomereProps {
  ratioArray: { id: string; ratio: number; docId: string; userName?: string; colorIndex?: number }[];
  myRatio: number;
  myId: string | null;
  myColorIndex?: number;
  onSelectRatio: (ratio: number) => void;
}

interface TelomereUser {
  id: string;
  isMe: boolean;
  color: string;
}

interface TelomereGroup {
  ratio: number;
  users: TelomereUser[];
  isMe: boolean;
}

export const Telomere: React.FC<TelomereProps> = ({ ratioArray, myRatio, myId, myColorIndex, onSelectRatio }) => {
  // 自分のIDと他人のIDの重複を防ぎリスト化
  const myEffectiveId = myId || 'me';
  const othersList = ratioArray.filter(item => item.id !== myId && item.id !== 'me');

  const allUsers = [
    ...othersList.map(item => ({
      id: item.id,
      ratio: item.ratio,
      isMe: false,
      color: getUserColor(item.colorIndex, item.id)
    })),
    {
      id: myEffectiveId,
      ratio: myRatio,
      isMe: true,
      color: getUserColor(myColorIndex, myEffectiveId)
    }
  ];

  // 比率（ratio）が極めて近いユーザーをグループ化 (2%以内の差をグループにする)
  const groups: TelomereGroup[] = [];
  const tolerance = 0.02;

  allUsers.forEach(user => {
    const matchingGroup = groups.find(g => Math.abs(g.ratio - user.ratio) < tolerance);
    if (matchingGroup) {
      matchingGroup.users.push({ id: user.id, isMe: user.isMe, color: user.color });
      if (user.isMe) {
        matchingGroup.isMe = true;
        // 自分の比率をグループの代表比率にする
        matchingGroup.ratio = user.ratio;
      }
    } else {
      groups.push({
        ratio: user.ratio,
        users: [{ id: user.id, isMe: user.isMe, color: user.color }],
        isMe: user.isMe
      });
    }
  });

  return (
    <>
      {groups.map((group, index) => {
        const topPosition = `calc(${group.ratio * 100}%)`;
        const count = group.users.length;

        return (
          <div
            key={index}
            className={`telomere-group-bar ${group.isMe ? 'is-me' : ''} ${count > 1 ? 'is-shared' : ''}`}
            style={{
              top: topPosition,
            }}
            title={
              group.isMe
                ? (count > 1 ? `あなたと他の ${count - 1} 人が同じ仕切り位置にいます` : "あなたの仕切り位置")
                : `${count} 人の仕切り位置がここに揃っています (クリックして同期)`
            }
            onClick={(e) => {
              e.stopPropagation();
              onSelectRatio(group.ratio);
            }}
          >
            <div className="telomere-group-bar__dots">
              {group.users.map((user) => (
                <span
                  key={user.id}
                  className={`telomere-user-dot ${user.isMe ? 'is-me' : ''}`}
                  style={{ backgroundColor: user.color }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
};
