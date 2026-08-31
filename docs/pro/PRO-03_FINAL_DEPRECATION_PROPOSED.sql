-- PRO-03 — EXECUTED AND VERIFIED IN PRODUCTION ON 2026-08-21
-- Final gate only. Zero consumers verified before and after execution.

begin;

do $gate$
declare
  policy_consumers integer;
  function_consumers integer;
begin
  select count(*)
  into policy_consumers
  from pg_catalog.pg_policies
  where coalesce(qual, '') ilike '%current_establishment_id%'
     or coalesce(with_check, '') ilike '%current_establishment_id%';

  select count(*)
  into function_consumers
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname <> 'current_establishment_id'
    and pg_catalog.pg_get_functiondef(p.oid) ilike '%current_establishment_id%';

  if policy_consumers <> 0 or function_consumers <> 0 then
    raise exception
      'PRO-03 deprecation blocked: % policy consumers, % function consumers',
      policy_consumers, function_consumers;
  end if;
end
$gate$;

revoke execute on function public.current_establishment_id()
  from public, anon, authenticated, service_role;

drop function public.current_establishment_id() restrict;

commit;
