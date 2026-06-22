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
          Chatmentは、チャットとドキュメントが縦につながったコミュニケーションツールです。まずは、以下の5つの特徴を使ってみてください！：
        </p>

        <div className="guide-features">
          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              1. チャットとドキュメントの見た目の違い
            </div>
            <div className="guide-feature-item__desc">
              真ん中の仕切りの上下はそれぞれ、ドキュメント画面とチャット画面。どちらからも書き込むことができるし、仕切りをドラッグして好きなほうを広くして使うことができます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              2. チャット画面のリアクションボタン
            </div>
            <div className="guide-feature-item__desc">
              チャット画面にある「<strong>⇧</strong>」「<strong>⇩</strong>」ボタンを押すと、同意・つっこみの意思を表明できます。ボタンが押された数に応じてメッセージのサイズと色が変わります。実は、ドキュメント側にもリアクションに応じて背景が色付きます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              3. ドキュメント画面の編集と並び替え
            </div>
            <div className="guide-feature-item__desc">
              ドキュメント画面では、直接カーソルをおいて編集できます。編集中は他の人には見えなくて、他の部分をクリックするとみんなに編集後の様子が共有されます。
              また、左端のドラッグハンドル「<strong>⣿</strong>」をドラッグして順序を並べ替えることができます。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              4. 双方向ジャンプ機能
            </div>
            <div className="guide-feature-item__desc">
              チャットメッセージをクリックすると、ドキュメントの該当箇所へ自動スクロールします。また、ドキュメントブロックの左端の丸をクリックすれば、チャットの該当メッセージへ双方向にジャンプします。
            </div>
          </div>

          <div className="guide-feature-item">
            <div className="guide-feature-item__title">
              5. 見出しとインデント機能
            </div>
            <div className="guide-feature-item__desc">
              H1ボタンを押すと、見出しを作ることができます。
              また、＞ボタンを押すとインデントすることができます。
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
