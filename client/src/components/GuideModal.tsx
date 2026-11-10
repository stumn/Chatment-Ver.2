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
          <span className="guide-header__icon">💡</span>
          <h2 className="guide-header__title">Chatmentのヒント</h2>
        </div>

        <p className="guide-intro">
          Chatmentは、チャットとドキュメントが縦につながったコミュニケーションツールです。
        </p>

        <div className="guide-features">
          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              1. 仕切りで広さを変える
            </div>
            <div className="guide-feature-item__desc">
              上がドキュメント、下がチャット。どちらからも書き込めます。仕切りをドラッグすると、自分の画面だけ広さが変わります。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              2. リアクション
            </div>
            <div className="guide-feature-item__desc">
              チャットの 👍👎 や ＋ で反応できます。結果はドキュメントの背景色にも出ます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              3. ドキュメントの編集
            </div>
            <div className="guide-feature-item__desc">
              クリックしてそのまま編集できます。編集中は他の人に見えず、確定すると共有されます。右端の「⣿」で並べ替えできます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              4. ジャンプ
            </div>
            <div className="guide-feature-item__desc">
              チャットの発言をクリックするとドキュメントの該当箇所へ、ドキュメント左端の丸をクリックするとチャットの該当発言へ移動します。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              5. 見出しとインデント
            </div>
            <div className="guide-feature-item__desc">
              「H1」で見出し、「＞」でインデントできます。
            </div>
          </div>

        </div>

        <button className="guide-start-btn" onClick={onClose}>
          体験をはじめる！
        </button>
      </div>
    </div >
  );
};
