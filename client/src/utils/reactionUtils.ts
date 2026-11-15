import type { EmojiReactionSummary } from '../types';

export interface EmojiReactionListResult {
  visibleChips: EmojiReactionSummary[];
  remainingCount: number;
  totalReactionsCount: number;
}

export interface ReactionStats {
  up: number;
  down: number;
  emojiTotal: number;
  voteScore: number;
  attention: number;
}

export const REACTION_RATE = 0.35;
export const DEFAULT_EXPECTED_PARTICIPANTS = 50;

/**
 * 投稿1件から { up, down, emojiTotal, voteScore, attention } を返します。
 * attention = up + down + emojiTotal
 * voteScore = up - down
 */
export function calculateReactionStats(node: any): ReactionStats {
  let up = 0;
  let down = 0;
  if (node && 'reactions' in node && node.reactions) {
    for (const emoji of Object.values(node.reactions)) {
      if (emoji === '⇧') up++;
      else if (emoji === '⇩') down++;
    }
  }

  let emojiTotal = 0;
  if (node && 'emojiReactions' in node && node.emojiReactions) {
    for (const v of Object.values(node.emojiReactions)) {
      if (v === true) emojiTotal++;
    }
  }

  const voteScore = up - down;
  const attention = up + down + emojiTotal;

  return { up, down, emojiTotal, voteScore, attention };
}

// nodeId -> ReactionStats のキャッシュ Map
const reactionStatsCache = new Map<string, ReactionStats>();

/**
 * キャッシュを活用した ReactionStats 取得・更新関数
 * リアクションのイベントでは変化した投稿だけ更新します。
 */
export function getOrUpdateReactionStats(nodeId: string, node: any, forceUpdate = false): ReactionStats {
  if (!forceUpdate && reactionStatsCache.has(nodeId)) {
    return reactionStatsCache.get(nodeId)!;
  }
  const stats = calculateReactionStats(node);
  reactionStatsCache.set(nodeId, stats);
  return stats;
}

/**
 * 特定ノードの stats を明示的に更新・無効化
 */
export function updateReactionStats(nodeId: string, node: any): ReactionStats {
  const stats = calculateReactionStats(node);
  reactionStatsCache.set(nodeId, stats);
  return stats;
}

export function clearReactionStatsCache(): void {
  reactionStatsCache.clear();
}

/**
 * ルーム設定 expectedParticipants から R を算出します。
 * 設定値のない既存ルームは 50 として扱い (R = 17.5)、範囲外 (最小2, 最大1000) は丸めます。
 * R = max(8, expectedParticipants * REACTION_RATE)
 */
export function calculateR(expectedParticipants?: number | null | string): number {
  let count = typeof expectedParticipants === 'number'
    ? expectedParticipants
    : parseInt(String(expectedParticipants || ''), 10);

  if (isNaN(count)) {
    count = DEFAULT_EXPECTED_PARTICIPANTS;
  } else {
    count = Math.max(2, Math.min(1000, Math.round(count)));
  }

  return Math.max(8, count * REACTION_RATE);
}

/**
 * 濃さ (level): 0 〜 1
 * level = min(1, ln(1 + |voteScore|) / ln(1 + R))
 */
export function calculateLevel(voteScore: number, R: number): number {
  if (voteScore === 0) return 0;
  const absScore = Math.abs(voteScore);
  const denom = Math.log(1 + R);
  if (denom <= 0) return 0;
  const level = Math.log(1 + absScore) / denom;
  return Math.max(0, Math.min(1, level));
}

/**
 * step: 0 〜 12
 * step = round(level * 12)
 */
export function calculateStep(level: number): number {
  return Math.max(0, Math.min(12, Math.round(level * 12)));
}

/**
 * ドキュメント背景の強度
 * 強度 = 0.12 + (現行の上限 - 0.12) * level
 * soft設定時: 現行通り Math.min(0.35, rawIntensity * 0.45)
 */
export function getDocBgIntensity(level: number, isSoft = false): number {
  if (level <= 0) return 0;
  const maxIntensity = 1.0;
  const rawIntensity = 0.12 + (maxIntensity - 0.12) * level;
  if (isSoft) {
    return Math.min(0.35, rawIntensity * 0.45);
  }
  return rawIntensity;
}

/**
 * チャットの文字サイズ
 * 基本 + 12px * level (同意: voteScore > 0)
 * 基本 - 4px * level (非同意: voteScore < 0, 最小 10px)
 */
export function getChatFontSize(level: number, voteScore: number): string | undefined {
  if (voteScore === 0 || level === 0) return undefined;
  if (voteScore > 0) {
    return `calc(var(--font-size-base) + ${(12 * level).toFixed(2)}px)`;
  }
  return `max(10px, calc(var(--font-size-base) - ${(4 * level).toFixed(2)}px))`;
}

/**
 * 目次・ミニマップの透明度
 * 透明度 = 0.3 + 0.5 * level
 */
export function getMinimapOpacity(level: number): number {
  return 0.3 + 0.5 * level;
}

/**
 * emojiReactions (Record<string, boolean>) から絵文字ごとの人数および自身が押したかを算出します。
 * キー形式: `${userId}|${emoji}`
 * - 最大表示件数（デフォルト6種類）までを visibleChips として返し、超過分は remainingCount (+n) とします。
 */
export function aggregateEmojiReactions(
  emojiReactions: Record<string, boolean> | undefined,
  currentUserId: string,
  maxVisibleChips: number = 6
): EmojiReactionListResult {
  if (!emojiReactions) {
    return { visibleChips: [], remainingCount: 0, totalReactionsCount: 0 };
  }

  const counts: Record<string, { count: number; hasReacted: boolean }> = {};
  let totalReactionsCount = 0;

  for (const [key, value] of Object.entries(emojiReactions)) {
    if (value !== true) continue;
    const sepIdx = key.indexOf('|');
    if (sepIdx === -1) continue;
    const uid = key.slice(0, sepIdx);
    const emoji = key.slice(sepIdx + 1);
    if (!emoji) continue;

    totalReactionsCount++;
    if (!counts[emoji]) {
      counts[emoji] = { count: 0, hasReacted: false };
    }
    counts[emoji].count += 1;
    if (uid === currentUserId) {
      counts[emoji].hasReacted = true;
    }
  }

  // 件数降順（同数の場合は絵文字順）でソート
  const sorted: EmojiReactionSummary[] = Object.entries(counts)
    .map(([emoji, data]) => ({
      emoji,
      count: data.count,
      hasReacted: data.hasReacted,
    }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));

  const visibleChips = sorted.slice(0, maxVisibleChips);
  const remainingCount = Math.max(0, sorted.length - maxVisibleChips);

  return {
    visibleChips,
    remainingCount,
    totalReactionsCount,
  };
}

/**
 * 100人以上の場合は "99+" と表記するフォーマッタ
 */
export function formatReactionCount(count: number): string {
  if (count >= 100) return '99+';
  return String(count);
}
