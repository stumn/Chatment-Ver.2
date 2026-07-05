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
  ratios: { id: string; ratio: number; docId: string }[];
  onSelectRatio: (ratio: number) => void;
  isPlaybackActive?: boolean;
}

export const SplitView: React.FC<SplitViewProps> = ({
  ratio,
  onHandleMouseDown,
  onHandleDoubleClick,
  containerRef,
  docPanel,
  chatPanel,
  ratios,
  onSelectRatio,
  isPlaybackActive,
}) => {
  const docHeight = `calc(max(0px, ${ratio * 100}% - 8px))`;
  const chatHeight = `calc(max(0px, ${(1 - ratio) * 100}% - 8px))`;

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
      {!isPlaybackActive && (
        <Telomere ratioArray={ratios} myRatio={ratio} myId={getSocketId()} onSelectRatio={onSelectRatio} />
      )}
    </div>
  );
};
