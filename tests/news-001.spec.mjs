import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:8765' });

// NEWS-001 browser E2E with deterministic Supabase mock.
// Production Auth/Storage/HTTP still require a separate live acceptance pass.
const mockModule = String.raw`
const articles = [{
  id:'11111111-1111-4111-8111-111111111111',
  title:'公開済みのお知らせ',
  slug:'published-announcement',
  excerpt:'お知らせの概要',
  body_json:{format:'safe-html-v1',html:'<p>本文 <strong>重要</strong></p><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">危険リンク</a>'},
  category_id:'22222222-2222-4222-8222-222222222222',
  status:'published',
  published_at:'2026-10-01T00:00:00Z',
  scheduled_at:null, is_pinned:true, deleted_at:null, updated_at:'2026-10-01T00:00:00.000Z'
}];
window.__externalNewsEdit=()=>{articles[0].title='他の管理者の更新';articles[0].updated_at='2099-01-01T00:00:00.000Z'};
window.__newsStoredArticle=()=>({...articles[0]});
const categories = [{id:'22222222-2222-4222-8222-222222222222',name:'運営情報',sort_order:1,is_active:true}];
const revisions = [], logs = [], media = [];
const admin = new URL(location.href).searchParams.has('mockAdmin');
function query(table) {
 const state={filters:[],limit:100,range:null,write:null};
 const q={
  select(_cols,opts={}){state.count=opts.count==='exact';return q},
  eq(k,v){state.filters.push(x=>x[k]===v);return q},
  is(k,v){state.filters.push(x=>x[k]===v);return q},
  lte(k,v){state.filters.push(x=>x[k]&&x[k]<=v);return q},
  order(){return q},
  range(a,b){state.range=[a,b];return q},
  limit(n){state.limit=n;return q},
  or(v){const parts=v.split(',');if(parts.length===2){const keyword=parts[0].replace('title.ilike.%','').replace(/%$/,'').toLowerCase();state.filters.push(x=>(x.title||'').toLowerCase().includes(keyword)||(x.excerpt||'').toLowerCase().includes(keyword))}return q},
  insert(value){state.write={type:'insert',value};return q},
  update(value){state.write={type:'update',value};return q},
  maybeSingle(){return Promise.resolve(makeResult(true))},
  single(){return Promise.resolve(makeResult(true))},
  then(resolve,reject){return Promise.resolve(makeResult(false)).then(resolve,reject)}
 };
 async function makeResult(single){
  const source=table==='news_articles'?articles:table==='news_categories'?categories:table==='news_article_revisions'?revisions:table==='news_audit_logs'?logs:media;
  if(state.write){
   window.__writeAttempts=(window.__writeAttempts||0)+1;
   if(window.__holdWrite)await new Promise(resolve=>window.__releaseWrite=resolve);
   if(window.__throwWrite)throw new Error('TEST_NETWORK_FAILURE');
   if(new URL(location.href).searchParams.has('mockWriteError'))return {data:null,error:{message:'TEST_WRITE_DENIED'}};
   (window.__newsWrites ||= []).push({table,...state.write});
   if(state.write.type==='update'){
    const row=source.find(x=>state.filters.every(fn=>fn(x)));
    if(!row)return {data:null,error:null};
    Object.assign(row,state.write.value);
    return {data:{...row},error:null};
   }
   const row={...state.write.value,id:crypto.randomUUID(),deleted_at:null};
   source.push(row);
   return {data:{...row},error:null};
  }
  let found=source.filter(x=>state.filters.every(fn=>fn(x))).map(x=>({...x}));
  const count=found.length;
  if(state.range)found=found.slice(state.range[0],state.range[1]+1);
  else found=found.slice(0,state.limit);
  return {data:single?(found[0]||null):found,count,error:null};
 }
 return q;
}
export function createClient(){
 return {
  from:query,
  auth:{
   async getUser(){return {data:{user:admin?{id:'33333333-3333-4333-8333-333333333333',email:'admin@example.test',app_metadata:{role:'admin'}}:null},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
   async signInWithPassword(){return {error:null}},
   async signOut(){return {error:null}}
  },
  storage:{from(){return {async upload(path){
    window.__uploadedPath=path;
    if(window.__holdUpload)await new Promise(resolve=>window.__releaseUpload=resolve);
    return {error:null}
   },async createSignedUrl(){return {data:{signedUrl:'#'},error:null}}}}}
 };
}
`;
test.beforeEach(async ({page}) => {
 await page.route('**/npm/@supabase/supabase-js@2/+esm', route => route.fulfill({status:200,contentType:'text/javascript',body:mockModule}));
 await page.route('**/functions/v1/news-public-media?**', route => route.fulfill({status:200,contentType:'application/json',body:'[]',headers:{'access-control-allow-origin':'*'}}));
});
test('NEWS一覧に公開記事を表示し検索・カテゴリUIが動く', async ({page}) => {
 await page.goto('/news.html');
 await expect(page.getByRole('heading',{name:'NEWS.'})).toBeVisible();
 await expect(page.getByRole('link',{name:'公開済みのお知らせ'})).toBeVisible();
 await expect(page.getByText('重要',{exact:true})).toBeVisible();
 await page.getByLabel('キーワード').fill('一致しない文字列');
 await page.getByRole('button',{name:'検索'}).click();
 await expect(page.getByText('現在、該当するお知らせはありません。')).toBeVisible();
 await page.getByLabel('キーワード').fill('公開済み');
 await page.getByRole('button',{name:'検索'}).click();
 await expect(page.getByRole('link',{name:'公開済みのお知らせ'})).toBeVisible();
});
test('記事詳細は本文をサニタイズしXSS要素を表示しない', async ({page}) => {
 await page.goto('/news-detail.html?slug=published-announcement');
 await expect(page.getByRole('heading',{name:'公開済みのお知らせ'})).toBeVisible();
 await expect(page.locator('#body strong')).toHaveText('重要');
 await expect(page.locator('#body img')).toHaveCount(0);
 await expect(page.locator('#body script')).toHaveCount(0);
 await expect(page.locator('#body a[href^="javascript:"]')).toHaveCount(0);
});
test('存在しない記事は非表示', async ({page}) => {
 await page.goto('/news-detail.html?slug=not-found');
 await expect(page.getByText('記事が見つかりません。')).toBeVisible();
 await expect(page.locator('#article')).toBeHidden();
});
test('非管理者にはNEWS編集フォームを表示しない', async ({page}) => {
 await page.goto('/news-admin.html');
 await expect(page.getByText('管理者アカウントでログインしてください')).toBeVisible();
 await expect(page.locator('#workspace')).toBeHidden();
});
test('管理者は下書きを保存できる', async ({page}) => {
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.getByLabel('タイトル（必須）').fill('E2Eテスト記事');
 await page.getByLabel('URL識別子（英小文字・数字・ハイフン）').fill('e2e-test');
 await page.locator('#editor').fill('本文テスト');
 await page.getByRole('button',{name:'下書き保存'}).click();
 await expect(page.getByText('下書きを保存しました')).toBeVisible();
});

