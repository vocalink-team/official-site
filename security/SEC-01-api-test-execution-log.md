# SEC-01 第18工程：API検証実行記録

日付：2026-11-11
対象：検証専用 Supabase `ktzcjyyesyewbzvrwngx`
関数：`team-member-invite` v1（ACTIVE、JWT検証有効）
本番変更：なし

## 接続試験
- 実行環境から `https://ktzcjyyesyewbzvrwngx.supabase.co/functions/v1/team-member-invite` に対するHTTP到達確認を試行。
- 結果：`curl: (6) Could not resolve host`。DNS解決できず、HTTP応答なし。
- **A〜Fの実APIテストは未実施。成功と判定しない。**

## DBの事前条件（SQL確認済み）
| アカウント | role | status | 管理操作の前提条件 | Super Admin変更の前提条件 |
| --- | --- | --- | --- | --- |
| test1@gmail.com | super_admin | active | true | true |
| test2@gmail.com | admin | active | true | false |
| test3@gmail.com | admin | suspended | false | false |
| test4@gmail.com | viewer | active | false | false |

この表はDB値とコードの条件から算出した**テスト前提条件**であり、実際のAPI認可を証明するものではない。

## 実APIテスト未完了項目
- A active admin → existing super_admin の降格要求：403、DB不変、メール送信なし
- B active super_admin → existing super_admin の変更：許可
- C active admin → viewer の変更：許可
- D suspended admin → viewer：403
- E admin → 新規 super_admin 招待：403
- F 無認証：401（JWTゲートウェイ側で拒否される可能性も含め実測）

## 再開条件
1. 検証環境にHTTPアクセス可能な実行環境を確保。
2. テストアカウントのセッションを安全に取得。パスワード・トークンをGitHubに記録しない。
3. **メール送信の副作用を隔離または無効化**してから、A〜Fを実施する。特に既存ユーザーへの再送や招待は実際にメールを発生させる。
4. 各試験前後のDBスナップショットとHTTPコードを照合し、実行結果を記録。
5. 本番環境にはデプロイしない。
