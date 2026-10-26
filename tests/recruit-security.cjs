const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/submit-team-application-secure/index.ts'),'utf8').replace(/^import .*;\n/gm,''));
function harness(overrides={}){
 let handler,inserted=0;
 const db={rpc:async()=>({data:overrides.rateAllowed!==false,error:null}),from:()=>({insert:()=>{inserted++;return{select:()=>({single:async()=>({data:{id:'test-only',created_at:'2026-10-26',name:'Test',email:'test@example.invalid',role:'Web Developer'},error:null})})}}})};
 vm.runInNewContext(source,{Deno:{env:{get:n=>n==='DISCORD_APPLICATION_WEBHOOK_URL'?undefined:'test-only'},serve:h=>handler=h},createClient:()=>db,Request,Response,URL,URLSearchParams,AbortSignal,TextEncoder,crypto:globalThis.crypto,console,fetch:async()=>new Response(JSON.stringify({success:true,hostname:overrides.hostname||'www.vocalink-team.com',action:overrides.action||'recruit'}),{status:200})});
 return{handler,get inserted(){return inserted}};
}
const body={name:'Test',email:'test@example.invalid',role:'Web Developer',motivation:'Isolated test',consent:true,turnstile_token:'fake-token-used-only-with-stubs'};
const request=(origin,method='POST',data=body)=>new Request('https://example.invalid',{method,headers:{origin,'content-type':'application/json'},...(method==='OPTIONS'?{}:{body:JSON.stringify(data)})});
for(const origin of ['https://www.vocalink-team.com','https://vocalink-team.github.io'])test('preflight accepts only intended origin '+origin,async()=>{const h=harness();const r=await h.handler(request(origin,'OPTIONS'));assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(h.inserted,0)});
test('untrusted origin is rejected without CORS permission or DB writes',async()=>{const h=harness(),r=await h.handler(request('https://attacker.invalid'));assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);assert.equal(h.inserted,0)});
test('missing verification token is rejected before storage',async()=>{const h=harness(),r=await h.handler(request('https://www.vocalink-team.com','POST',{...body,turnstile_token:''}));assert.equal(r.status,403);assert.equal(h.inserted,0)});
test('verified hostname must match requesting origin',async()=>{const h=harness({hostname:'vocalink-team.github.io'}),r=await h.handler(request('https://www.vocalink-team.com'));assert.equal(r.status,403);assert.equal(h.inserted,0)});
test('verified action must be recruit',async()=>{const h=harness({action:'other'}),r=await h.handler(request('https://www.vocalink-team.com'));assert.equal(r.status,403);assert.equal(h.inserted,0)});
test('valid verification follows the insert path with isolated storage',async()=>{const h=harness(),r=await h.handler(request('https://www.vocalink-team.com'));assert.equal(r.status,200);assert.equal(h.inserted,1)});
test('rate limit is retained',async()=>{const h=harness({rateAllowed:false}),r=await h.handler(request('https://www.vocalink-team.com'));assert.equal(r.status,429);assert.equal(h.inserted,0)});
