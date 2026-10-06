// ─── 比率連動カラーおよびラベルユーティリティ ───
// 配色方針: 暖(やわらかい橙 #e8793a) ← 中灰(#6b7280: 対比2.5以上) → 青(#3b82f6)
// t=0 (チャット全開): 青 #3b82f6
// t=0.5 (中間): 中灰 #6b7280 (背景に負けず「どちらでもない」に見える)
// t=1 (ドキュメント全開): やわらかい橙 #e8793a

export const COLOR_TABLE_FALLBACK: [number, string][] = [
  [0.0, '#3b82f6'],
  [0.1, '#457fe1'],
  [0.2, '#4e7ccc'],
  [0.3, '#5879b8'],
  [0.4, '#6175a4'],
  [0.5, '#6b7280'], // 中灰 (中間)
  [0.6, '#847372'],
  [0.7, '#9d7564'],
  [0.8, '#b67656'],
  [0.9, '#cf7848'],
  [1.0, '#e8793a'], // やわらかい橙
];

/**
 * 16進数カラーコードをRGBオブジェクトに変換
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * RGBから16進数カラーコードに変換
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * テーブル補間によるフォールバックHEXカラーの取得
 */
export function getFallbackColorAtRatio(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < COLOR_TABLE_FALLBACK.length - 1; i++) {
    const [t1, c1] = COLOR_TABLE_FALLBACK[i];
    const [t2, c2] = COLOR_TABLE_FALLBACK[i + 1];
    if (clamped >= t1 && clamped <= t2) {
      const factor = (clamped - t1) / (t2 - t1);
      const rgb1 = hexToRgb(c1);
      const rgb2 = hexToRgb(c2);
      const r = rgb1.r + (rgb2.r - rgb1.r) * factor;
      const g = rgb1.g + (rgb2.g - rgb1.g) * factor;
      const b = rgb1.b + (rgb2.b - rgb1.b) * factor;
      return rgbToHex(r, g, b);
    }
  }
  return COLOR_TABLE_FALLBACK[COLOR_TABLE_FALLBACK.length - 1][1];
}

/**
 * 比率 t に応じた CSS color-mix 式、およびフォールバック HEX を含むスタイルオブジェクトを生成
 * t <= 0.5: 青(#3b82f6) 〜 中灰(#6b7280)
 * t > 0.5 : 中灰(#6b7280) 〜 やわらかい橙(#e8793a)
 */
export function getRatioColorStyle(t: number): React.CSSProperties {
  const clamped = Math.max(0, Math.min(1, t));
  const fallback = getFallbackColorAtRatio(clamped);

  let cssColorMix: string;
  if (clamped <= 0.5) {
    const bluePct = Math.round((1 - clamped * 2) * 100);
    cssColorMix = `color-mix(in oklch, #3b82f6 ${bluePct}%, #6b7280)`;
  } else {
    const grayPct = Math.round((1 - (clamped - 0.5) * 2) * 100);
    cssColorMix = `color-mix(in oklch, #6b7280 ${grayPct}%, #e8793a)`;
  }

  return {
    backgroundColor: fallback,
    background: cssColorMix,
    // @ts-ignore custom property
    '--split-t': `${clamped}`,
  };
}

/**
 * 比率 t からのテキスト説明を生成（例: チャット寄り 70%）
 */
export function formatRatioLabel(t: number, isApproximate = false): string {
  const clamped = Math.max(0, Math.min(1, t));
  const approxText = isApproximate ? '付近' : '';
  if (Math.abs(clamped - 0.5) < 0.03) {
    return `中間 50%${approxText}`;
  } else if (clamped < 0.5) {
    const pct = Math.round((1 - clamped) * 100);
    return `チャット寄り ${pct}%${approxText}`;
  } else {
    const pct = Math.round(clamped * 100);
    return `ドキュメント寄り ${pct}%${approxText}`;
  }
}
