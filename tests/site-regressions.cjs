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
  vm.runInNewContext(scripts.find(m=>m[1].includes("const loader=document.getElementById('loader')"))[1], {document:{getElementById:id=>nodes[id],body:{classList:{remove(){}}}},window:{addEventListener:(k,fn)=>events[k]=fn},setTimeout(){},Math});
  assert.equal(typeof events.load,'function');
  assert.equal(typeof nodes.scopeWrap.pointermove,'function');
  nodes.scopeWrap.pointermove({clientX:250,clientY:200});
  assert.match(nodes.scope.style.transform,/translate/);
});
function inlineScripts(file){return [...fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);}
test('finance ledger renders hostile DB strings as text',async()=>{
  const elements={},node=id=>elements[id]??={textContent:'',innerHTML:'',classList:{add(){},remove(){}},addEventListener(){}};
  const hostile='<img src=x onerror="alert(1)">&\'"';
  const row={transaction_date:hostile,transaction_type:'income',category:hostile,title:hostile,amount:100,payment_status:hostile};
  const sb={auth:{getSession:async()=>({data:{session:null}})},from:()=>({select:()=>({order:async()=>({data:[row],error:null})})})};
  const context={supabase:{createClient:()=>sb},document:{getElementById:node,querySelectorAll:()=>[]},console,Number,Date};
  vm.createContext(context);vm.runInContext(inlineScripts('finance.html').at(-1),context);await context.load();
  assert.ok(!elements.rows.innerHTML.includes('<img'));
  assert.ok(elements.rows.innerHTML.includes('&lt;img'));
  assert.ok(elements.rows.innerHTML.includes('&#39;&quot;'));
});
test('admin ignores stale superadmin metadata when canonical role is revoked',async()=>{
  const admin=inlineScripts('admin.html').at(-1);
  const fn=admin.slice(admin.indexOf('async function requireAdmin()'),admin.indexOf('async function loadRequests()'));
  const nodes={},node=id=>nodes[id]??={textContent:'',classList:{added:[],removed:[],add(x){this.added.push(x)},remove(x){this.removed.push(x)}}};
  let signedOut=false;
  const ctx={sb:{auth:{getUser:async()=>({data:{user:{email:'test@example.invalid',app_metadata:{role:'super_admin'}}},error:null}),signOut:async()=>signedOut=true},rpc:async()=>({data:null,error:null})},$:node};
  vm.createContext(ctx);vm.runInContext(fn,ctx);assert.equal(await ctx.requireAdmin(),false);assert.equal(signedOut,true);assert.ok(!nodes['#app']);
});
test('admin accepts a verified active administrator from canonical RPC',async()=>{
  const admin=inlineScripts('admin.html').at(-1),fn=admin.slice(admin.indexOf('async function requireAdmin()'),admin.indexOf('async function loadRequests()'));
  const nodes={},node=id=>nodes[id]??={textContent:'',classList:{add(){},remove(){}}};
  const ctx={sb:{auth:{getUser:async()=>({data:{user:{email:'test@example.invalid'}},error:null})},rpc:async()=>({data:'super_admin',error:null})},$:node};
  vm.createContext(ctx);vm.runInContext(fn,ctx);assert.equal(await ctx.requireAdmin(),true);assert.match(nodes['#who'].textContent,/super_admin/);
});
