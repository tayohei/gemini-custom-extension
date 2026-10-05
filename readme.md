# Gemini Custom Layout & Keybinds

Google Gemini（https://gemini.google.com/app）の初期画面のレイアウトを自動調整し、送信・改行のキーバインドを変更する Chrome 拡張機能です。

## 🌟 主な機能

1. **初期画面の入力エリア拡大（画面比率指定）**
   - Gemini の初期画面（未会話状態）において、入力フォームを画面幅の 80%（`80vw`）、高さの約半分（`45vh`）にゆったりと拡大表示します。
   - 会話を開始（継続チャット画面へ遷移）すると、回答が見やすくなるよう自動的に標準のコンパクトなサイズへと戻ります。

2. **Enter と Ctrl+Enter の挙動反転**
   - **Enter キー**: 送信せずに改行を挿入
   - **Ctrl + Enter** (Mac の場合は **Cmd + Enter**): メッセージを送信

---

## 📁 フォルダ構成



gemini-custom-extension/
├── manifest.json   # 拡張機能の設定ファイル (Manifest V3)
├── content.css     # レイアウトカスタマイズ用 CSS
├── content.js      # キーバインド制御用 JavaScript
└── README.md       # 本説明ファイル


---

## 🚀 導入手順

1. **Google Chrome** を開き、アドレスバーに `chrome://extensions/` と入力してアクセスします。
2. 画面右上にある **「デベロッパー モード」** のスイッチをオンにします。
3. 画面左上に表示される **「パッケージ化されていない拡張機能を読み込む」** ボタンをクリックします。
4. この `README.md` や `manifest.json` が入っているフォルダを選択します。
5. [Gemini](https://gemini.google.com/app) にアクセス（またはページを再読み込み）して動作を確認します。

---

## ⚙️ 入力枠サイズのカスタマイズ

初期画面の入力枠サイズを変更したい場合は、`content.css` 内の以下の数値を自由に変更してください。

```css
/* 横幅を変更したい場合 (例: 80vw -> 90vw) */
.input-area-container.is-zero-state {
    max-width: 80vw !important;
    width: 80vw !important;
}

/* 縦幅を変更したい場合 (例: 45vh -> 55vh) */
.input-area-container.is-zero-state rich-textarea .ql-editor {
    min-height: 45vh !important;
}

```
