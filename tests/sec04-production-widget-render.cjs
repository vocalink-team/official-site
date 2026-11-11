const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.cwd();
const origin = 'https://www.vocalink-team.com';
const challenge = 'https://challenges.cloudflare.com';
const endpoint = 'https://qvxoxrzvxyyribqjnpkb.supabase.co/functions/v1/submit-service-request';
const fixture = {email: 'sec04-production-a2cac041ca2d4d09ac1c893ea49dee12@example.invalid', title: 'SEC-04 production check a2cac041'};
if (process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('This one-time production verification cannot be rerun');
const sdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(18000);
    const observations = { challengeScript: [], frameNavigation: [], errors: [], applicationWrites: 0 };
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === challenge && url.pathname.includes('/api.js')) observations.challengeScript.push(response.status());
    });
    page.on('framenavigated', frame => {
      if (frame.url().startsWith(challenge + '/')) observations.frameNavigation.push(new URL(frame.url()).pathname.split('/').slice(0, 4).join('/'));
    });
    page.on('requestfailed', request => {
      if (request.url() === sdk || request.url().startsWith(challenge + '/')) observations.errors.push([new URL(request.url()).origin,request.failure()?.errorText]);
    });
    page.on('pageerror', error => observations.errors.push(['page',error.name]));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const assets = {'/request.html':'text/html','/request-config.js':'application/javascript','/request.css':'text/css','/vl-ui.css':'text/css'};
      if (url.origin === origin && Object.hasOwn(assets,url.pathname) && request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: assets[url.pathname], body: fs.readFileSync(root+url.pathname) });
      }
      if (url.href === sdk || url.origin === challenge) return route.continue();
      if (url.href === endpoint && request.method() === 'OPTIONS') return route.continue();
      if (url.href === endpoint && request.method() === 'POST') {
        const body = request.postDataJSON();
        if (observations.applicationWrites === 0 && body?.email === fixture.email && body?.title === fixture.title) {
          observations.applicationWrites++;
          return route.continue();
        }
        return route.abort();
      }
      if (request.method() === 'POST' && !url.pathname.endsWith('/analytics_events')) observations.applicationWrites++;
      return route.abort();
    });
    try {
      await page.goto(origin+'/request.html', {waitUntil:'domcontentloaded'});
      await page.locator('#category').selectOption({label:'その他'});
      await page.locator('[data-next="2"]').click();
      await page.locator('#title').fill(fixture.title);
      await page.locator('#description').fill('Synthetic verification requested by site operator. Remove after checking.');
      await page.locator('[data-next="3"]').click();
      await page.waitForFunction(() => typeof window.turnstile?.render === 'function', undefined, {timeout:18000});
      if (!page.frames().some(f=>f.url().startsWith(challenge+'/'))) await page.waitForEvent('framenavigated', {predicate:f=>f.url().startsWith(challenge+'/'),timeout:12000})
        .catch(error=>{if(!page.frames().some(f=>f.url().startsWith(challenge+'/')))throw error;});
      assert.ok(page.frames().some(f=>f.url().startsWith(challenge+'/')));
      await page.locator('#name').fill('SEC-04 production verification');
      await page.locator('#email').fill(fixture.email);
      await page.locator('#agree').check();
      try {
        await page.waitForFunction(() => Array.from(document.querySelectorAll('input[name="cf-turnstile-response"]'))
          .some(input => input.value.length > 0), undefined, {timeout:18000});
      } catch {
        console.log(JSON.stringify({ok:false,stage:'Turnstile token not issued automatically',...observations}));
        process.exitCode=1;
        return;
      }
      const [response] = await Promise.all([
        page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'POST', {timeout:22000}),
        page.locator('#submit').click()
      ]);
      const status = response.status();
      const body = await response.json().catch(() => null);
      console.log(JSON.stringify({ok:status===201 && body?.ok===true,status,error:body?.error,...observations}));
      assert.equal(observations.applicationWrites,1);
      assert.equal(status,201);
      assert.equal(body?.ok,true);
    } catch(error) {
      console.log(JSON.stringify({ok:false,stage:error.name,message:error.message.split('\n')[0],...observations}));
      process.exitCode=1;
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
