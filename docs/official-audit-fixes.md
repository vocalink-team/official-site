# Official-site audit fixes — v2.24.25

Date: 2026-10-26 (JST). First release: v2.24.24.

## Changes

- Restored the complete home page, keeping the latest ABOUT text; fixed scope initialization.
- Added www.vocalink-team.com to the existing recruitment widget's allowed domains.
- Deployed recruitment API v3 with exact origin and verified-hostname checks; retained token/action/rate-limit checks.
- Status-only request updates preserve the current memo atomically. Empty text explicitly clears a memo.
- Escaped finance ledger strings. Redirected legacy request administration to the current admin screen.
- Removed the retired Free Casino backend login from the security entry page.
- Added a canonical live role resolver. Linked memberships are authoritative: inactive/suspended/invited members cannot fall back to old administrator metadata. Legacy administrator accounts without membership retain server-owned role fallback. Permissions use the existing role matrix.
- Official admin policies/RPCs use this resolver. Ordinary administrators cannot edit or downgrade super-admin membership records.
- Consolidated the admin auth client; admission uses getUser and the canonical role RPC.
- Synchronized versions/cache keys, updated sitemap URLs and dynamic status timestamps/version.
- Deployment runs regression tests. The local ZAP workflow now starts its scan target.

## Verification

- [x] 13 Node regression tests pass.
- [x] Inline JavaScript syntax and local navigation references checked.
- [x] SQL dry run succeeds and rolls back.
- [x] Authorization assertions pass before and after migration: active roles retained; inactive/suspended/invited rejected despite privileged JWT claims; anonymous/invalid-action access denied.
- [x] Request memo preservation and explicit clearing pass. All test writes, membership changes and generated audit rows rolled back.
- [x] Database migration applied. Security Advisor reports no additional findings.
- [x] Recruitment preflight accepts exact new and old origins.

## Limitations

No successful real administrator browser login, production application submission, email delivery or physical smartphone/iPad test is recorded. Recruitment success uses isolated dependencies and creates no production notification/application. Existing leaked-password-protection WARN and rate-limit-table RLS INFO remain unchanged. A passing deployment or scanner does not establish a complete security audit.
