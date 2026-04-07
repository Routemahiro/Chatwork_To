# Chatwork 全員に返信

Chatwork の投稿アクションに `全員に返信` を追加する Chrome 拡張です。

## できること

- 既存の `返信` と同じ返信タグを先頭に入れる
- 元投稿に含まれる `To` 対象を集める
- 自分自身を除外する
- 投稿者を宛先に含める
- 重複する宛先を除外する

## 使い方

1. Chrome の拡張機能管理画面でデベロッパーモードを有効にします
2. `パッケージ化されていない拡張機能を読み込む` からこのフォルダを選びます
3. 拡張機能の `拡張機能のオプション` から自分の Chatwork `accountId` を設定します
4. Chatwork を開き、投稿にマウスオーバーして `全員に返信` を押します

## 注意

- Chatwork の DOM 構造に依存するため、画面更新で調整が必要になる場合があります
- 初版では複数の候補セレクタと既存 `返信` ボタンの自動クリックを組み合わせて返信タグを作っています
- 自分の `accountId` を設定しておくと、除外判定はその値を最優先で使います

## 公開関連

- Chrome Web Store 提出用の文面は [chrome-web-store/STORE_LISTING_JA.md](C:/Users/masak/Documents/MEGA/program_other/Chatwork_To/chrome-web-store/STORE_LISTING_JA.md) にまとめています
- 公開時の手順は [chrome-web-store/PUBLISH_CHECKLIST.md](C:/Users/masak/Documents/MEGA/program_other/Chatwork_To/chrome-web-store/PUBLISH_CHECKLIST.md) を参照してください
