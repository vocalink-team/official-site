-- Restore only the legacy public form's input columns during an approved rollback.
-- Run before republishing the previous form. Keep the new intake RPC available for cached pages.
revoke insert on public.service_requests from public, anon, authenticated;
revoke insert (id, created_at, name, organization, email, phone, contact_method, category, title,
  description, features, reference_urls, deadline, urgent, budget, materials, notes, status, admin_note)
on public.service_requests from public, anon, authenticated;

grant insert (name, organization, email, phone, contact_method, category, title, description,
  features, reference_urls, deadline, urgent, budget, materials, notes)
on public.service_requests to anon, authenticated;

drop policy if exists "Anyone can submit service requests" on public.service_requests;
create policy "Anyone can submit service requests" on public.service_requests
for insert to anon, authenticated
with check (
  status = 'new' and admin_note is null
  and char_length(btrim(name)) between 1 and 100
  and char_length(btrim(email)) between 3 and 320
  and char_length(btrim(title)) between 1 and 200
  and char_length(btrim(description)) between 1 and 10000
);
