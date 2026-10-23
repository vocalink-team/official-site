# NEWS-001 第06工程 リリース検証チェックリスト

実施日: 2026-10-23 / 対象: Draft PR #7 / v2.25.0 開発ブランチ

## 完了したDBレベルの確認
- [x] 匿名RLS: 公開済みの記事のみSELECT可
- [x] 匿名RLS: 下書き・公開前の記事はSELECT不可
- [x] 匿名DB権限: NEWS記事INSERT不可
- [x] 匿名DB権限: NEWS画像メタデータのSELECT/INSERT不可
- [x] Storage: news-imagesは非公開
- [x] Storage: news-imagesへの匿名読み取りポリシーなし
- [x] 改訂履歴・監査ログ: トリガーによる生成をROLLBACKテストで確認
- [x] NEWSメディアの所有記事ID・Storageパス整合性制約
- [x] Edge Function news-public-media v1 を本番Supabaseへデプロイ（実HTTP試験は別項）

## 自動ブラウザE2E（Supabaseモック使用）
- [x] Chromiumで公開記事一覧・キーワード検索（Run 39938967690）
- [x] Chromiumで記事詳細表示・危険なHTMLタグとjavascriptリンクの除去（同Run）
- [x] Chromiumで存在しない記事を非表示（同Run）
- [x] Chromiumで非管理者に編集フォームを非表示（同Run）
- [x] Chromiumで管理者の下書き保存（モックDB、同Run）
- [ ] スマートフォン幅390pxで一覧・詳細の横スクロールを検証（Run 39939317278 実行中）

## 公開前に実ブラウザで確認（本番接続・実機未実施）
- [ ] 実Supabase接続でAdmin/SuperAdminログイン、一般ユーザーは編集不可
- [ ] 下書き→編集→公開→アーカイブ→再閲覧不可
- [ ] 予約日時前の非表示と日時到達後の自動表示（JST）
- [ ] 画像アップロード（JPEG/PNG/WebP、5MB以下）と拒否ケース
- [ ] 公開記事に画像が表示され、下書き・予約前の画像は404
- [ ] 画像の実HTTPヘッダ（no-store、nosniff、Content-Type）
- [ ] 改訂履歴・監査ログのUI表示と不正書き込み拒否
- [ ] 実Supabase接続でHTML・SVG・イベント属性・javascript:リンクを入力しXSS不成立を確認（モックブラウザで一部確認済み）
- [ ] 検索・カテゴリ・重要記事固定・ページ送りを実データで確認
- [ ] iPad・スマートフォン・PCの表示、キーボード操作、読み上げ
- [ ] ネットワークエラー、ログイン期限切れ、二重送信、公開時の競合
- [ ] サイト全ページのバージョン表記・CSS/JSキャッシュキーをv2.25.0へ統一
- [ ] PRレビュー、CI、GitHub Pagesプレビュー、本番公開後の疎通

## 判定
**未検収・公開不可。** このチェックリストの未完了項目が解消するまでPRはDraftを維持する。
