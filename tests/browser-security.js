// All application API and challenge traffic is stubbed. No real login or write occurs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dep = require('../security/dependencies.json').supabase;
const headerRule = require('../security/sec05-response-header-rule.json');
const memoCases = ['', '\n先頭改行', '\n\n複数改行\n末尾\n', '</textarea><script>window.__memoInjected=true</script>', '<b>日本語 & text</b>'];
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
          if (file === 'admin.html' && url.includes('/rest/v1/service_requests')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(memoCases.map((memo, i) => ({ id: 'isolated-request-' + i, title: 'Isolated memo ' + i, status: 'new', admin_note: memo }))), headers: { 'access-control-allow-origin': '*' } });
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
        const stylesBlocked = await page.evaluate(() => {
          const before = getComputedStyle(document.body).color;
          const style = document.createElement('style');
          style.textContent = 'body{color:rgb(1,2,3)!important}';
          document.head.append(style);
          const probe = document.createElement('span');
          probe.setAttribute('style', 'outline:7px solid rgb(1,2,3)');
          document.body.append(probe);
          const blocked = { before, after: getComputedStyle(document.body).color, outlineStyle: getComputedStyle(probe).outlineStyle, outlineWidth: getComputedStyle(probe).outlineWidth };
          style.remove(); probe.remove();
          return blocked;
        });
        assert.equal(stylesBlocked.after, stylesBlocked.before, file + ': unapproved style block rejected ' + JSON.stringify(stylesBlocked));
        assert.equal(stylesBlocked.outlineStyle, 'none', file + ': unapproved style attribute rejected ' + JSON.stringify(stylesBlocked));
        assert.notEqual(stylesBlocked.outlineWidth, '7px', file + ': injected outline width rejected');
        if (file === 'projects.html') {
          const widths = await page.evaluate(() => {
            const host = document.createElement('div'); host.style.width = '200px';
            document.body.append(host);
            const result = [0, 1, 37, 80, 100].map(value => {
              const bar = document.createElement('i');
              bar.style.display = 'block';
              bar.setAttribute('style', 'width:' + value + '%');
              host.append(bar);
              // CSSOM assignments remain available to trusted application scripts.
              bar.style.display = 'block';
              return Math.round(parseFloat(getComputedStyle(bar).width));
            });
            host.remove(); return result;
          });
          assert.deepEqual(widths, [0, 2, 74, 160, 200], 'existing integer progress widths remain authorized');
        }
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
        if (file === 'admin.html') {
          // The module is private; exercise its real event handlers with isolated API data.
          await page.evaluate(() => document.querySelector('.nav button[data-tab="requests"]').click());
          await page.waitForFunction(() => document.querySelectorAll('[data-request-edit]').length === 5);
          for (const [i, memo] of memoCases.entries()) {
            await page.evaluate(i => document.querySelector('[data-request-edit="isolated-request-' + i + '"]').click(), i);
            assert.equal(await page.locator('#editNote').inputValue(), memo, 'memo must round-trip exactly, including leading newlines');
            assert.equal(await page.locator('#detailBody script').count(), 0, 'memo must remain plain text');
            assert.equal(await page.evaluate(() => window.__memoInjected), undefined);
            await page.locator('#closeRequest').click();
          }
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
    const page = await browser.newPage();
    const missing = await page.goto('http://127.0.0.1:3000/does-not-exist');
    assert.equal(missing.status(), 404);
    assert.equal(await page.title(), 'ページが見つかりません | VOCALINK-TEAM');
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
    await page.close();

    const expectedHeaders = Object.fromEntries(Object.entries(headerRule.action_parameters.headers)
      .map(([name, setting]) => [name, setting.value]));
    for (const [pathname, status] of [['/', 200], ['/admin.html', 200], ['/request.html', 200], ['/sec05-not-found', 404]]) {
      const response = await fetch('http://127.0.0.1:3000' + pathname);
      assert.equal(response.status, status, pathname);
      for (const [name, value] of Object.entries(expectedHeaders)) {
        assert.equal(response.headers.get(name), value, pathname + ': ' + name);
      }
      await response.body.cancel();
      console.log('PASS SEC-05 HTTP headers', status, pathname);
    }

    const embed = await browser.newPage();
    try {
      const parent = 'http://localhost:3000/sec05-embedding-probe';
      const control = 'http://127.0.0.1:3000/sec05-unprotected-control';
      const admin = 'http://127.0.0.1:3000/admin.html';
      await embed.route(control, route => route.fulfill({
        contentType: 'text/html', body: '<p id="sec05-control">Cross-origin control</p>'
      }));
      await embed.route(parent, route => route.fulfill({
        contentType: 'text/html',
        body: '<iframe id="control" src="' + control + '"></iframe><iframe id="protected" src="' + admin + '"></iframe>'
      }));
      const failures = [];
      embed.on('requestfailed', request => {
        if (request.url() === admin) failures.push(request.failure()?.errorText);
      });
      await embed.goto(parent, { waitUntil: 'load' });
      await embed.frameLocator('#control').locator('#sec05-control').waitFor({ timeout: 10000 });
      const protectedFrame = await (await embed.locator('#protected').elementHandle()).contentFrame();
      assert.ok(protectedFrame, 'Protected iframe exists');
      const protectedUrl = protectedFrame.url();
      assert.notEqual(protectedUrl, admin, 'Admin document must not load in the iframe');
      assert.ok(protectedUrl.startsWith('chrome-error:') ||
        failures.some(error => error?.includes('ERR_BLOCKED_BY_RESPONSE')),
      'Chromium must report a blocked response, got ' + JSON.stringify({ protectedUrl, failures }));
      console.log('PASS SEC-05 cross-origin admin iframe blocked');
    } finally {
      await embed.close();
    }
    assert.deepEqual(failures, [], 'All browser cases must pass');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
