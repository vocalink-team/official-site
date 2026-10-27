// NEWS-001 public renderer. The database RLS is the authoritative publication boundary.
import {createClient} from './news-client.js?v=2.25.6';
export const sb=createClient('https://qvxoxrzvxyyribqjnpkb.supabase.co','sb_publishable_1zOA0YpTtJkNYsmm4zXxsA_wSJpdHKe',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export const formatJst=value=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI','H2','H3','BLOCKQUOTE','A']);
export function safeArticleHtml(html){
 const doc=new DOMParser().parseFromString('<div>'+String(html||'')+'</div>','text/html');
 const output=document.createElement('div');
 function appendSafe(from,to){
  for(const node of from.childNodes){
   if(node.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(node.textContent));continue}
   if(node.nodeType!==Node.ELEMENT_NODE)continue;
   const tag=node.tagName;
   if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','IMG','TEMPLATE'].includes(tag))continue;
   const target=allowed.has(tag)?document.createElement(tag.toLowerCase()):document.createDocumentFragment();
   if(tag==='A'){
    try{const u=new URL(node.getAttribute('href')||'',location.href);
     if(['https:','http:'].includes(u.protocol)){target.setAttribute('href',u.href);target.setAttribute('rel','noopener noreferrer');target.setAttribute('target','_blank')}
    }catch{}
   }
   appendSafe(node,target);to.append(target);
  }
 }
 appendSafe(doc.body.firstElementChild,output);
 return output;
}
export function articleCard(article,categories){
 const item=document.createElement('article');item.className='news-card';
 const meta=document.createElement('div');meta.className='news-meta';
 const date=document.createElement('time');date.dateTime=article.published_at;date.textContent=formatJst(article.published_at);meta.append(date);
 if(article.is_pinned){const badge=document.createElement('strong');badge.className='pin';badge.textContent='重要';meta.append(badge)}
 const cat=categories.get(article.category_id);if(cat){const span=document.createElement('span');span.textContent=cat;meta.append(span)}
 const title=document.createElement('h2');const a=document.createElement('a');a.href='news-detail.html?slug='+encodeURIComponent(article.slug);a.textContent=article.title;title.append(a);
 const excerpt=document.createElement('p');excerpt.textContent=article.excerpt||'';
 item.append(meta,title,excerpt);return item;
}
