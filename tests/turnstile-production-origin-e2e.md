# Turnstile E2E: production-origin browser check (no deployment)

**Do not merge this test branch.** This test runs only in your own browser at the allowed hostname; it does not alter the production website files. It can create **one dummy application** and trigger a Discord notification. Remove that dummy record after verifying its ID. Do not use a real applicant email.

1. Open https://vocalink-team.github.io/recruit.html and confirm the hostname exactly matches `vocalink-team.github.io`.
2. Open browser DevTools > Console, read the snippet below before pasting. It adds a visible Turnstile widget and a separate test button; it does **not** submit the existing recruitment form.
3. Solve the Turnstile challenge, click **Run one test**, and record the HTTP status and returned application ID. A valid result is `HTTP 200` with `ok:true`; any other result needs investigation.
4. Verify that the dummy application exists, then delete only the matching test application after recording the result. Never delete real applications.
5. Reload the page to remove the temporary widget. Do not merge or publish the test harness.

```javascript
(() => {
  if (document.querySelector('#vl-e2e-panel')) return;
  const panel = document.createElement('section');
  panel.id = 'vl-e2e-panel';
  panel.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;background:white;color:black;padding:16px;max-width:360px;max-height:75vh;overflow:auto;border:2px solid black;font:14px system-ui';
  panel.innerHTML = '<strong>VOCALINK-TEAM — ONE E2E TEST</strong><p>Creates one dummy application. Never use real personal data.</p><div id="vl-e2e-widget"></div><button id="vl-e2e-send" type="button">Run one test</button><pre id="vl-e2e-output"></pre>';
  document.body.append(panel);
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload = () => {
    window.turnstile.render('#vl-e2e-widget', { sitekey: '0x4AAAAAAFfEXG18WKa3BQcP', action: 'recruit' });
  };
  document.head.append(script);
  const button = panel.querySelector('#vl-e2e-send');
  const output = panel.querySelector('#vl-e2e-output');
  button.onclick = async () => {
    const token = window.turnstile?.getResponse('#vl-e2e-widget');
    if (!token) { output.textContent = 'Complete Turnstile first'; return; }
    if (!confirm('This will insert ONE dummy application and may send a Discord notification. Continue?')) return;
    button.disabled = true;
    const email = 'turnstile-e2e-' + crypto.randomUUID() + '@example.invalid';
    try {
      const response = await fetch('https://qvxoxrzvxyyribqjnpkb.supabase.co/functions/v1/submit-team-application-secure', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: 'E2E TEST — DELETE', email, role: 'その他', motivation: 'Security E2E test — delete this record', consent: true, turnstile_token: token })
      });
      const result = await response.json();
      output.textContent = JSON.stringify({status:response.status, result, test_email:email}, null, 2);
    } catch (error) { output.textContent = String(error); }
    finally { button.disabled = false; window.turnstile?.reset(); }
  };
})();
```

**Expected:** HTTP 200 with `ok:true` and `application_id`. Failure or timeout is not a pass. Keep the legacy submission path unchanged until this test and the frontend cutover are validated.
