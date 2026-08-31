-- PRO-04 / Lot 03 — close direct client execution of the registry guard trigger function.
-- PROPOSAL ONLY. This migration changes function ACLs only; it does not alter
-- the function, trigger, registry fields, policies, tables, or business rows.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  v_function_oid oid := to_regprocedure('public.protect_establishment_registry_columns()');
  v_signature_count integer;
  v_acl text[];
  v_trigger_count integer;
  v_dependency_count integer;
  v_scheduled_count integer := 0;
begin
  select count(*)
  into v_signature_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'protect_establishment_registry_columns';

  if v_function_oid is null or v_signature_count <> 1 then
    raise exception using message = 'PRO04_LOT03_SIGNATURE_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_roles owner_role on owner_role.oid = p.proowner
    join pg_language language_row on language_row.oid = p.prolang
    where p.oid = v_function_oid
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prorettype = 'trigger'::regtype
      and p.prokind = 'f'
      and owner_role.rolname = 'postgres'
      and language_row.lanname = 'plpgsql'
      and p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=public']::text[]
      and md5(p.prosrc) = 'aa21b9b769cef6bebd5080027064d356'
      and md5(pg_get_functiondef(p.oid)) = '17e58602c8454c70c160e191e3c3ca9e'
  ) then
    raise exception using message = 'PRO04_LOT03_FUNCTION_DRIFT';
  end if;

  select array_agg(acl_item::text order by acl_item::text)
  into v_acl
  from pg_proc p
  cross join lateral unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
  where p.oid = v_function_oid;

  if v_acl = array[
      '=X/postgres',
      'anon=X/postgres',
      'authenticated=X/postgres',
      'postgres=X/postgres',
      'service_role=X/postgres'
    ]::text[] then
    if not has_function_privilege('public', v_function_oid, 'execute')
       or not has_function_privilege('anon', v_function_oid, 'execute')
       or not has_function_privilege('authenticated', v_function_oid, 'execute')
       or not has_function_privilege('service_role', v_function_oid, 'execute')
       or not has_function_privilege('postgres', v_function_oid, 'execute') then
      raise exception using message = 'PRO04_LOT03_INITIAL_ACL_DRIFT';
    end if;
  elsif v_acl = array['postgres=X/postgres']::text[] then
    if has_function_privilege('public', v_function_oid, 'execute')
       or has_function_privilege('anon', v_function_oid, 'execute')
       or has_function_privilege('authenticated', v_function_oid, 'execute')
       or has_function_privilege('service_role', v_function_oid, 'execute')
       or not has_function_privilege('postgres', v_function_oid, 'execute') then
      raise exception using message = 'PRO04_LOT03_FINAL_ACL_DRIFT';
    end if;
  else
    raise exception using message = 'PRO04_LOT03_ACL_DRIFT';
  end if;

  select count(*)
  into v_trigger_count
  from pg_trigger t
  where not t.tgisinternal
    and t.tgfoid = v_function_oid
    and t.tgname = 'establishments_protect_registry_columns'
    and t.tgrelid = 'public.establishments'::regclass
    and t.tgenabled = 'O'
    and t.tgtype = 19
    and md5(pg_get_triggerdef(t.oid, false)) = 'df0b3d9ff934dfa3e8c918adf4ed6f2d';

  if v_trigger_count <> 1 or (
    select count(*)
    from pg_trigger t
    where not t.tgisinternal and t.tgfoid = v_function_oid
  ) <> 1 then
    raise exception using message = 'PRO04_LOT03_TRIGGER_DRIFT';
  end if;

  select count(*)
  into v_dependency_count
  from pg_depend d
  where d.refclassid = 'pg_proc'::regclass
    and d.refobjid = v_function_oid
    and (
      d.classid = 'pg_policy'::regclass
      or d.classid = 'pg_proc'::regclass
      or d.classid = 'pg_rewrite'::regclass
    );

  if v_dependency_count <> 0
     or exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.oid <> v_function_oid
         and n.nspname not in ('pg_catalog', 'information_schema')
         and p.prosrc ilike '%protect_establishment_registry_columns%'
     )
     or exists (
       select 1
       from pg_policy policy_row
       where coalesce(pg_get_expr(policy_row.polqual, policy_row.polrelid), '')
               ilike '%protect_establishment_registry_columns%'
          or coalesce(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid), '')
               ilike '%protect_establishment_registry_columns%'
     )
     or exists (
       select 1
       from pg_class relation_row
       where relation_row.relkind in ('v', 'm')
         and pg_get_viewdef(relation_row.oid, false)
               ilike '%protect_establishment_registry_columns%'
     ) then
    raise exception using message = 'PRO04_LOT03_DEPENDENCY_DRIFT';
  end if;

  if to_regclass('cron.job') is not null then
    execute
      'select count(*) from cron.job where command ilike $1'
      into v_scheduled_count
      using '%protect_establishment_registry_columns%';
  end if;

  if v_scheduled_count <> 0 then
    raise exception using message = 'PRO04_LOT03_SCHEDULED_DEPENDENCY';
  end if;

  perform set_config('pro04.lot03.function_oid', v_function_oid::text, true);
  perform set_config(
    'pro04.lot03.business_row_count',
    (select count(*)::text from public.establishments),
    true
  );
