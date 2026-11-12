# SEC-05 公式サイトのHTTPレスポンスヘッダー

2026年11月11日の本番確認では、トップ・管理画面・制作依頼フォームが200、存在しないパスが404。各レスポンスにCSP、X-Frame-Options、X-Content-Type-Options、HSTS、Referrer-PolicyのHTTPヘッダーはありませんでした。HTTPのトップはHTTPSへ301で転送されました。

`www.vocalink-team.com` のCNAMEは `vocalink-team.github.io` を指し、公開DNSのネームサーバーはムームードメインです。GitHub Pagesの公開ビルドに変更を加えても、この配信経路にレスポンスヘッダーを追加できません。

## 配信側の設定

`sec05-response-header-rule.json` はCloudflareの `http_response_headers_transform` フェーズへ追加するルールです。対象は `www.vocalink-team.com` のHTTPS応答です。配信がCloudflareを通り、オリジンへの証明書検証付きHTTPSとGitHub Pagesのカスタムドメインが正常に動くことを確認したうえで有効化します。既存のフェーズルールがある場合は、全置換せずこのルールを追加します。

- CSPは `frame-ancestors 'none'` のポリシーを追加します。既存のCSPヘッダーとHTMLのmeta CSPは維持されます。
- HSTSは対象ホストのみ `max-age=300` で開始します。初回確認時はサブドメインへの継承とプリロードを設定しません。
- `vocalink-team.github.io` の直接URLはCloudflareの対象外です。公開確認時にカスタムドメインへ転送されることを別途確認します。

## 公開時の確認

1. HTTPSでトップ、`/admin.html`、`/request.html` と存在しないパスを開き、200または404のレスポンスに5ヘッダーが付くことを確認します。
2. 別オリジンのページから管理画面をiframeで開き、ブラウザーが拒否することを確認します。トップレベルでの管理画面表示とフォームの動作も確認します。
3. HTTPからHTTPSへの転送、TLS証明書、GitHub Pagesの直接URLからの転送を確認します。問題があればこのルールを無効化し、HSTSは最後の有効な応答から最大300秒経過後に再確認します。

ブラウザー回帰テストはローカル配信でルールのヘッダー値を再現します。Cloudflare上の適用、公開DNS・TLS、実際のHTTPS応答は本番反映時に確認します。
