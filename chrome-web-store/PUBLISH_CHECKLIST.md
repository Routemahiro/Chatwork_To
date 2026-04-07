# Chrome Web Store 公開チェックリスト

## 事前準備

1. Chrome Web Store Developer 登録を済ませる
2. このリポジトリを最新状態にする
3. 拡張を Chrome に読み込み、最終動作確認をする

## 画像素材

以下を用意する:

- 128x128 アイコン
  ファイル: `store_assets/icons/icon-128.png`
- 小プロモ画像
  ファイル: `store_assets/promo/small-promo-440x280.png`
- スクリーンショット 1枚以上
  推奨:
  - Chatwork の投稿アクション列に `全員に返信` が表示されている画面
  - `全員に返信` 実行後に返信欄へ `返信タグ + To` が入った画面

スクリーンショット撮影のコツ:

- 個人名やメッセージ本文は必要に応じてダミー環境で撮る
- ブラウザ全体ではなく、機能が分かる範囲を中心に切り取る
- 文字が読める明るさで撮る

## ZIP 作成

1. リポジトリ直下のファイルをまとめる
2. `manifest.json` が ZIP の直下に入る形で圧縮する
3. `.git` フォルダは含めない

PowerShell 例:

```powershell
$out = "Chatwork_To_release.zip"
if (Test-Path $out) { Remove-Item $out }
$items = Get-ChildItem -Force | Where-Object { $_.Name -notin @(".git", $out) }
Compress-Archive -Path $items.FullName -DestinationPath $out
```

## Dashboard 入力

### Store listing

- 名前: `Chatwork 全員に返信`
- Summary / Description:
  [STORE_LISTING_JA.md](C:/Users/masak/Documents/MEGA/program_other/Chatwork_To/chrome-web-store/STORE_LISTING_JA.md) をベースに入力
- Category:
  生産性系で問題ない
- Language:
  日本語

### Privacy

- Single purpose:
  [PRIVACY_DISCLOSURE_JA.md](C:/Users/masak/Documents/MEGA/program_other/Chatwork_To/chrome-web-store/PRIVACY_DISCLOSURE_JA.md) を参照
- `storage` 権限の用途:
  自分の accountId 保存

### Test instructions

以下をそのまま使ってよい:

```text
1. Open Chatwork.
2. Hover any message that contains one or more [To] recipients.
3. Confirm that a "全員に返信" action appears near the existing reply action.
4. Click the button.
5. Verify that the compose box is filled with the standard reply tag and the collected [To] recipients, excluding the configured self accountId.
6. The extension does not auto-send messages.
```

## 公開前最終確認

- `全員に返信` が本文中へ誤挿入されない
- 宛先名が `さん` までで切れている
- 自分の accountId 設定が効いている
- スクロールでフリーズしない
- オプション画面が開ける