end
$preflight$;

revoke execute on function public.protect_establishment_registry_columns()
  from public, anon, authenticated, service_role;

do $postcheck$
declare
  v_function_oid oid := to_regprocedure('public.protect_establishment_registry_columns()');
  v_acl text[];
  v_trigger_count integer;
begin
  if v_function_oid is null
     or v_function_oid <> current_setting('pro04.lot03.function_oid')::oid
     or not exists (
       select 1
       from pg_proc p
       join pg_roles owner_role on owner_role.oid = p.proowner
       join pg_language language_row on language_row.oid = p.prolang
       where p.oid = v_function_oid
         and pg_get_function_identity_arguments(p.oid) = ''
         and p.prorettype = 'trigger'::regtype
         and p.prokind = 'f'
         and owner_role.rolname = 'postgres'
         and language_row.lanname = 'plpgsql'
         and p.prosecdef
         and p.provolatile = 'v'
         and p.proconfig = array['search_path=public']::text[]
         and md5(p.prosrc) = 'aa21b9b769cef6bebd5080027064d356'
         and md5(pg_get_functiondef(p.oid)) = '17e58602c8454c70c160e191e3c3ca9e'
     ) then
    raise exception using message = 'PRO04_LOT03_POSTCHECK_FUNCTION_FAILED';
  end if;

  select array_agg(acl_item::text order by acl_item::text)
  into v_acl
  from pg_proc p
  cross join lateral unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
  where p.oid = v_function_oid;

  if v_acl <> array['postgres=X/postgres']::text[]
     or has_function_privilege('public', v_function_oid, 'execute')
     or has_function_privilege('anon', v_function_oid, 'execute')
     or has_function_privilege('authenticated', v_function_oid, 'execute')
     or has_function_privilege('service_role', v_function_oid, 'execute')
     or not has_function_privilege('postgres', v_function_oid, 'execute') then
    raise exception using message = 'PRO04_LOT03_POSTCHECK_ACL_FAILED';
  end if;

  select count(*)
  into v_trigger_count
  from pg_trigger t
  where not t.tgisinternal
    and t.tgfoid = v_function_oid
    and t.tgname = 'establishments_protect_registry_columns'
    and t.tgrelid = 'public.establishments'::regclass
    and t.tgenabled = 'O'
    and t.tgtype = 19
    and md5(pg_get_triggerdef(t.oid, false)) = 'df0b3d9ff934dfa3e8c918adf4ed6f2d';

  if v_trigger_count <> 1 or (
    select count(*) from pg_trigger t
    where not t.tgisinternal and t.tgfoid = v_function_oid
  ) <> 1 then
    raise exception using message = 'PRO04_LOT03_POSTCHECK_TRIGGER_FAILED';
  end if;

  if (select count(*) from public.establishments)
       <> current_setting('pro04.lot03.business_row_count')::bigint then
    raise exception using message = 'PRO04_LOT03_BUSINESS_ROWS_CHANGED';
  end if;
end
$postcheck$;

commit;
