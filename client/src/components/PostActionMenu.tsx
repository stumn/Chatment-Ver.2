import React, { useRef, useEffect } from 'react';
import { POST_MENU_CONFIG } from '../config/postMenuConfig';

interface PostActionMenuProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onEditInDoc: () => void;
  onRequestDelete: () => void;
}

export const PostActionMenu: React.FC<PostActionMenuProps> = ({
  isOpen,
  onToggle,
  onEditInDoc,
  onRequestDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onToggle(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onToggle(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onToggle]);

  // メニューが開いたときに最初の項目へフォーカス移動
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstButton = menuRef.current.querySelector<HTMLButtonElement>('button');
      firstButton?.focus();
    }
  }, [isOpen]);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(!isOpen);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(false);
    onEditInDoc();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(false);
    onRequestDelete();
  };

  return (
    <div
      ref={containerRef}
      className="post-action-menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`post-action-menu__trigger ${isOpen ? 'post-action-menu__trigger--open' : ''}`}
        onClick={handleButtonClick}
        aria-label="投稿のメニュー"
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="投稿のメニュー"
      >
        ⋮
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="post-action-menu__dropdown"
          role="menu"
          aria-label="投稿オプション"
        >
          <button
            type="button"
            role="menuitem"
            className="post-action-menu__item post-action-menu__item--edit"
            onClick={handleEditClick}
          >
            {POST_MENU_CONFIG.EDIT_IN_DOC_LABEL}
          </button>
          <button
            type="button"
            role="menuitem"
            className="post-action-menu__item post-action-menu__item--delete"
            onClick={handleDeleteClick}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
};

