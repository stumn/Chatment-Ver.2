import React from 'react';
import { Telomere } from './Telomere';
import { getSocketId } from '../loro/sync-client';

interface SplitViewProps {
  ratio: number;
  onHandleMouseDown: (e: React.MouseEvent) => void;
  onHandleDoubleClick: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  docPanel: React.ReactNode;
  chatPanel: React.ReactNode;
  isDominantDoc?: boolean;
  ratios: { id: string; ratio: number; docId: string }[];
  onSelectRatio: (ratio: number) => void;
}

export const SplitView: React.FC<SplitViewProps> = ({
  ratio,
  onHandleMouseDown,
  onHandleDoubleClick,
  containerRef,
  docPanel,
  chatPanel,
  isDominantDoc,
  ratios,
  onSelectRatio,
}) => {
  const inputOffset = 78; // Approximate height of the chat input area

  // 滑らかな補間処理 (ratio 0.6 ~ 0.7 の間で 0 から inputOffset に滑らかに移行させる)
  let w = 0;
  if (ratio > 0.7) {
    w = 1;
  } else if (ratio > 0.6) {
    // 0.6 ~ 0.7 を 0.0 ~ 1.0 にマッピング
    w = (ratio - 0.6) * 10;
  }
  const currentOffset = inputOffset * w;

  const docHeight = `calc(${ratio * 100}% + ${currentOffset}px)`;
  const chatHeight = `calc(${(1 - ratio) * 100}% - ${currentOffset}px)`;

  return (
    <div className="split-view" ref={containerRef as React.RefObject<HTMLDivElement>} id="split-view">
      <div className="split-panel split-panel--doc" style={{ height: docHeight }}>
        {docPanel}
      </div>
      <div
        className="split-handle"
        onMouseDown={onHandleMouseDown}
        onDoubleClick={onHandleDoubleClick}
        id="split-handle"
      >
        <div className="split-handle__grip" />
      </div>
      <div className="split-panel split-panel--chat" style={{ height: chatHeight }}>
        {chatPanel}
      </div>
      <Telomere ratioArray={ratios} myRatio={ratio} myId={getSocketId()} onSelectRatio={onSelectRatio} />
    </div>
  );
};
