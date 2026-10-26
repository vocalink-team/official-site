# Security follow-up — v2.24.28

Verified 2026-10-27 JST against main b4bd0ea5bdc6e7cec48675a4457bfc72b386bb11.

## Completed v2.24.27 scan

GitHub Actions run 40340723914 completed successfully. Its report scans a local static server, not the live application APIs: 0 high, 7 medium, 7 low and 4 informational alert types. The earlier hidden-file finding is absent. Remaining medium findings include CSP style/wildcard/ancestor configuration, a missing CSP on a generated local 404, HTTP-only local serving, anti-clickjacking headers and the provider-managed Turnstile script without SRI. Success is not a clean security report.

## Change

- Inline style blocks and existing style attributes are authorized by SHA-256 hashes, replacing blanket unsafe-inline style permission.
- Project progress retains its integer 0–100% styles. The database column and CHECK constraint were inspected read-only.
- Images are limited to the site itself, data/blob URLs and the project's Supabase origin; the unrestricted HTTPS image scheme is removed.
- A custom Japanese 404 page uses the same generated CSP. The local scanner server returns this page for missing paths, matching the Pages error body without adding headers that production does not provide.
- Browser tests additionally reject unapproved style blocks/attributes, preserve project progress widths and check a real missing-route 404 response.

## Remaining dependencies

- The connected Cloudflare account returned no zones, including no vocalink-team.com zone. No DNS, proxy or response-header rule was changed.
- Supabase Security Advisor still reports leaked-password protection WARN and recruit_submission_limits no-policy INFO. The organization is Free; official docs make leaked-password protection a Pro-and-above feature. No subscription, authentication setting, RLS policy or data was changed.
- frame-ancestors and anti-clickjacking/nosniff/HSTS/Permissions-Policy headers require a serving-layer solution. They are not inserted into a meta element as a substitute for real response headers.
- Production administrator login, actual mobile/iPad hardware, real Turnstile completion, successful application storage and notification delivery remain unverified by these isolated tests.

## Sources

- https://github.com/vocalink-team/official-site/actions/runs/40340723914
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr
- https://developers.cloudflare.com/rules/transform/
- https://supabase.com/docs/guides/auth/password-security

When editing inline scripts or styles, run `node tools/static-security.cjs` before `npm test` and browser verification.
