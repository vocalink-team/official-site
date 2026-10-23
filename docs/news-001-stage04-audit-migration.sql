-- Applied to Supabase project qvxoxrzvxyyribqjnpkb on 2026-10-23.
-- NEWS-001 Stage 04: atomic revision history and audit logs.
-- Keep migration idempotent for repository replay.
revoke insert, update, delete on public.news_article_revisions, public.news_audit_logs from anon, authenticated;
create or replace function private.news_article_audit_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_actor uuid; v_next integer; v_action text;
begin
 if tg_op = 'DELETE' then
  raise exception 'Hard deletion of news articles is disabled';
 end if;
 v_id := new.id;
 v_actor := auth.uid();
 if tg_op = 'INSERT' then
  v_action := 'create';
 else
  v_action := case
   when new.deleted_at is not null and old.deleted_at is null then 'archive'
   when new.status = 'published' and old.status <> 'published' then 'publish'
   when new.status = 'draft' and old.status <> 'draft' then 'unpublish'
   else 'update' end;
 end if;
 select coalesce(max(revision_no),0)+1 into v_next
 from public.news_article_revisions where article_id = v_id;
 insert into public.news_article_revisions(article_id,revision_no,snapshot_json,edited_by)
 values(v_id,v_next,to_jsonb(new),v_actor);
 insert into public.news_audit_logs(article_id,actor_id,action)
 values(v_id,v_actor,v_action);
 return new;
end $$;
revoke all on function private.news_article_audit_trigger() from public, anon, authenticated;
drop trigger if exists news_article_audit_insert on public.news_articles;
drop trigger if exists news_article_audit_update on public.news_articles;
create trigger news_article_audit_insert after insert on public.news_articles
for each row execute function private.news_article_audit_trigger();
create trigger news_article_audit_update after update on public.news_articles
for each row execute function private.news_article_audit_trigger();
revoke delete on public.news_articles from anon, authenticated;