test('スマートフォン幅でもニュース一覧に横スクロールが発生しない', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/news.html');
 await expect(page.getByRole('link',{name:'公開済みのお知らせ'})).toBeVisible();
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
 expect(width.scroll).toBeLessThanOrEqual(width.view);
});
test('スマートフォン幅でも記事詳細を閲覧できる', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/news-detail.html?slug=published-announcement');
 await expect(page.getByRole('heading',{name:'公開済みのお知らせ'})).toBeVisible();
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
 expect(width.scroll).toBeLessThanOrEqual(width.view);
});

test('公開本文はSVG・イベント属性・難読化URLを除去し安全な書式を維持する', async ({page}) => {
 await page.goto('/news-detail.html?slug=published-announcement');
 const result=await page.evaluate(async()=>{
  const {safeArticleHtml}=await import('/news-public.js');
  const root=safeArticleHtml('<p onclick="window.__xss=1">安全<strong>太字</strong></p><svg onload="window.__xss=1"><a href="javascript:alert(1)">SVG</a></svg><iframe srcdoc="<script>alert(1)</script>"></iframe><math><mtext>危険</mtext></math><a href="java&#x09;script:alert(1)">tab</a><a href="data:text/html,test">data</a><a href="https://example.test/path" onclick="alert(1)">安全リンク</a>');
  document.querySelector('#body').replaceChildren(root);
  return {html:root.innerHTML,unsafe:root.querySelectorAll('svg,iframe,math,script,img,[onclick],[onload]').length,links:[...root.querySelectorAll('a')].map(a=>a.getAttribute('href')),xss:window.__xss||0};
 });
 expect(result.unsafe).toBe(0);
 expect(result.links).toEqual([null,null,'https://example.test/path']);
 expect(result.xss).toBe(0);
 await expect(page.locator('#body strong')).toHaveText('太字');
 await expect(page.locator('#body a[href]')).toHaveAttribute('rel','noopener noreferrer');
});

