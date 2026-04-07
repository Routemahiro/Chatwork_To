# Privacy / Disclosure 用メモ

## Single purpose

Chatwork のメッセージに対して、投稿者と To 宛先をまとめて返信しやすくすること。

## Permissions

### storage

ユーザーが設定した自分の Chatwork accountId を保存し、全員に返信時の除外判定に利用します。

## User data の説明候補

- 入力された accountId は拡張機能の設定として Chrome storage に保存されます
- 保存した accountId はローカルの拡張設定として利用されます
- 拡張機能は accountId を外部サーバーへ送信しません
- Chatwork 上で表示されているメッセージ内容は、返信欄へ整形して挿入する処理にのみ利用します
- 送信操作は自動で行いません

## Data usage 回答の目安

- Does your extension collect user data?
  回答方針: 収集ではなく、ユーザーが自分で入力した accountId を設定保存するのみ
- Is data sold?
  No
- Is data used for creditworthiness or lending?
  No
- Is data used for analytics, ads, or tracking?
  No
- Is data transferred to third parties?
  No
