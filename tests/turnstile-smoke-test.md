# Turnstile browser smoke test

Before merging PR #3, test the recruitment form on `vocalink-team.github.io` using a controlled preview or staging path. Do not use an unregistered preview hostname for Turnstile.

1. Submit with no Turnstile token: expect 403, no DB insert.
2. Submit with an invalid token: expect 403, no DB insert.
3. Complete Turnstile on the registered hostname and submit one clearly labeled test application: expect HTTP 200 and one DB row. Record the application ID privately.
4. Reuse the same Turnstile token: expect 403 and no additional DB row.
5. Repeat fresh-token submissions for the same test email: three in the same hour should be allowed, fourth rejected with 429 (the first valid test counts toward the three). Use test data only.
6. Remove test application rows after verification; verify real applicant rows are untouched.
7. Confirm browser console/network and Supabase function logs are clean.
8. Only then merge and remove the old direct anon INSERT policy after production success.

Never post the Turnstile secret or applicant personal data in issues, commits or logs.
