-- Run as database administrator. All temporary row changes and audit records roll back.
begin;
do $test$
declare m record; state text; member_tests integer:=0; request_id uuid; result public.service_requests;
begin
  for m in select user_id,role_key,status from public.team_members where user_id is not null and status='active' loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',m.user_id,'role','authenticated','app_metadata',jsonb_build_object('role','super_admin'))::text,true);
    if private.current_official_role() is distinct from m.role_key then raise exception 'active role mismatch'; end if;
    if m.role_key='super_admin' and not private.has_team_permission('contracts','view') then raise exception 'superadmin permission missing'; end if;
    if private.has_team_permission('finance','invalid') or private.has_team_permission('finance',null) then raise exception 'invalid action allowed'; end if;
    foreach state in array array['inactive','suspended','invited'] loop
      update public.team_members set status=state where user_id=m.user_id;
      if private.current_official_role() is not null or private.is_vocalink_admin() or private.is_vocalink_super_admin() or private.has_team_permission('management','view') then raise exception 'inactive account retained privileges'; end if;
      member_tests:=member_tests+1;
    end loop;
    update public.team_members set status=m.status where user_id=m.user_id;
    if m.role_key in ('admin','super_admin') then
      insert into public.service_requests(name,email,title,description,category,contact_method,admin_note)
        values ('ROLLBACK AUDIT','audit@example.invalid','ROLLBACK AUDIT','Rollback-only memo preservation test','その他','email','keep this memo') returning id into request_id;
      result:=private.admin_update_service_request(request_id,'reviewing',null);
      if result.admin_note is distinct from 'keep this memo' then raise exception 'status update erased memo'; end if;
      result:=private.admin_update_service_request(request_id,'reviewing','');
      if result.admin_note is distinct from '' then raise exception 'explicit memo clear failed'; end if;
    end if;
  end loop;
  if member_tests=0 then raise exception 'no active accounts available for authorization assertions'; end if;
  perform set_config('request.jwt.claims','{}',true);
  if private.current_official_role() is not null or private.is_vocalink_admin() or private.has_team_permission('finance','view') then raise exception 'anonymous privilege allowed'; end if;
  if has_function_privilege('anon','public.current_official_role()','execute') then raise exception 'anonymous role RPC allowed'; end if;
end $test$;
rollback;
select 'authorization and memo assertions passed; all test writes rolled back' as result;
