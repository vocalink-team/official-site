# NEWS-001 実認証・実画像の受入試験

対象: `feature/news-001-foundation` / 開発v2.25.2 / 本番サイト未公開

## 実施状態
2026-10-23: スクリプト追加、Node構文検査合格。認証情報なしで終了コード2となりブラウザ・通信を開始しないことを確認。
**実Supabase接続での実行は未実施。12件合格済みのモックE2Eとは別の試験。**

## 前提・影響
- 対象プロジェクト: qvxoxrzvxyyribqjnpkb。
- Authのapp_metadata.roleがadminまたはsuper_adminであるテスト用アカウントを使用。
- アカウント作成・権限昇格をこのスクリプトは行わない。service_roleキーも使用しない。
- [動作確認]と明記した一意のテスト記事を一時公開する。公開中は実APIから一般閲覧可能。
- 終了時に画像を削除し、記事をアーカイブする。記事・改訂履歴・監査ログは残る。
- 既存記事・既存画像は変更しない。
- 強制終了時はfinallyが動かない場合がある。CLEANUP_FAILEDや中断時は、出力されたTEST_ARTICLE_IDまたはnews-e2e-で始まる今回のslugだけを確認し、記事をアーカイブし画像を削除する。
- 認証情報はチャット・コミット・画面録画に記載しない。

## 実行（PC・bash）
リポジトリを取得済みの環境で対象ブランチへ切り替える。未保存変更がある場合は先に保全する。

```bash
git switch feature/news-001-foundation
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
python3 -m http.server 8765 --bind 127.0.0.1
```

別のターミナルで同じリポジトリを開き、以下を実行する。メールアドレス・パスワードは対話入力され、コマンド履歴へ値を書かない。

```bash
read -r -p "テスト用管理者メール: " NEWS_E2E_EMAIL
read -r -s -p "パスワード: " NEWS_E2E_PASSWORD
export NEWS_E2E_EMAIL NEWS_E2E_PASSWORD
export NEWS_E2E_ALLOW_PUBLIC_TEST=yes
node tests/news-001-live.mjs
unset NEWS_E2E_EMAIL NEWS_E2E_PASSWORD NEWS_E2E_ALLOW_PUBLIC_TEST
```

終了コード0と各PASS、CLEANUPを確認する。失敗時はFAIL/CLEANUP_FAILEDのみを共有し、パスワードやトークンは共有しない。ブラウザtrace・スクリーンショット・入力値は保存しない。

## 検証対象
- [ ] 実管理者ログイン
- [ ] UIから下書き保存・PNGアップロード
- [ ] 下書きの画像一覧・画像本体404
- [ ] 未来予約の画像一覧・画像本体404
- [ ] 公開画像200・PNGバイト一致・no-store・nosniff
- [ ] 別の匿名ブラウザで記事・実画像表示
- [ ] 改訂履歴の生成
- [ ] UIからアーカイブ後に画像一覧・画像本体404
- [ ] 後片付け成功（記事アーカイブ・画像削除）

## この試験の対象外
一般ユーザーの実ログイン、Admin/SuperAdmin両方の個別実行、予約時刻の自然到達、JPEG/WebP・5MB境界、競合・期限切れ・通信断、iPad/スマートフォン実機、全ページバージョン統一、最終公開審査は別途必要。
