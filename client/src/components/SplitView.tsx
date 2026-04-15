import React from 'react';

interface SplitViewProps {
  ratio: number;
  onHandleMouseDown: (e: React.MouseEvent) => void;
  onHandleDoubleClick: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  docPanel: React.ReactNode;
  chatPanel: React.ReactNode;
  isDominantDoc?: boolean;
}

export const SplitView: React.FC<SplitViewProps> = ({
  ratio,
  onHandleMouseDown,
  onHandleDoubleClick,
  containerRef,
  docPanel,
  chatPanel,
  isDominantDoc,
}) => {
  const inputOffset = 78; // Approximate height of the chat input area

  const docHeight = isDominantDoc ? `calc(${ratio * 100}% + ${inputOffset}px)` : `${ratio * 100}%`;
  const chatHeight = isDominantDoc ? `calc(${(1 - ratio) * 100}% - ${inputOffset}px)` : `${(1 - ratio) * 100}%`;

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
    </div>
  );
};
