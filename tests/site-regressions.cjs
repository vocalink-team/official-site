const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
test('home retains every navigation destination and a complete footer', () => {
  for (const id of ['about','service','works','request','recruit','contact','policies']) assert.match(home, new RegExp('id="'+id+'"'));
  assert.match(home, /<footer[\s\S]*<\/footer>/);
  assert.doesNotMatch(home, /&sourc\s*\n/);
  for (const m of home.matchAll(/href="#([^"\s]+)"/g)) assert.ok(home.includes('id="'+m[1]+'"'), m[1]);
});
test('home initialization registers load and scope handlers without throwing', () => {
  const scripts = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const events = {}, nodes = {};
  for (const id of ['loader','loaderProgress','loaderPercent','scopeWrap','scope','aimX','aimY']) nodes[id] = {style:{},classList:{add(){}},addEventListener(k,fn){this[k]=fn},getBoundingClientRect(){return {left:0,top:0,width:400}}};
  vm.runInNewContext(scripts.at(-1)[1], {document:{getElementById:id=>nodes[id],body:{classList:{remove(){}}}},window:{addEventListener:(k,fn)=>events[k]=fn},setTimeout(){},Math});
  assert.equal(typeof events.load,'function');
  assert.equal(typeof nodes.scopeWrap.pointermove,'function');
  nodes.scopeWrap.pointermove({clientX:250,clientY:200});
  assert.match(nodes.scope.style.transform,/translate/);
});
