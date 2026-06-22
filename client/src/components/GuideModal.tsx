import React from 'react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-header">
          <span className="guide-header__icon">🚀</span>
          <h2 className="guide-header__title">Chatmentの体験ガイドへようこそ！</h2>
        </div>

        <p className="guide-intro">
          このシミュレーターは、リアルタイムで会話をしながら、自然とドキュメントを共創できる没入型の協働ツールです。以下の5大特徴をお試しください：
        </p>

        <div className="guide-features">
          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              1. チャットからドキュメントへの「あふれ（Overflow）」🌊
            </div>
            <div className="guide-feature-item__desc">
              右側のチャットに書かれたメッセージは、画面表示から溢れると自動的に左側の<strong>ドキュメントブロック</strong>へと移行します。古い会話が消えることなく、ドキュメントとして再構成されます！
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              2. 直感的なドキュメント編集と並び替え 📄
            </div>
            <div className="guide-feature-item__desc">
              ドキュメントの各ブロックは、直接インラインで編集できます。左端のドラッグハンドル「<strong>⣿</strong>」をドラッグして順序を並べ替えたり、右クリックメニューから新規追加や強調度の変更が可能です。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              3. 双方向ジャンプ ⇆ フラッシュ機能 ⚡️
            </div>
            <div className="guide-feature-item__desc">
              チャットメッセージをクリックすると、ドキュメントの該当箇所へ自動スクロールして<strong>黄色くフラッシュ</strong>します！また、ドキュメントブロックの左端の丸（またはホバー時の時間・作者情報）をクリックすれば、チャットの該当メッセージへ双方向にジャンプします。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              4. 3段階の「文字強調」と「絞り込み」🎨
            </div>
            <div className="guide-feature-item__desc">
              ヘッダーの「B / 標準 / 控えめ」で新規メッセージの強調度を選択できるほか、各ブロックを右クリックして強調度を個別に変更できます。ヘッダーのフィルターで「太字のみ」などに絞り込むこともできます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              5. リアクションによる文字サイズ・色の変化 📈
            </div>
            <div className="guide-feature-item__desc">
              チャットメッセージの「<strong>⇧ (Upvote)</strong>」「<strong>⇩ (Downvote)</strong>」リアクションを押すと、投票数に応じてメッセージのサイズと色が動的に変化します。ドキュメント側もリアクションに応じて背景が色付きます。
            </div>
          </div>
        </div>

        <button className="guide-start-btn" onClick={onClose}>
          体験をはじめる！
        </button>
      </div>
    </div>
  );
};
