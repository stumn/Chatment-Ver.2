import type { AuthorInfo } from '../types';

type Who = Pick<AuthorInfo, 'userId' | 'realName'>;

/** 同じ人かどうか。userId（このタブ限り）か realName（ログイン時のニックネーム）のどちらかが一致すれば同じ人 */
export function isSameAuthor(author: Who | null | undefined, me: Who | null | undefined): boolean {
  if (!author || !me) return false;
  const sameId = !!author.userId && author.userId === me.userId;
  const a = (author.realName || '').trim();
  const b = (me.realName || '').trim();
  return sameId || (a !== '' && a === b);
}

/** ニックネームから作る安定した userId */
export function makeUserId(realName: string): string {
  return `n:${encodeURIComponent(realName.trim())}`;
}
