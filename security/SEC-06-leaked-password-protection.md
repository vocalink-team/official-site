# SEC-06 漏えい済みパスワード保護

確認日 2026-11-11（JST）。本番・検証ともに Supabase Auth の設定変更なし。

| 確認項目 | 結果 |
|---|---|
| 本番 `qvxoxrzvxyyribqjnpkb` | Security Advisorで `auth_leaked_password_protection` のWARN |
| 検証 `ktzcjyyesyewbzvrwngx` | 同じWARN |
| 両プロジェクトの組織プラン | Free |
| Supabase Authの漏えい済みパスワード保護 | Pro以上で利用可能 |

## 対象経路

`auth-setup.html` の初回設定と `reset-password.html` の再設定は、いずれも認証済みセッションから `supabase.auth.updateUser({ password })` を呼ぶ。判定は Supabase Auth で行う。

## 利用可能になった後の隔離検証

1. 検証プロジェクトで保護を有効化し、Authの設定で `password_hibp_enabled=true` を確認する。
2. 自動確認済みの一時ユーザーをAuth Admin APIで作成する。所有者の実メール・既存アカウントを使わず、招待や再設定メールを送らない。
3. 一時ユーザーでサインインし、設定済みの文字数・文字種条件を満たし、Have I Been Pwnedに収録されているテスト専用の候補を `updateUser` に渡す。HTTP応答で `weak_password` と理由 `pwned` を確認する。
4. 元のパスワードで再ログインできることを確認する。次に一時ユーザー専用のランダムな候補へ変更し、変更後のパスワードでログインできることを確認する。
5. 一時ユーザーを削除し、設定値とSecurity AdvisorのWARN解消を確認する。候補のパスワード、JWT、管理キーは記録に含めない。

公式資料 [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) / [Auth設定の取得](https://supabase.com/docs/reference/api/v1-get-auth-service-config) / [Auth設定の更新](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
