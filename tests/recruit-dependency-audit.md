# Recruitment dependency audit — 2026-10-23

## Inspected on main
- `recruit.html`: uses direct anonymous Supabase `team_applications.insert()`. Does **not** call either legacy Edge Function.
- `admin.html`: uses `team_applications.select()`, `update()`, and `delete()` for applicant administration. These operations must remain intact after the public INSERT policy is retired.
- `index.html`: no matching recruitment API call found in inspected content.
- GitHub code search for `submit-team-application`, `submit-team-application-v2`, `team_applications`, and `functions/v1` returned no results; indexing coverage is uncertain, so this is **not** evidence of zero references.
- Both legacy Edge Functions remain ACTIVE and contain service-role inserts without Turnstile validation.

## Before cutover
1. Review all other pages, scripts, workflow files, and external integrations for legacy API references.
2. Verify admin role policies independently; do not revoke authenticated/admin read/update/delete.
3. Keep public INSERT policy until the production `recruit.html` migration is verified.
4. After cutover, secure/disable both legacy Edge Functions and retire only the legacy public INSERT path.
5. Verify admin list/update/delete after policy changes.

## Caveats
- HTTP Origin checks do not authenticate callers outside the browser.
- Rate limiting by email is bypassable by rotating addresses.
- E2E test application ID `1ba2a8b1-2f59-4ec4-840d-8e5381cbff61` was confirmed in DB; deletion remains pending.
