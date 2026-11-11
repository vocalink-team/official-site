# SEC-01 — 隔離環境での実API検証手順（2026-11-11）

## 現状（確認済み）
- 本番Supabase: VOCALINK-TEAM Official Site（project ref: qvxoxrzvxyyribqjnpkb）
- 現在アクセス可能なSupabaseプロジェクトは上記1件のみ。独立した検証用プロジェクトは未確認。
- この実行環境にはNode.jsはあるが、Docker / Podman / Supabase CLI / Denoはない。
- PR #9はDraft。CIで静的・モックリクエストテスト成功。
- 実Supabase APIを使った検証は**未実施**。本番関数・本番アカウントは変更しない。

## 検証環境の必須条件
1. 本番と異なるSupabaseプロジェクト、または本番と隔離されたローカルSupabase環境。
2. テスト用テーブル: team_members / team_roles（実運用と同等の列・制約・ポリシーを再現）。
3. ダミーの Auth ユーザー: super_admin、admin、suspended admin、viewer。
4. 外部への実メール送信を防ぐ仕組み（ローカルメールキャプチャなど）。
5. 実本番のAPIキー、メールアドレス、ユーザー情報、バックアップを投入しない。
6. Edge Functionのverify_jwt設定を本番と同等にし、認証・認可を別々に確認。

## テストケース
| ケース | 操作者 | 対象 | 期待HTTP | 追加検証 |
|---|---|---|---|---|
| A | admin / active | 既存super_admin | 403 | ロール・氏名・部署・notes・Auth情報に変更なし、メール送信なし |
| B | super_admin / active | 既存super_admin | 正常応答 | 許可された更新のみ反映 |
| C | admin / active | 既存viewer | 正常応答 | 既存動作維持 |
| D | admin / suspended | 既存viewer | 403 | 更新・メール送信なし |
| E | admin / active | 新規super_admin指定 | 403 | 招待なし |
| F | 未認証 | 既存viewer | 401 | 更新・メール送信なし |

## 実施手順
1. 検証環境のURLとプロジェクトIDを確認し、本番refと異なることを二重照合。
2. ダミーユーザーとテーブルを準備。メール送信先はテスト用受信環境に限定。
3. PR #9の修正版を**検証環境にのみ**デプロイ。
4. ケースA〜Fを実行し、HTTP応答・DB更新前後・メール捕捉ログを保存。
5. 既存の招待・再送・アカウント紐付け機能の回帰テスト。
6. テストデータを削除し、結果をPRに記録。失敗があればDraftのまま修正。

## 公開ゲート
- A〜Fの実APIテスト、回帰テスト、レビューがすべて合格。
- PR #9の本番v7との差分を再確認。
- 明示的な本番公開承認を得るまではmainへのマージ・本番デプロイをしない。

## 補足
この文書は**実施手順書**であり、実APIテスト完了の証跡ではありません。
