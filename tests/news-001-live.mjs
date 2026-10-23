// Live acceptance test; never used by the mock CI job.
// No service-role key. Each run uses its own article and isolated browser context.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.NEWS_E2E_BASE_URL || 'http://127.0.0.1:8765';
const email = process.env.NEWS_E2E_EMAIL;
const password = process.env.NEWS_E2E_PASSWORD;
if (!email || !password || process.env.NEWS_E2E_ALLOW_PUBLIC_TEST !== 'yes') {
  console.error('Set NEWS_E2E_EMAIL, NEWS_E2E_PASSWORD and NEWS_E2E_ALLOW_PUBLIC_TEST=yes. This test briefly publishes a labelled test article.');
  process.exit(2);
}
assert.equal(new URL(base).hostname, '127.0.0.1', 'Serve the reviewed branch on 127.0.0.1');
const { chromium } = await import('playwright');
const api = 'https://qvxoxrzvxyyribqjnpkb.supabase.co';
const key = 'sb_publishable_1zOA0YpTtJkNYsmm4zXxsA_wSJpdHKe';
const slug = 'news-e2e-' + randomUUID();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(20000);
let articleId = null, mediaId = null, clientReady = false, failed = false;
async function check(label, fn) {
  await fn();
  console.log('PASS ' + label);
}
async function db(operation, args = {}) {
  return page.evaluate(async ({ operation, args }) => {
    const sb = window.__newsLiveClient;
    let result;
    if (operation === 'find') result = await sb.from('news_articles').select('id').eq('slug', args.slug).maybeSingle();
    if (operation === 'media') result = await sb.from('news_media').select('id,storage_path').eq('article_id', args.id);
    if (operation === 'history') result = await sb.from('news_article_revisions').select('revision_no').eq('article_id', args.id);
    if (operation === 'archive') result = await sb.from('news_articles').update({status:'archived',deleted_at:new Date().toISOString()}).eq('id', args.id).select('id').single();
    if (operation === 'removeImages') {
      const files = await sb.storage.from('news-images').list(args.id, {limit:100});
      if (files.error) throw new Error('Storage listing failed');
      if (files.data.length) {
        const removed = await sb.storage.from('news-images').remove(files.data.map(f=>args.id+'/'+f.name));
        if (removed.error) throw new Error('Storage cleanup failed');
      }
      result = await sb.from('news_media').delete().eq('article_id', args.id);
    }
    if (!result || result.error) throw new Error('Live DB operation failed: '+operation);
    return result.data;
  }, {operation,args});
}
async function gateway(expected) {
  for (const query of ['article='+articleId,'id='+mediaId]) {
    const r = await context.request.get(api+'/functions/v1/news-public-media?'+query);
    assert.equal(r.status(),expected,'Gateway '+query);
    assert.equal(r.headers()['cache-control'],'no-store');
    assert.equal(r.headers()['x-content-type-options'],'nosniff');
    if (expected===200 && query.startsWith('id=')) {
      assert.match(r.headers()['content-type'],/^image\/png/);
      assert.deepEqual(await r.body(),png);
    }
  }
}
try {
  await page.goto(base+'/news-admin.html');
  await page.locator('#login').waitFor({state:'visible'});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#loginForm button').click();
  await check('real administrator login',async()=>page.locator('#workspace').waitFor({state:'visible'}));
  await page.evaluate(async ({api,key})=>{
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    window.__newsLiveClient=createClient(api,key);
    const {data,error}=await window.__newsLiveClient.auth.getUser();
    if(error || !['admin','super_admin'].includes(data.user?.app_metadata?.role))throw new Error('Administrator verification failed');
  },{api,key});
  clientReady=true;
  await page.locator('#title').fill('[動作確認] NEWS自動テスト '+slug);
  await page.locator('#slug').fill(slug);
  await page.locator('#editor').fill('動作確認用の記事です。試験終了後に自動アーカイブします。');
  await page.getByRole('button',{name:'下書き保存',exact:true}).click();
  await page.getByText('下書きを保存しました',{exact:true}).waitFor();
  articleId=(await db('find',{slug})).id;
  console.log('TEST_ARTICLE_ID '+articleId);
  await page.locator('#imageUpload').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
  await page.locator('#uploadImage').click();
  await page.getByText('画像を添付しました。公開済み記事では画像が表示されます。公開前の記事の画像は非公開です。',{exact:true}).waitFor();
  mediaId=(await db('media',{id:articleId}))[0].id;
  await check('draft image denied',()=>gateway(404));
  await page.locator('#publishAt').fill('2099-01-02T09:30');
  await page.getByRole('button',{name:'公開・予約設定して保存'}).click();
  await page.getByText('予約投稿を保存しました',{exact:true}).waitFor();
  await check('future image denied',()=>gateway(404));
  await page.locator('#publishAt').fill('2020-01-01T09:00');
  await page.getByRole('button',{name:'公開・予約設定して保存'}).click();
  await page.getByText('記事を公開状態で保存しました',{exact:true}).waitFor();
  await check('published PNG bytes and headers',()=>gateway(200));
  const visitor=await browser.newContext();
  try {
    const publicPage=await visitor.newPage();
    await publicPage.goto(base+'/news-detail.html?slug='+slug);
    await publicPage.locator('#article').waitFor({state:'visible'});
    await publicPage.locator('#gallery img').waitFor();
    await publicPage.waitForFunction(()=>{const img=document.querySelector('#gallery img');return img?.complete&&img.naturalWidth>0});
    console.log('PASS anonymous browser image rendering');
  } finally {await visitor.close()}
  await check('revision history recorded',async()=>assert.ok((await db('history',{id:articleId})).length>=3));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#archiveBtn').click();
  await page.waitForFunction(()=>document.querySelector('#archiveBtn').disabled);
  await check('archived image denied',()=>gateway(404));
} catch {
  // Do not print Playwright call logs, which may contain typed credentials.
  failed=true;
  console.error('FAIL live acceptance. Credentials and browser traces are intentionally omitted.');
} finally {
  if (clientReady) {
    try {
      articleId ||= (await db('find',{slug}))?.id;
      if (articleId) {
        await db('archive',{id:articleId});
        await db('removeImages',{id:articleId});
        if (mediaId) await gateway(404);
        assert.equal((await db('media',{id:articleId})).length,0);
        console.log('CLEANUP archived article; removed test images. Article/revision/audit records retained: '+articleId);
      }
      await page.evaluate(()=>window.__newsLiveClient.auth.signOut({scope:'local'}));
    } catch {
      failed=true;
      console.error('CLEANUP_FAILED: inspect this exact test slug: '+slug);
    }
  }
  await context.close();
  await browser.close();
}
process.exitCode=failed?1:0;
