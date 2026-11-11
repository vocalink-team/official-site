# SEC-01〜SEC-05 公開判定

対象 [Draft PR #9](https://github.com/vocalink-team/official-site/pull/9)。公開候補 v2.24.30。本番は v2.24.29。SEC-06は対象外。

## 確認済み

| 対象 | 証跡 |
|---|---|
| SEC-01・02 | [隔離実API検証](SEC-01-authenticated-api-safety-plan.md)。各6件合格。招待メール送信は模擬。 |
| SEC-03 | 隔離実API検証12件合格。Discordへの送信は模擬。 |
| SEC-04 | [ブラウザーからの上限検証](https://github.com/vocalink-team/official-site/actions/runs/43010329451)。テスト用Turnstileで正常3件、4件目429。 |
| SEC-05 | [ブラウザー回帰](https://github.com/vocalink-team/official-site/actions/runs/43011828077)。トップ・管理画面・依頼フォーム・404に5ヘッダー、別オリジンから管理画面をiframeで読み込めないことを確認。 |

本番の `team-member-invite` v7 と `admin-security-test-v4` v7 の差分は認可ガード。Discord通知APIの旧版とv2は本番v4を基に、現在のメンバー権限で判定する共通処理を使用する。隔離テストで実施したSEC-01の認証付き検証と、別途Secretsが必要な手動の再実行ジョブは別の実行経路。

## 承認後の公開順

1. レビューと公開承認を得る。公開直前に上記4関数の本番バージョンを再照合し、切り戻し用の現行ソース・JWT設定を確保する。Discord通知APIの既知のDB関数には接続トリガーがない。外部呼び出し元と本番通知経路を確認する。
2. SEC-04の [受付RPC準備](../supabase/sql/sec04_service_request_intake.sql) を適用し、`submit-service-request` を公開フォーム用にデプロイする。承認済みのテスト依頼を使い、本番用Turnstileのホスト名とアクション、およびDB書き込みを確認する。公開フォームの直接INSERT権限はこの段階で維持する。
3. SEC-01〜03の関数を更新する。Discord通知の両関数には `_shared/security-admin.ts` を同梱する。対象の通常動作を確認する。
4. PRを承認済みの方法でマージしてPagesを配信する。Auto Versionによる二重更新を避けるため、マージコミットの件名に `v2.24.30` を含める。公開バージョンと新フォームの配信を確認する。
5. 新フォームが正常に受付でき、旧版のキャッシュが更新されたことを確認してから、[直接INSERT停止](../supabase/sql/sec04_close_direct_service_request_insert.sql) を適用する。匿名・一般ログインユーザーの直接INSERTが拒否され、管理画面の既存操作が使えることを確認する。
6. SEC-05は配信経路が整った後に適用する。[ヘッダー設定と確認手順](SEC-05-http-response-headers.md) に沿って公開HTTPSとiframeの拒否を確認する。

## 公開判定

本番キーでの受付検証、Discordの本番通知経路、SEC-05の配信経路、公開承認が残っている。マージと本番設定は未実施。

## 追加確認（2026-11-11 JST）

- [先行ZAPスキャン](https://github.com/vocalink-team/official-site/actions/runs/43011828065) は46 URL、FAIL 0、WARN 9。スキャン先はローカルHTTPで、SEC-05のヘッダーを読み込んでいなかった。スキャン用サーバーをブラウザー回帰と同じルールに揃え、開始前に5ヘッダーを照合する。ローカルHTTPの結果と公開HTTPSの結果は分けて扱う。
- 本番の直近24時間の取得ログでは、旧 `security-alert-discord` のHTTP 401が1件。成功レスポンスとv2の呼び出しは確認されなかった。旧版・v2を参照するDB関数は各1件で、接続されたトリガーは0件。ログの観測範囲外の呼び出し元と実Discord配信は未確認。

## 切り戻し

- **SEC-04の旧フォーム復帰**。直接INSERTを停止済みの場合は、[旧フォーム用の制限付き復旧SQL](../supabase/sql/sec04_restore_legacy_request_insert.sql) を先に適用する。旧フォームの入力列だけを許可し、`id`、`created_at`、`status`、`admin_note` の指定を拒否する。その後、前バージョンの静的サイトを再配信し、正常登録を確認する。新フォームのキャッシュが残っている間は受付APIとRPCを稼働させる。
- 旧フォームの経路は一時復旧用。専用APIのTurnstile・送信上限は旧経路には適用されない。新フォームの受付を再確認してから直接INSERT停止SQLを再適用する。
- **SEC-01〜03**。不具合のある関数だけ、事前に確保した公開前ソースとJWT設定から再デプロイする。戻した項目は再度未修正として扱う。
- **SEC-05**。対象のレスポンスヘッダールールを無効にし、公開HTTPSを再確認する。ブラウザーのHSTSは最後の有効な応答から最大300秒後に再確認する。

隔離DBで `anon` と `authenticated` の両方を検証した。旧フォーム入力の登録は各1件成功し、管理列4種の指定と空の名前は拒否された。直接INSERTの再停止後、両ロールのINSERT権限がなく、受付RPCが利用可能で、テスト行が0件であることを確認した。
