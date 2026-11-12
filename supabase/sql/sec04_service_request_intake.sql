-- Prepare the intake RPC before deploying submit-service-request with verify_jwt=false.
create table public.service_request_submission_limits (
  email_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 3)
);

alter table public.service_request_submission_limits enable row level security;
revoke all on public.service_request_submission_limits from public, anon, authenticated;

create function public.submit_service_request(p_email_hash text, p_request jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  checked_at timestamptz := statement_timestamp();
  accepted integer;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid email hash' using errcode = '22023';
  end if;

  insert into public.service_request_submission_limits as limits (email_hash, window_started_at, attempts)
  values (p_email_hash, checked_at, 1)
  on conflict (email_hash) do update
  set window_started_at = case when limits.window_started_at <= checked_at - interval '1 hour'
      then checked_at else limits.window_started_at end,
      attempts = case when limits.window_started_at <= checked_at - interval '1 hour'
      then 1 else limits.attempts + 1 end
  where limits.window_started_at <= checked_at - interval '1 hour' or limits.attempts < 3
  returning attempts into accepted;

  if accepted is null then return false; end if;

  insert into public.service_requests (
    name, organization, email, phone, contact_method, category, title, description,
    features, reference_urls, deadline, urgent, budget, materials, notes, status, admin_note
  ) values (
    p_request->>'name', p_request->>'organization', p_request->>'email', p_request->>'phone',
    p_request->>'contact_method', p_request->>'category', p_request->>'title', p_request->>'description',
    p_request->>'features', p_request->>'reference_urls', (p_request->>'deadline')::date,
    (p_request->>'urgent')::boolean, p_request->>'budget', p_request->>'materials', p_request->>'notes',
    'new', null
  );
  return true;
end;
$$;

revoke all on function public.submit_service_request(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_service_request(text, jsonb) to service_role;
grant select, insert, update on public.service_request_submission_limits to service_role;
grant insert on public.service_requests to service_role;

