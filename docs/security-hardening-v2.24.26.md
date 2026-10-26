# Static-site security hardening v2.24.26

- Pin the browser Supabase SDK to the currently resolved 2.118.0 UMD bundle and verify SHA-384 SRI. Module callers use the same verified browser client rather than unpinned ESM imports.
- Add per-page CSP meta policies with SHA-256 hashes for existing inline scripts, no inline event attributes, no object embedding or base changes, and no native form submission. Existing scripted API requests remain permitted.
- Replace the dynamic contracts onclick attribute with a delegated listener.
- Keep Turnstile at its canonical provider-managed URL and allow its script/frame/connect origins. Its changing script is intentionally not SRI-pinned.
- Send only public site files to Pages and the local ZAP target; repository metadata, tests and workflows are excluded.
- Add desktop/mobile browser regression tests using isolated API and challenge responses; they do not log in or send production applications.

## Maintenance

After editing an inline script, run `node tools/static-security.cjs`, then `npm test`. Hash drift fails the deployment checks. Update `security/dependencies.json` together with all SDK tags when upgrading the browser client. Browser tooling uses an exact dependency and a committed npm lockfile; CI uses `npm ci --ignore-scripts`.

## Limits

Meta CSP does not provide `frame-ancestors`, X-Frame-Options, HSTS, nosniff, or Permissions-Policy response headers. These remain hosting-layer work. A passing local scanner or isolated browser test is not a complete production security audit. Actual administrator login, physical device checks, real Turnstile completion, successful production application storage and notification delivery remain unverified. Supabase leaked-password protection WARN and rate-limit-table no-policy INFO are outside this code change; no auth configuration or RLS policy is changed.

Sources: https://www.w3.org/TR/CSP/ ; https://developers.cloudflare.com/turnstile/reference/content-security-policy/ ; https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/ ; https://supabase.com/docs/guides/security/npm-security

## v2.24.27 follow-up

The legacy branch-based Jekyll workflow remains active alongside the explicit deployment. `_config.yml` excludes the same development directories from its output as a compatibility safeguard.
