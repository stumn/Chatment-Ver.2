import React from 'react';

interface TelomereProps {
  ratioArray: { id: string; ratio: number; docId: string }[];
  myRatio: number;
  myId: string | null;
  onSelectRatio: (ratio: number) => void;
}

const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const getHashColor = (str: string) => {
  const hash = getHash(str);
  const h = hash % 360;
  return `hsl(${h}, 70%, 60%)`;
};

export const Telomere: React.FC<TelomereProps> = ({ ratioArray, myRatio, myId, onSelectRatio }) => {
  const inputOffset = 78; // Approximate height of the chat input area

  // 自分自身と他人の表示アイテムを合成 (キー重複を防ぐため、他人のリストから自身のIDを確実に除外)
  const myEffectiveId = myId || 'me';
  const othersList = ratioArray.filter(item => item.id !== myId && item.id !== 'me');

  const allItems = [
    ...othersList.map(item => ({ ...item, isMe: false })),
    { id: myEffectiveId, ratio: myRatio, docId: '', isMe: true }
  ];

  return (
    <>
      {allItems.map((item) => {
        // 滑らかな補間処理 (ratio 0.6 ~ 0.7 の間で 0 から inputOffset に滑らかに移行させる)
        let w = 0;
        if (item.ratio > 0.7) {
          w = 1;
        } else if (item.ratio > 0.6) {
          w = (item.ratio - 0.6) * 10;
        }
        const currentOffset = inputOffset * w;
        // 高さをスプリットハンドルの中心 (16px の半分である 8px) に合わせる補正
        const topPosition = `calc(${item.ratio * 100}% + ${currentOffset}px + 8px)`;
        const color = getHashColor(item.id);
        const hashVal = getHash(item.id);
        const rightOffset = `${8 + (hashVal % 3) * 16}px`;

        return (
          <div
            key={item.id}
            className={`telomere-divider-tag ${item.isMe ? 'telomere-divider-tag--me' : ''}`}
            style={{
              top: topPosition,
              right: rightOffset,
              '--user-color': color,
            } as React.CSSProperties}
            title={item.isMe ? "あなたの仕切り位置" : "他のユーザーの仕切り位置 (クリックでこの高さに揃える)"}
            onClick={(e) => {
              console.log("[Telomere] tag clicked, item:", item);
              e.stopPropagation();
              onSelectRatio(item.ratio);
            }}
          />
        );
      })}
    </>
  );
};



