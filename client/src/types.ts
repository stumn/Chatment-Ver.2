import type { LoroMap, LoroText } from 'loro-crdt';

export type EmphasisLevel = -1 | 0 | 1;

/**
 * 著者情報。表示名・本名・ユーザーIDをセットで保持する。
 * displayName: ハンドルネーム（表示に使う名前。変更可能）
 * realName: ログイン時に登録した本名
 * userId: セッションID（変わらない識別子）
 */
export interface AuthorInfo {
  displayName: string;
  realName: string;
  userId: string;
}

export interface ChatNodeData {
  type: 'chat';
  content: string;
  author: AuthorInfo;
  timestamp: number;
  reactions: Record<string, string>;
}

export interface DocNodeData {
  type: 'doc';
  content: string;
  blockId: string;
  author: AuthorInfo;
  timestamp: number;
  reactions?: Record<string, string>;
  emphasis?: EmphasisLevel;
  heading?: 'h1' | null;
  indent?: number;
  /** 共同編集者の一覧。編集順に追記される */
  subAuthors?: AuthorInfo[];
}

export type StreamNode = ChatNodeData | DocNodeData;

export interface StreamNodeWithIndex {
  node: StreamNode;
  id: string;
  index: number;
  loroMap: LoroMap;
  loroText?: LoroText;
}

export interface UserInfo {
  name: string;
  id: string;
}

export interface SplitViewState {
  ratio: number; // 0-1, fraction of height for doc panel
}

export const PRESET_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀'] as const;
export type PresetReaction = typeof PRESET_REACTIONS[number];
