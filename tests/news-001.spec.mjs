import { test, expect } from '@playwright/test';

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
  scheduled_at:null, is_pinned:true, deleted_at:null
}];
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
  or(v){const m=/^title\\.ilike\\.%(.+)%\\,excerpt\\.ilike\\.%(.+)%$/.exec(v);if(m){const keyword=m[1].toLowerCase();state.filters.push(x=>(x.title||'').toLowerCase().includes(keyword)||(x.excerpt||'').toLowerCase().includes(keyword))}return q},
  insert(value){state.write={type:'insert',value};return q},
  update(value){state.write={type:'update',value};return q},
  maybeSingle(){return Promise.resolve(makeResult(true))},
  single(){return Promise.resolve(makeResult(true))},
  then(resolve,reject){return Promise.resolve(makeResult(false)).then(resolve,reject)}
 };
 function makeResult(single){
  const source=table==='news_articles'?articles:table==='news_categories'?categories:table==='news_article_revisions'?revisions:table==='news_audit_logs'?logs:media;
  if(state.write){
   const id=articles[0].id;
   if(state.write.type==='insert'&&table==='news_articles')articles.push({...state.write.value,id});
   return {data:{id},error:null};
  }
  let found=source.filter(x=>state.filters.every(fn=>fn(x)));
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
  storage:{from(){return {async upload(){return {error:null}},async createSignedUrl(){return {data:{signedUrl:'#'},error:null}}}}}
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
