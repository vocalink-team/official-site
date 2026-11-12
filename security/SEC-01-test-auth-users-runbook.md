# SEC-01 第14工程：検証用Authユーザー作成ランブック

対象プロジェクト：`ktzcjyyesyewbzvrwngx`（検証専用）。本番 `qvxoxrzvxyyribqjnpkb` は対象外。

## 事前確認
- Supabase Dashboardで検証用プロジェクトIDを再確認する。
- **実在する人物のメールアドレスを使用しない**。検証専用の受信環境を利用する。メール配信を発生させない場合はAuth Admin APIの `createUser` と `email_confirm: true` を使用する。
- `service_role` / secret API keyはローカルの安全な実行環境にのみ設定する。ブラウザやGitHubに配置しない。
- 既存本番ユーザーの複製・バックアップの取り込みをしない。

## 作成対象
| 仮ID | role_key | status | 用途 |
| --- | --- | --- | --- |
| test-super-admin | super_admin | active | 保護対象・許可操作者 |
| test-admin | admin | active | 一般管理者 |
| test-suspended-admin | admin | suspended | 停止中管理者 |
| test-viewer | viewer | active | 一般対象 |

## 実行方法
1. 検証用Supabaseの **Authentication → Users** で4件のダミーアカウントを作成する。メール確認や通知送信の有無を確認し、通知の送信を避ける。
2. Authの各ユーザーUUIDを取得する。
3. SQL Editorで以下のSQLを、UUIDとダミーメールアドレスを置換して**検証用プロジェクトだけ**に実行する。

```sql
insert into public.team_members
  (user_id, email, display_name, role_key, status, department, notes)
values
  ('<SUPER_ADMIN_UUID>', '<SUPER_ADMIN_TEST_EMAIL>', 'Test Super Admin', 'super_admin', 'active', 'general', 'SEC-01 isolated test'),
  ('<ADMIN_UUID>', '<ADMIN_TEST_EMAIL>', 'Test Admin', 'admin', 'active', 'general', 'SEC-01 isolated test'),
  ('<SUSPENDED_ADMIN_UUID>', '<SUSPENDED_ADMIN_TEST_EMAIL>', 'Test Suspended Admin', 'admin', 'suspended', 'general', 'SEC-01 isolated test'),
  ('<VIEWER_UUID>', '<VIEWER_TEST_EMAIL>', 'Test Viewer', 'viewer', 'active', 'general', 'SEC-01 isolated test');
```

4. 以下を実行して件数とロールを確認する。パスワードやアクセストークンは記録しない。

```sql
select role_key, status, count(*) from public.team_members
group by role_key, status order by role_key, status;
select count(*) as auth_user_count from auth.users;
```

## 完了基準
- Auth 4件、team_members 4件でUUIDの紐付けが正しい。
- 本番プロジェクトは変更されていない。
- テスト用メールが外部の実在アドレスに送信されていない。
- その後にSEC-01の修正版Edge Functionを検証環境にデプロイし、実APIテストA〜Fを実施する。

## 実施状況
このランブックの作成は完了。Authユーザーの実作成・紐付け・実API検証は未実施。
