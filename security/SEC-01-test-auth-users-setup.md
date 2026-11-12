# SEC-01 第13工程：隔離Authテストユーザー準備

作成日：2026-11-11
対象：Supabase検証用プロジェクト `ktzcjyyesyewbzvrwngx` のみ。
本番プロジェクト `qvxoxrzvxyyribqjnpkb` は変更しない。

## 現在の確認済み状態
- `auth.users`：0件
- `public.team_members`：0件
- `public.team_roles`：3件（super_admin/admin/viewer）
- ダミーAuthユーザーの作成：未実施
- 実API検証：未実施

## 安全な準備手順
1. 検証用プロジェクトのAuth Admin API（`auth.admin.createUser`）または検証用Dashboardを利用し、**本番のメールアドレスや実在ユーザーを使わず**テストユーザーを作る。SQLによる `auth.users` への直接INSERTはしない。
2. テスト用のパスワードは秘密情報として保管し、GitHub・スプレッドシートに記録しない。
3. 役割の組合せ：active super_admin、active admin、suspended admin、active viewer。少なくとも4件のダミーAuthユーザーを用意する。
4. Authで作成されたUUIDを参照して、`public.team_members.user_id` に対応付ける。対象メールはテスト専用とし、送信可能な実メールを指定しない。
5. 認証用トークンを取得し、SEC-01-isolated-api-test-plan.mdのA〜Fを実行する。
6. テスト終了時にユーザーとメンバーレコードを削除する。

## 安全ゲート
- Authユーザーが0件のままでは実API権限別テストを実施できない。
- この環境で使える接続済みSupabase操作にはAuth Adminユーザー作成機能がない。代替としてauth.usersを直接SQL操作しない。
- 修正版Edge Functionは未デプロイ。PR #9はDraft維持。
- 次工程は、検証環境に限定したAuthユーザー作成経路の確保・4ユーザー作成・対応付けと検証。
