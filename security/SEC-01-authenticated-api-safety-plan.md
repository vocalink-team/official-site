# SEC-01 第22工程：認証済みAPIテスト安全実行計画

作成日：2026-11-11
対象：検証専用 Supabase `ktzcjyyesyewbzvrwngx` / `team-member-invite` v1
対象PR：#9 Draft
本番変更：なし

## コード上の拒否条件（GitHubブランチ確認）
- A：active admin が既存 super_admin を viewer に変更しようとすると、既存メンバー取得後、メール送信前に403を返す条件あり。
- D：suspended admin はメンバー権限検査で403を返す条件あり。
- E：active admin が role_key=super_admin を指定すると、メール送信前に403を返す条件あり。
- B/C：既存アカウントへの許可操作では `resetPasswordForEmail` が呼ばれるため、メール送信の副作用がある。
- 以上は**コードの確認**であり実API合格を意味しない。

## テストケース
| ID | 認証主体 | 対象 | 期待HTTP | メール副作用 |
|---|---|---|---|---|
| A | test2 active admin | test1 super_admin を viewer に変更 | 403 | 発生しないこと |
| B | test1 active super_admin | test1 自身を同ロールで更新 | 200 | パスワード再設定メールの可能性 |
| C | test2 active admin | test4 viewer を同ロールで更新 | 200 | パスワード再設定メールの可能性 |
| D | test3 suspended admin | test4 viewer を変更 | 403 | 発生しないこと |
| E | test2 active admin | role_key=super_admin で新規招待 | 403 | 発生しないこと |
| F | 無認証 | 任意 | 401 | GitHub Actionsで合格済み |

## 実行前の必須条件
1. 各テストアカウントの認証トークンを安全な実行環境で取得する。**パスワード・JWT・APIキーはGitHubファイル、PR本文、ログ、チャットに記載しない。**
2. テスト用メールの所有・受信許可を確認する。B/Cはメール送信を隔離または抑止したテスト環境で実行する。
3. 各操作の前後で `team_members` の `role_key`, `status`, `updated_at` 等を照合する。拒否操作はDB不変を確認。
4. A/D/Eを先に実行し、B/Cはメール副作用を安全に管理できる場合のみ実行する。
5. 403/200のHTTP応答とDB状態の両方が揃ったケースだけ合格にする。

## 現時点の判定
- F：合格（GitHub Actions run 43004025578、HTTP 401実測）。
- A〜E：未実施。
- SEC-01：未完了。
