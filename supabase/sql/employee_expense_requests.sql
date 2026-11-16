begin;

-- Check the current membership row rather than the legacy administrator fallback.
create function private.is_active_employee()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;
revoke all on function private.is_active_employee() from public, anon;
grant execute on function private.is_active_employee() to authenticated;

create function public.is_active_employee()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_active_employee();
$$;
revoke all on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated;

create table public.employee_expense_requests (
  id uuid primary key,
  applicant_id uuid not null default auth.uid() references auth.users(id),
  spent_on date not null check (spent_on <= (now() at time zone 'Asia/Tokyo')::date),
  category text not null check (category in ('transport','software','production','equipment','other')),
  amount_yen integer not null check (amount_yen between 1 and 999999999),
  payee text not null check (char_length(btrim(payee)) between 1 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  evidence_reference text check (char_length(evidence_reference) <= 300),
  submitted_at timestamptz not null default now()
);
create index employee_expense_requests_applicant_submitted_idx
  on public.employee_expense_requests (applicant_id, submitted_at desc);

alter table public.employee_expense_requests enable row level security;
revoke all on public.employee_expense_requests from public, anon, authenticated;
grant select (id, spent_on, category, amount_yen, payee, purpose, evidence_reference, submitted_at),
  insert (id, spent_on, category, amount_yen, payee, purpose, evidence_reference)
  on public.employee_expense_requests to authenticated;

create policy expense_request_own_read on public.employee_expense_requests
  for select to authenticated
  using ((select private.is_active_employee()) and applicant_id = (select auth.uid()));

create policy expense_request_own_submit on public.employee_expense_requests
  for insert to authenticated
  with check ((select private.is_active_employee()) and applicant_id = (select auth.uid()));

notify pgrst, 'reload schema';
commit;