test('管理者プレビューは危険なリンクとイベント属性を除去する', async ({page}) => {
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#editor').evaluate(el=>{el.innerHTML='<p onclick="alert(1)">確認<strong>強調</strong></p><a href="java&#x09;script:alert(1)">危険</a><a href="https://example.test">安全</a>'});
 await page.getByRole('button',{name:'プレビュー',exact:true}).click();
 await expect(page.locator('#previewBody strong')).toHaveText('強調');
 await expect(page.locator('#previewBody [onclick]')).toHaveCount(0);
 await expect(page.locator('#previewBody a[href]')).toHaveCount(1);
 await expect(page.locator('#previewBody a[href]')).toHaveAttribute('href','https://example.test/');
});

test('保存拒否時は入力内容を保持し再試行ボタンを復旧する', async ({page}) => {
 await page.goto('/news-admin.html?mockAdmin=1&mockWriteError=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.getByLabel('タイトル（必須）').fill('保存失敗テスト');
 await page.locator('#slug').fill('failed-save');
 await page.locator('#editor').fill('失わない本文');
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toContainText('TEST_WRITE_DENIED');
 await expect(page.getByRole('button',{name:'下書き保存',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'公開・予約設定して保存'})).toBeEnabled();
 await expect(page.locator('#title')).toHaveValue('保存失敗テスト');
 await expect(page.locator('#editor')).toHaveText('失わない本文');
 await expect(page.locator('#archiveBtn')).toBeDisabled();
});

test('日本時間の予約日時をUTCへ変換して保存する', async ({page}) => {
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#title').fill('予約テスト');
 await page.locator('#slug').fill('scheduled-test');
 await page.locator('#editor').fill('予約本文');
 await page.locator('#publishAt').fill('2099-01-02T09:30');
 await page.getByRole('button',{name:'公開・予約設定して保存'}).click();
 await expect(page.locator('#saveMessage')).toHaveText('予約投稿を保存しました');
 const write=await page.evaluate(()=>window.__newsWrites.find(w=>w.table==='news_articles'));
 expect(write.value.status).toBe('published');
 expect(write.value.published_at).toBe('2099-01-02T00:30:00.000Z');
 expect(write.value.scheduled_at).toBe(write.value.published_at);
});

test('未保存記事への画像添付を止める', async ({page}) => {
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.getByRole('button',{name:'画像をアップロード',exact:true}).click();
 await expect(page.locator('#imageStatus')).toHaveText('先に記事を下書き保存してください');
});

test('保存待機中は編集切替と二重送信を止める', async ({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#title').fill('遅延保存');
 await page.locator('#slug').fill('delayed-save');
 await page.locator('#editor').fill('保存中の本文');
 await page.evaluate(()=>window.__holdWrite=true);
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__writeAttempts)).toBe(1);
 await expect(page.locator('#newArticle')).toBeDisabled();
 await expect(page.locator('#articles button')).toBeDisabled();
 await expect(page.locator('#title')).toBeDisabled();
 await expect(page.locator('#editor')).toHaveAttribute('contenteditable','false');
 await page.locator('#articleForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(await page.evaluate(()=>window.__writeAttempts)).toBe(1);
 await page.evaluate(()=>window.__releaseWrite());
 await expect(page.locator('#saveMessage')).toHaveText('下書きを保存しました');
 await expect(page.locator('#newArticle')).toBeEnabled();
 await expect(page.locator('#archiveBtn')).toBeEnabled();
 await expect(page.locator('#editor')).toHaveAttribute('contenteditable','true');
});

test('保存通信例外の後も本文を保持して再試行できる', async ({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#title').fill('通信断');
 await page.locator('#slug').fill('network-failure');
 await page.locator('#editor').fill('保持する本文');
 await page.evaluate(()=>window.__throwWrite=true);
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toContainText('TEST_NETWORK_FAILURE');
 await expect(page.locator('#title')).toBeEnabled();
 await expect(page.locator('#editor')).toHaveText('保持する本文');
 await page.evaluate(()=>window.__throwWrite=false);
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toHaveText('下書きを保存しました');
});

test('画像転送中は記事切替を止め同じ記事へ紐付ける', async ({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.locator('#imageUpload').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])});
 await page.evaluate(()=>window.__holdUpload=true);
 await page.locator('#uploadImage').click();
 await expect.poll(()=>page.evaluate(()=>typeof window.__releaseUpload)).toBe('function');
 await expect(page.locator('#newArticle')).toBeDisabled();
 await expect(page.locator('#articles button')).toBeDisabled();
 await expect(page.getByRole('button',{name:'下書き保存',exact:true})).toBeDisabled();
 await page.evaluate(()=>window.__releaseUpload());
 await expect(page.locator('#imageStatus')).toContainText('画像を添付しました');
 const result=await page.evaluate(()=>({path:window.__uploadedPath,write:window.__newsWrites.find(w=>w.table==='news_media')}));
 expect(result.write.value.article_id).toBe('11111111-1111-4111-8111-111111111111');
 expect(result.write.value.storage_path).toBe(result.path);
 expect(result.path.startsWith(result.write.value.article_id+'/')).toBe(true);
 await expect(page.locator('#newArticle')).toBeEnabled();
});

