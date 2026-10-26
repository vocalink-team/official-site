// All application API and challenge traffic is stubbed. No real login or write occurs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dep = require('../security/dependencies.json').supabase;
(async () => {
  const response = await fetch(dep.url);
  assert.ok(response.ok, 'Pinned SDK download');
  const sdk = Buffer.from(await response.arrayBuffer());
  assert.equal('sha384-' + crypto.createHash('sha384').update(sdk).digest('base64'), dep.integrity);
  const browser = await chromium.launch();
  try {
    const files = fs.readdirSync('.').filter(n => n.endsWith('.html')), failures = [];
    for (const width of [1440, 390]) {
      for (const file of files) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
        const page = await context.newPage(), violations = [], errors = [];
        await page.addInitScript(() => {
          window.__cspViolations = [];
          document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }));
        });
        page.on('pageerror', e => errors.push(e.message));
        await context.route('https://**/*', async route => {
          const url = route.request().url();
          if (url === dep.url) return route.fulfill({ contentType: 'application/javascript', body: sdk, headers: { 'access-control-allow-origin': '*' } });
          if (url.startsWith('https://challenges.cloudflare.com/')) return route.fulfill({ contentType: 'application/javascript', body: 'window.turnstile={reset(){}};' });
          if (url.includes('.supabase.co/')) return route.fulfill({ status: url.includes('/auth/') ? 401 : 200, contentType: 'application/json', body: url.includes('/auth/') ? '{"message":"No session"}' : '[]', headers: { 'access-control-allow-origin': '*' } });
          return route.abort();
        });
        const res = await page.goto('http://127.0.0.1:3000/' + file, { waitUntil: 'networkidle' });
        assert.equal(res.status(), 200, file);
        await page.waitForTimeout(100);
        violations.push(...await page.evaluate(() => window.__cspViolations));
        assert.deepEqual(violations, [], file + ': CSP');
        assert.deepEqual(errors, [], file + ': runtime');
        if (fs.readFileSync(file, 'utf8').includes('src="' + dep.url + '"')) assert.equal(await page.evaluate(() => typeof window.supabase?.createClient), 'function', file);
        if (file === 'index.html' || file === 'recruit.html') {
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), file + ': mobile overflow');
        }
        if (file === 'index.html') {
          await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('hide') || getComputedStyle(document.getElementById('loader')).display === 'none', null, { timeout: 10000 }).catch(async () => {
            assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('loader')).opacity), '0', 'home loader closes');
          });
        }
        // A new inline script, not listed in the policy, must not execute.
        await page.evaluate(() => { const el = document.createElement('script'); el.textContent = 'window.__unexpectedScriptRan = true'; document.body.append(el); });
        assert.equal(await page.evaluate(() => window.__unexpectedScriptRan), undefined, file + ': injected script blocked');
        if (file === 'recruit.html') {
          await page.locator('[name="name"]').fill('Isolated browser test');
          await page.locator('[name="email"]').fill('test@example.invalid');
          await page.locator('[name="role"]').selectOption({ label: 'Web Developer' });
          await page.locator('[name="motivation"]').fill('No production submission');
          await page.locator('[name="consent"]').check();
          await page.locator('#submit').click();
          await page.waitForFunction(() => document.querySelector('#msg').textContent.includes('認証が完了していません'));
          assert.equal(await page.locator('#submit').isEnabled(), true);
          const before = page.url();
          await page.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector('form')));
          await page.waitForTimeout(100);
          assert.equal(page.url(), before, 'native fallback must not put personal fields in URL');
        }
        if (file === 'contracts.html') {
          const title = await page.evaluate(() => {
            contracts = [{ id: 'isolated-contract', contract_number: 'TEST-1', title: 'Isolated contract', status: 'active', contract_type: 'other', amount: 0 }];
            render();
            document.querySelector('button[data-contract-id]').click();
            return document.getElementById('fTitle').value;
          });
          assert.equal(title, 'Isolated contract', 'delegated detail button works under CSP');
        }
        console.log('PASS', width, file);
        } catch (error) {
          failures.push({ width, file, error: error.message });
          console.error('FAIL', width, file, error.message);
        } finally { await context.close(); }
      }
    }
    assert.deepEqual(failures, [], 'All browser cases must pass');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
