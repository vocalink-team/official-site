// Publish only website files. Tests, repository metadata and CI configuration stay out.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const out = path.join(root, '_site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const name of fs.readdirSync(root)) {
  if (/\.(html|css|js)$/.test(name) || ['VERSION.json', 'robots.txt', 'sitemap.xml', 'CNAME'].includes(name)) {
    fs.copyFileSync(path.join(root, name), path.join(out, name));
  }
}
for (const name of ['index.html', 'admin.html', 'recruit.html', 'VERSION.json', 'CNAME', 'robots.txt', 'sitemap.xml']) {
  if (!fs.existsSync(path.join(out, name))) throw new Error('Missing published file: ' + name);
}
console.log('Prepared', fs.readdirSync(out).length, 'public files.');
