import React, { useRef, useCallback } from 'react';
import { getRatioColorStyle, formatRatioLabel } from '../utils/splitColor';
import { emitUserAction } from '../loro/sync-client';

export interface TelomereProps {
  ratios?: { id: string; ratio: number }[];
  myRatio: number;
  onSelectRatio: (ratio: number) => void;
  isDragging?: boolean;
}

// 調整可能な定数 (丸の基本サイズを元に戻して視認性を確保)
export const TELOMERE_CONFIG = {
  NUM_BANDS: 16,
  R_MY: 9,                // 自分の丸の外枠半径 (px, 外枠直径 18px, 内側丸直径 12px)
  R_MIN: 9,               // 集約丸の最小半径 (px, 直径 18px)
  R_MAX: 20,              // 集約丸の最大半径 (px, 直径 40px)
  K: 2.2,                 // 半径増加係数: r = min(R_MAX, R_MIN + K * sqrt(n))
  SHOW_NUMBER_R_MIN: 11,  // 人数の数字を表示する最小半径 (px)
};

export const Telomere: React.FC<TelomereProps> = ({
  ratios = [],
  myRatio,
  onSelectRatio,
  isDragging = false,
}) => {
  const lastHoverTypeRef = useRef<string | null>(null);
  const hoverThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ホバー評価ログ送信 (過剰送信防止のスロットル付き)
  const handleHoverLog = useCallback((targetType: 'me' | 'other' | 'cluster', count?: number, t?: number) => {
    const key = `${targetType}-${count ?? 1}-${t?.toFixed(2) ?? ''}`;
    if (lastHoverTypeRef.current === key) return;
    lastHoverTypeRef.current = key;

    if (!hoverThrottleRef.current) {
      hoverThrottleRef.current = setTimeout(() => {
        hoverThrottleRef.current = null;
      }, 500);

      emitUserAction({
        type: 'split-hover',
        actionDetails: `仕切り丸ホバー (${targetType})`,
        contentPreview: targetType === 'me'
          ? '自分の丸'
          : targetType === 'cluster'
            ? `集約丸 (${count}人)`
            : 'ほかの参加者の丸',
        before: t !== undefined ? Number(t.toFixed(3)) : undefined,
      });
    }
  }, []);

  const { NUM_BANDS, R_MY, R_MIN, R_MAX, K } = TELOMERE_CONFIG;

  const clampedMyRatio = Math.max(0, Math.min(1, myRatio));
  const myBand = Math.min(NUM_BANDS - 1, Math.max(0, Math.floor(clampedMyRatio * NUM_BANDS)));
  // サーバーから受け取った「他の参加者」の位置だけを集計する。
  // 自分の位置はローカルの myRatio を使い、サーバー集計とは混ぜない。
  const bandsData = [];
  for (let i = 0; i < NUM_BANDS; i++) {
    const otherCount = ratios.filter(({ ratio }) => {
      const clamped = Math.max(0, Math.min(1, ratio));
      return Math.min(NUM_BANDS - 1, Math.floor(clamped * NUM_BANDS)) === i;
    }).length;
    const count = otherCount + (i === myBand ? 1 : 0);
    if (count > 0 && (i !== myBand || otherCount > 0)) {
      const centerT = (i + 0.5) / NUM_BANDS;
      bandsData.push({
        bandIndex: i,
        count,
        centerT,
      });
    }
  }

  // 自分の丸のラベル
  const myLabel = `あなた (${formatRatioLabel(clampedMyRatio)})`;

  return (
    <div className="telomere-container" aria-label="参加者の仕切り位置インジケーター">
      {/* ─── 他の参加者の丸（帯ごと） ─── */}
      {bandsData.map(({ bandIndex, count, centerT }) => {
        const topPosition = `calc(${centerT * 100}%)`;
        const colorStyle = getRatioColorStyle(centerT);
        if (count === 1) {
          const tooltip = `この付近 1人 (${formatRatioLabel(centerT, true)}) - クリックで位置同期`;
          return (
            <div
              key={`band-${bandIndex}`}
              className="telomere-band-cluster"
              style={{ top: topPosition }}
              title={tooltip}
              onClick={(e) => {
                e.stopPropagation();
                onSelectRatio(centerT);
              }}
              onMouseEnter={() => handleHoverLog('other', count, centerT)}
            >
              <div className="telomere-other-dot" style={colorStyle} />
            </div>
          );
        }

        const radius = Math.min(R_MAX, Math.round(R_MIN + K * Math.sqrt(Math.max(0, count - 1))));
        const displayCount = count > 99 ? '99+' : String(count);
        const isMyBand = bandIndex === myBand;
        const tooltip = isMyBand
          ? `この付近 ${count}人 (あなたを含む) (${formatRatioLabel(centerT, true)}) - クリックで位置同期`
          : `この付近 ${count}人 (${formatRatioLabel(centerT, true)}) - クリックで位置同期`;

        return (
          <div
            key={`band-${bandIndex}`}
            className={`telomere-band-cluster ${isMyBand ? 'has-me' : ''}`}
            style={{
              top: topPosition,
            }}
            title={tooltip}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRatio(centerT);
            }}
            onMouseEnter={() => handleHoverLog(isMyBand ? 'me' : 'other', count, centerT)}
          >
          <div
            className={`telomere-cluster-dot ${isMyBand ? 'has-me' : ''}`}
            style={{
              ...colorStyle,
              width: `${radius * 2}px`,
              height: `${radius * 2}px`,
            }}
          >
            <span className="telomere-cluster-count">{displayCount}</span>
          </div>
          </div>
        );
      })}

      {/* ─── 自分の丸 (最前面・二重丸・即時追従) ─── */}
      {/* 自分が単独の帯にいる時、またはドラッグ中は手元ピンを表示 */}
      {(!(bandsData.some(({ bandIndex, count }) => bandIndex === myBand && count >= 2)) || isDragging) && (
        <div
          className={`telomere-my-pin ${isDragging ? 'is-dragging' : ''}`}
          style={{
            top: `calc(${clampedMyRatio * 100}%)`,
          }}
          title={myLabel}
          onMouseEnter={() => handleHoverLog('me', 1, clampedMyRatio)}
        >
          <div
            className="telomere-my-outer-ring"
            style={{
              width: `${R_MY * 2}px`,
              height: `${R_MY * 2}px`,
            }}
          >
            <div
              className="telomere-my-inner-dot"
              style={getRatioColorStyle(clampedMyRatio)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
