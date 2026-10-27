-- NEWS-001 schema draft. REVIEW BEFORE APPLYING TO PRODUCTION.
-- Access policies and Storage objects are intentionally NOT deployed by this file.
create table if not exists public.news_categories (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 sort_order integer not null default 0, is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.news_articles (
 id uuid primary key default gen_random_uuid(), title text not null,
 slug text not null unique, excerpt text, body_json jsonb not null default '{}'::jsonb,
 category_id uuid references public.news_categories(id) on delete set null,
 status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
 is_pinned boolean not null default false,
 published_at timestamptz, scheduled_at timestamptz,
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 constraint news_publish_time check (status <> 'published' or published_at is not null)
);
create table if not exists public.news_article_revisions (
 id uuid primary key default gen_random_uuid(), article_id uuid not null references public.news_articles(id),
 revision_no integer not null, snapshot_json jsonb not null,
 edited_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(article_id,revision_no)
);
create table if not exists public.news_audit_logs (
 id uuid primary key default gen_random_uuid(), article_id uuid references public.news_articles(id),
 actor_id uuid references auth.users(id), action text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.news_media (
 id uuid primary key default gen_random_uuid(), article_id uuid references public.news_articles(id),
 storage_path text not null unique, mime_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 created_at timestamptz not null default now()
);
alter table public.news_categories enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_article_revisions enable row level security;
alter table public.news_audit_logs enable row level security;
alter table public.news_media enable row level security;
-- No grants or policies until admin authorization predicate and media delivery are audited.

-- NEWS-001 proposed policies (not yet activated).
-- IMPORTANT: private.is_vocalink_admin() currently also consults profiles.role and
-- team_members.role_key. Verify who can modify those columns before trusting it.
-- Once verified, policies can use (select private.is_vocalink_admin()).
-- Public access: published and non-deleted only; scheduled content is excluded.
-- CREATE POLICY news_articles_public_read ON public.news_articles FOR SELECT TO anon, authenticated
-- USING (status = 'published' AND published_at <= now() AND deleted_at IS NULL);
-- CREATE POLICY news_articles_admin_all ON public.news_articles FOR ALL TO authenticated
-- USING ((select private.is_vocalink_admin()))
-- WITH CHECK ((select private.is_vocalink_admin()));
-- For scheduled posts, transition to published using a trusted scheduled job or
-- a strictly defined computed public predicate. Do not expose scheduled rows directly.
-- For images, use private Storage bucket news-images; upload is admin-only.
-- Public media delivery must verify article visibility on each request.
-- Never generate public signed URLs for draft assets.
