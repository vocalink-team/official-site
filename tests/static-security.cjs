const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tag } = require('../tools/static-security.cjs');
const root = path.join(__dirname, '..');
const dep = require('../security/dependencies.json').supabase;
test('all pages carry current script hashes and reject unapproved script and native form execution', () => {
  for (const name of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.ok(html.includes(tag(html)), name + ': stale CSP hashes; run node tools/static-security.cjs');
    assert.ok(html.indexOf(tag(html)) < html.indexOf('</head>'), name);
    assert.doesNotMatch(html, /\son\w+\s*=\s*["']/i, name);
    assert.doesNotMatch(html, /supabase-js@2(?:\/\+esm|["'])/, name);
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.doesNotMatch(csp, /'unsafe-inline'/, name);
    assert.doesNotMatch(csp, /img-src[^;]*\shttps:(?:;|\s|$)/, name);
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
      if (m[1] === 'https://challenges.cloudflare.com/turnstile/v0/api.js') continue;
      if (m[1].startsWith('https:')) {
        assert.equal(m[1], dep.url, name);
        assert.ok(m[0].includes('integrity="' + dep.integrity + '"'), name);
        assert.ok(m[0].includes('crossorigin="anonymous"'), name);
      }
    }
  }
});
