import React from 'react';

interface PlaybackControlsProps {
  currentStep: number;
  totalSteps: number;
  description: string;
  isAutoplay: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPrev3: () => void;
  onNext3: () => void;
  onTogglePlay: () => void;
  onScrub: (index: number) => void;
  onExit: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  currentStep,
  totalSteps,
  description,
  isAutoplay,
  onPrev,
  onNext,
  onPrev3,
  onNext3,
  onTogglePlay,
  onScrub,
  onExit,
}) => {
  if (totalSteps === 0) return null;

  return (
    <div className="playback-bar" id="playback-bar">
      <div className="playback-bar__header">
        <div className="playback-bar__status">
          <span className="playback-bar__dot animate-pulse">●</span>
          <span className="playback-bar__title">履歴再生モード</span>
          <span className="playback-bar__step">({currentStep + 1} / {totalSteps})</span>
        </div>
        <button className="playback-bar__exit" onClick={onExit} title="プレイバックを終了して最新に戻る">
          最新に戻る
        </button>
      </div>

      <div className="playback-bar__desc" title={description}>
        {description || "履歴を選択中..."}
      </div>

      <div className="playback-bar__slider-container">
        <input
          type="range"
          min="0"
          max={totalSteps - 1}
          value={currentStep}
          onChange={(e) => onScrub(parseInt(e.target.value))}
          className="playback-bar__slider"
        />
      </div>

      <div className="playback-bar__controls">
        <button
          className="playback-bar__btn"
          onClick={onPrev3}
          disabled={currentStep === 0}
          title="3コマ戻る (≪)"
        >
          ≪
        </button>
        <button
          className="playback-bar__btn"
          onClick={onPrev}
          disabled={currentStep === 0}
          title="1コマ戻る (＜)"
        >
          ＜
        </button>
        <button
          className={`playback-bar__btn playback-bar__btn--play ${isAutoplay ? 'playback-bar__btn--active' : ''}`}
          onClick={onTogglePlay}
          title={isAutoplay ? "一時停止 (Ⅱ)" : "自動再生 (▷)"}
        >
          {isAutoplay ? 'Ⅱ' : '▷'}
        </button>
        <button
          className="playback-bar__btn"
          onClick={onNext}
          disabled={currentStep === totalSteps - 1}
          title="1コマ進む (＞)"
        >
          ＞
        </button>
        <button
          className="playback-bar__btn"
          onClick={onNext3}
          disabled={currentStep === totalSteps - 1}
          title="3コマ進む (≫)"
        >
          ≫
        </button>
      </div>
    </div>
  );
};
