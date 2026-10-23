# Recruit Turnstile production cutover gates

## Verified
- Negative HTTP cases: 8 passed (GitHub Actions run 39873062125).
- Browser positive case: HTTP 200, `ok:true`, application ID `1ba2a8b1-2f59-4ec4-840d-8e5381cbff61`; matching row was independently confirmed in Supabase.
- **Cleanup pending:** test row remains in database because deletion attempt was blocked. Delete only the exact test row in Supabase Table Editor and verify it is gone.

## Do not merge until
- [ ] Frontend `recruit.html` reviewed and manually checked on the intended hostname, including responsive layout, consent, Turnstile, validation, and errors.
- [ ] Record baseline of applications and backup/recovery plan.
- [ ] Confirm no other clients or automation rely on `submit-team-application`, `submit-team-application-v2`, or direct anonymous INSERT.
- [ ] Agree on a cutover window and rollback plan.

## Controlled release sequence
1. Merge production PR only after above checks, then verify public page loads the Turnstile widget and calls `submit-team-application-secure`.
2. Confirm a real-browser submission using a uniquely marked dummy address; independently verify its DB row and remove that exact row.
3. Disable or secure **both** legacy public Edge Functions (currently `verify_jwt=false` with service-role INSERT and no Turnstile). Do not assume revoking anonymous table INSERT blocks these functions.
4. Remove the legacy anonymous INSERT policy on `public.team_applications` **only after** the production frontend is verified and old clients are accounted for.
5. Re-run negative tests and inspect RLS/security advisors. Verify legitimate application management is unaffected.
6. Keep rollback focused: restore the prior frontend only if needed, but never re-enable an unprotected write path without a documented risk decision.

**Important:** A browser Origin check alone is not an authentication mechanism; Turnstile validation and server-side limits are the main controls. Email-based limits can be bypassed by using multiple addresses.