test('アーカイブ通信例外は入力を保持し操作を復旧する', async ({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.evaluate(()=>window.__throwWrite=true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#archiveBtn').click();
 await expect(page.locator('#saveMessage')).toContainText('アーカイブに失敗しました: TEST_NETWORK_FAILURE');
 await expect(page.locator('#title')).toHaveValue('公開済みのお知らせ');
 await expect(page.locator('#archiveBtn')).toBeEnabled();
 await expect(page.locator('#newArticle')).toBeEnabled();
});

test('他の管理者が更新した記事は古い内容で保存できない',async({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.locator('#title').fill('自分の未保存の編集');
 await page.evaluate(()=>window.__externalNewsEdit());
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toContainText('記事が更新・削除されたか');
 await expect(page.locator('#title')).toHaveValue('自分の未保存の編集');
 expect((await page.evaluate(()=>window.__newsStoredArticle())).title).toBe('他の管理者の更新');
 await expect(page.locator('#reload')).toBeEnabled();
 // Refreshing the list alone must not silently grant this stale editor a new version.
 await page.locator('#reload').click();
 await expect(page.locator('#articles strong')).toHaveText('他の管理者の更新');
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toContainText('記事が更新・削除されたか');
 expect((await page.evaluate(()=>window.__newsStoredArticle())).title).toBe('他の管理者の更新');
});

test('他の管理者が更新した記事を古い画面からアーカイブできない',async({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.evaluate(()=>window.__externalNewsEdit());
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#archiveBtn').click();
 await expect(page.locator('#saveMessage')).toContainText('記事が更新・削除されたか');
 const saved=await page.evaluate(()=>window.__newsStoredArticle());
 expect(saved.status).toBe('published');
 expect(saved.deleted_at).toBeNull();
 await expect(page.locator('#archiveBtn')).toBeEnabled();
});

test('保存成功後は返却された更新日時で続けて編集できる',async({page})=>{
 await page.goto('/news-admin.html?mockAdmin=1');
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.locator('#title').fill('一回目');
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect(page.locator('#saveMessage')).toHaveText('下書きを保存しました');
 await expect(page.locator('#title')).toBeEnabled();
 const first=await page.evaluate(()=>window.__newsStoredArticle());
 await page.locator('#title').fill('二回目');
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__newsStoredArticle().title)).toBe('二回目');
 const second=await page.evaluate(()=>window.__newsStoredArticle());
 expect(Date.parse(second.updated_at)).toBeGreaterThan(Date.parse(first.updated_at));
});
