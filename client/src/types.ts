import type { LoroMap, LoroText } from 'loro-crdt';

export type EmphasisLevel = -1 | 0 | 1;

export interface ChatNodeData {
  type: 'chat';
  content: string;
  author: string;
  timestamp: number;
  reactions: Record<string, string>;
  isOrganized?: boolean;
}

export interface DocNodeData {
  type: 'doc';
  content: string;
  blockId: string;
  author: string;
  timestamp: number;
  isOrganized?: boolean;
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
