import type { EmojiReactionSummary } from '../types';

export interface EmojiReactionListResult {
  visibleChips: EmojiReactionSummary[];
  remainingCount: number;
  totalReactionsCount: number;
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
