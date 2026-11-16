-- Applied on 2026-10-23; NEWS-001 public media integrity.
alter table public.news_media alter column article_id set not null;
alter table public.news_media add constraint news_media_article_path_matches
check (storage_path like article_id::text || '/%' and position('/../' in '/' || storage_path || '/') = 0);
alter table public.news_media add constraint news_media_safe_image_mime
check (mime_type in ('image/jpeg','image/png','image/webp'));
create index if not exists news_media_article_created_idx on public.news_media(article_id,created_at);
create index if not exists news_articles_public_feed_idx on public.news_articles(is_pinned desc,published_at desc)
where status='published' and deleted_at is null;

-- Follow-up migration news_001_media_path_validation_fix_20261023
-- replaced the initial regular expression with the deterministic position() check above.
