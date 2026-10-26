const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const dependency = require('../security/dependencies.json').supabase;
const hash = text => "'sha256-" + crypto.createHash('sha256').update(text).digest('base64') + "'";
function policy(html) {
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\bsrc\s*=/.test(m[1]) && m[2].trim() && !/application\/ld\+json/.test(m[1]))
    .map(m => hash(m[2].replace(/\r\n?/g, '\n')));
  return ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "form-action 'none'",
    "script-src 'self' " + dependency.url + ' https://challenges.cloudflare.com ' + [...new Set(hashes)].join(' '),
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
    "font-src 'self' data:", "connect-src 'self' https://qvxoxrzvxyyribqjnpkb.supabase.co wss://qvxoxrzvxyyribqjnpkb.supabase.co https://raw.githubusercontent.com https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com", "worker-src 'self' blob:"].join('; ');
}
const tag = html => '<meta http-equiv="Content-Security-Policy" content="' + policy(html) + '">';
if (require.main === module) {
  for (const name of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
    const file = path.join(root, name);
    let html = fs.readFileSync(file, 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/gi, '');
    html = html.replace(/(<meta charset="utf-8">)/i, '$1' + tag(html));
    if (!html.includes('name="referrer"')) html = html.replace('</head>', '<meta name="referrer" content="strict-origin-when-cross-origin"></head>');
    fs.writeFileSync(file, html);
  }
}
module.exports = { policy, tag };
