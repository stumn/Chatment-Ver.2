import React from 'react';

interface TelomereProps {
  ratioArray: { id: string; ratio: number; docId: string }[];
  myRatio: number;
  myId: string | null;
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

const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

// 初心者向けアプリに適合する、調和の取れた上品なパステルカラーパレット
const PALETTE = [
  '#3b82f6', // ソフトブルー
  '#a78bfa', // パステルパープル
  '#10b981', // エメラルド
  '#f59e0b', // ソフトアンバー
  '#ec4899', // 優しいピンク
  '#14b8a6', // ターコイズ
  '#f97316', // ソフトオレンジ
];

const getPaletteColor = (str: string) => {
  const hash = getHash(str);
  return PALETTE[hash % PALETTE.length];
};

export const Telomere: React.FC<TelomereProps> = ({ ratioArray, myRatio, myId, onSelectRatio }) => {
  const inputOffset = 78; // チャット入力エリアの概算高さ

  // 自分のIDと他人のIDの重複を防ぎリスト化
  const myEffectiveId = myId || 'me';
  const othersList = ratioArray.filter(item => item.id !== myId && item.id !== 'me');

  const allUsers = [
    ...othersList.map(item => ({ id: item.id, ratio: item.ratio, isMe: false, color: getPaletteColor(item.id) })),
    { id: myEffectiveId, ratio: myRatio, isMe: true, color: getPaletteColor(myEffectiveId) }
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
