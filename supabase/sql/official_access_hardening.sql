-- Official-site audit fixes. Existing role matrices and legacy accounts are retained.
-- A linked team_members record is authoritative, including inactive/invited/suspended.
create or replace function private.current_official_role()
returns text language plpgsql stable security definer set search_path = '' as $$
declare member_role text; member_status text; legacy_role text;
begin
  if auth.uid() is null then return null; end if;
  select tm.role_key,tm.status into member_role,member_status
    from public.team_members tm where tm.user_id=auth.uid();
  if found then
    if member_status='active' then return member_role; end if;
    return null;
  end if;
  -- Read current server-owned metadata rather than stale JWT role claims.
  select u.raw_app_meta_data->>'role' into legacy_role from auth.users u where u.id=auth.uid();
  if not found then return null; end if;
  if legacy_role in ('admin','super_admin') then return legacy_role; end if;
  -- profiles.role is not INSERT/UPDATE writable by authenticated clients.
  select p.role into legacy_role from public.profiles p where p.id=auth.uid();
  if legacy_role in ('admin','super_admin') then return legacy_role; end if;
  return null;
end; $$;
revoke all on function private.current_official_role() from public,anon;
grant execute on function private.current_official_role() to authenticated;
create or replace function public.current_official_role()
returns text language sql stable security invoker set search_path = '' as $$
  select private.current_official_role();
$$;
revoke all on function public.current_official_role() from public,anon;
grant execute on function public.current_official_role() to authenticated;
create or replace function private.is_vocalink_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_official_role() in ('admin','super_admin'),false);
$$;
create or replace function private.is_vocalink_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_official_role()='super_admin',false);
$$;
create or replace function private.has_team_permission(p_permission text,p_action text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r text; allowed boolean;
begin
  r:=private.current_official_role();
  if r is null or p_action is null or lower(p_action) not in ('view','create','update','delete') then return false; end if;
  if r='super_admin' then return true; end if;
  select case lower(p_action) when 'create' then can_create when 'update' then can_update when 'delete' then can_delete when 'view' then can_view else false end
    into allowed from public.team_role_permissions where role_key=r and permission_key=p_permission;
  return coalesce(allowed,false);
end; $$;
-- Never allow an ordinary admin to change a super_admin record through a downgrade.
alter policy team_members_update on public.team_members
  using (private.is_vocalink_admin() and (role_key<>'super_admin' or private.is_vocalink_super_admin()))
  with check (private.is_vocalink_admin() and (role_key<>'super_admin' or private.is_vocalink_super_admin()));
-- Convert official-site admin policies to the canonical live account check.
-- Public submission and public-read policies are deliberately untouched.
do $$
declare p record; q text; c text; command text;
begin
  for p in select * from pg_policies where schemaname='public'
    and tablename=any(array['analytics_events','service_requests','team_applications','security_events','service_statuses','news_articles','news_categories','news_media','news_article_revisions','news_audit_logs'])
    and (coalesce(qual,'') like '%app_metadata%' or coalesce(with_check,'') like '%app_metadata%')
  loop
    q:=p.qual; c:=p.with_check;
    if coalesce(q,'') like '%app_metadata%' then q:='private.is_vocalink_admin()'; end if;
    if coalesce(c,'') like '%app_metadata%' then
      c:='private.is_vocalink_admin()';
      if p.tablename='security_events' and p.cmd='INSERT' then c:=c||' AND coalesce(details->>''simulation'',''false'')=''true'''; end if;
      if p.tablename='news_articles' and p.cmd='INSERT' then c:=c||' AND created_by=auth.uid()'; end if;
      if p.tablename='news_article_revisions' and p.cmd='INSERT' then c:=c||' AND edited_by=auth.uid()'; end if;
      if p.tablename='news_audit_logs' and p.cmd='INSERT' then c:=c||' AND actor_id=auth.uid()'; end if;
    end if;
    command:=format('alter policy %I on public.%I',p.policyname,p.tablename);
    if q is not null then command:=command||format(' using (%s)',q); end if;
    if c is not null then command:=command||format(' with check (%s)',c); end if;
    execute command;
  end loop;
end; $$;
create or replace function private.admin_update_service_request(p_id uuid,p_status text,p_admin_note text)
returns public.service_requests language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  if not private.is_vocalink_admin() then raise exception 'admin permission required'; end if;
  if p_status is null or p_status not in ('new','reviewing','quoted','contracted','in_progress','completed','rejected') then raise exception 'invalid status'; end if;
  -- null means status-only update. Empty text still explicitly clears a memo.
  update public.service_requests set status=p_status,admin_note=coalesce(p_admin_note,admin_note)
    where id=p_id returning * into r;
  if not found then raise exception 'service request not found'; end if;
  return r;
end; $$;
create or replace function private.admin_delete_service_request(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare deleted_count integer;
begin
  if not private.is_vocalink_admin() then raise exception 'admin permission required'; end if;
  delete from public.service_requests where id=p_id;
  get diagnostics deleted_count=row_count;
  return deleted_count=1;
end; $$;
revoke all on function private.is_vocalink_admin(),private.is_vocalink_super_admin(),private.has_team_permission(text,text),private.admin_update_service_request(uuid,text,text),private.admin_delete_service_request(uuid) from public,anon;
grant execute on function private.is_vocalink_admin(),private.is_vocalink_super_admin(),private.has_team_permission(text,text),private.admin_update_service_request(uuid,text,text),private.admin_delete_service_request(uuid) to authenticated;
