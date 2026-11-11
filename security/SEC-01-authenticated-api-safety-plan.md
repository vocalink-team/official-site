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

## 隔離環境での再検証結果（2026-11-11 JST）

検証専用 Supabase `ktzcjyyesyewbzvrwngx` で、一時 Auth アカウントの実 JWT を使用。GitHub Actions の認証情報に依存しない別の実行経路で確認した。第22工程の「A〜E未実施」は当時の記録。

| 項目 | HTTP実測 | DB照合 |
|---|---|---|
| SEC-01 A・D・E | 各403。アプリ側の拒否理由も一致 | 対象メンバー行は不変。新規メンバー行なし |
| SEC-01 B・C | 各200。既存メンバー更新経路 | 表示名の更新と、ロール・状態・ユーザーIDの維持を確認 |
| SEC-01 F | 401 | 対象メンバー行は不変 |
| SEC-02 停止中Admin・Viewer（古いAdminメタデータあり） | 各403 | イベント作成0件 |
| SEC-02 active Admin・Super Admin | 各200 | 各1件の模擬監査イベントを確認。応答のイベントIDとDBが一致 |

- SEC-01 A〜Eは、PRの認可・DB処理を保った検証用コピーで実施。メール再送は模擬応答、新規招待メールは無効化。Fは隔離版 `team-member-invite` で実施。
- SEC-02は隔離版 `admin-security-test-v4` で実施。別の実行で確認済みのJWTなし・無効JWTは各401（Actions run 43006331011）。
- 一時ユーザー・メンバー・監査イベントは削除済み。一時のHTTP拡張と削除権限も解除済み。検証を起動する一時関数は無効化済み。
- 実メール配信、本番公開、本番データへの書き込みは検証範囲外。
