-- Apply after the new public form is live and a valid submission through the Edge Function succeeds.
revoke insert on public.service_requests from public, anon, authenticated;
revoke insert (id, created_at, name, organization, email, phone, contact_method, category, title,
  description, features, reference_urls, deadline, urgent, budget, materials, notes, status, admin_note)
on public.service_requests from public, anon, authenticated;
drop policy if exists "Anyone can submit service requests" on public.service_requests;
