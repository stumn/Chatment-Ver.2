/**
 * 投稿メニューおよび削除機能に関する設定（delete_spec.md に基づく設定項目）
 * 【仮】と指定された項目はここから一元的に変更できます。
 */
export const POST_MENU_CONFIG = {
  /**
   * 1. 「ドキュメントで編集」のメニュー項目表示名（【仮】）
   * 「編集」だけだとその場で編集できると誤解されるため設定されています。
   */
  EDIT_IN_DOC_LABEL: 'ドキュメントで編集',

  /**
   * 2. ドキュメント画面へのメニュー表示可否（【仮】）
   * 今回は変更しない（false）。将来ドキュメント側でもメニューを出す場合は true に変更します。
   */
  ENABLE_ON_DOC_PANEL: false,

  /**
   * 3. 「ドキュメントで編集」でジャンプした後のカーソルの位置（【仮】）
   * 'end': 行の末尾にカーソルを配置
   * 'start': 行の先頭にカーソルを配置
   * 'select-all': 行全体のテキストを選択状態にする
   */
  CURSOR_POSITION_AFTER_JUMP: 'end' as 'end' | 'start' | 'select-all',

  /**
   * 4. 削除確認ダイアログで表示する共同編集者（subAuthors）の名前の最大人数（【仮】）
   * 3人まで名前を列挙し、4人以上のときは「ほかn人」と表示します。
   */
  MAX_SUB_AUTHORS_SHOWN: 3,

  /**
   * 5. 削除確認ダイアログでのリアクション件数の数え方（【仮】）
   * 'all': 👍👎およびそれ以外の絵文字リアクションをすべて合算
   * 'emoji-only': 絵文字リアクションのみ
   * 'votes-only': 👍👎の投票のみ
   */
  REACTION_COUNT_MODE: 'all' as 'all' | 'emoji-only' | 'votes-only',
} as const;

export type PostMenuConfig = typeof POST_MENU_CONFIG;

