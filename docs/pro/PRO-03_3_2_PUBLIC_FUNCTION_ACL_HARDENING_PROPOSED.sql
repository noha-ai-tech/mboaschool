-- PRO-03.3.2 — PROPOSED ONLY / NOT EXECUTED
-- Remove implicit PUBLIC execution while preserving only required explicit roles.

begin;

-- Trigger-only functions: never client-callable.
revoke execute on function public.check_application_rate_limit()
  from public, anon, authenticated, service_role;
revoke execute on function public.enforce_admission_initial_status()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_admission_tracking_code()
  from public, anon, authenticated, service_role;
revoke execute on function public.sync_legacy_application_status()
  from public, anon, authenticated, service_role;
revoke execute on function public.touch_admissions_config_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.touch_organization_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.touch_school_page_sections_updated_at()
  from public, anon, authenticated, service_role;

-- Called by the admission tracking trigger. Preserve only explicit application roles.
revoke execute on function public.generate_admission_tracking_code()
  from public, anon, authenticated, service_role;
grant execute on function public.generate_admission_tracking_code()
  to anon, authenticated, service_role;

-- Used inside RLS policies. PUBLIC is replaced by the exact API roles.
revoke execute on function public.is_own_establishment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_own_establishment(uuid)
  to anon, authenticated, service_role;

-- Public search surface and its application-owned accent wrapper.
revoke execute on function public.search_establishments(text, text[], text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_establishments(text, text[], text, text, integer, integer)
  to anon, authenticated, service_role;

revoke execute on function public.f_unaccent(text)
  from public, anon, authenticated, service_role;
grant execute on function public.f_unaccent(text)
  to anon, authenticated, service_role;

-- The four functions owned by the managed `unaccent` extension are not altered
-- here. Gate audits exclude extension-member functions and continue auditing
-- every application-owned function in public/private.

commit;
