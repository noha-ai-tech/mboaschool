-- PRO-04 / Lot 03 rollback — restore the exact validated initial function ACL.
-- PROPOSAL ONLY. Run only after a confirmed functional regression.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  v_function_oid oid := to_regprocedure('public.protect_establishment_registry_columns()');
  v_acl text[];
begin
  if v_function_oid is null or (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'protect_establishment_registry_columns'
  ) <> 1 then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_SIGNATURE_DRIFT';
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
    raise exception using message = 'PRO04_LOT03_ROLLBACK_FUNCTION_DRIFT';
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
    raise exception using message = 'PRO04_LOT03_ROLLBACK_ACL_DRIFT';
  end if;

  if (
    select count(*)
    from pg_trigger t
    where not t.tgisinternal
      and t.tgfoid = v_function_oid
      and t.tgname = 'establishments_protect_registry_columns'
      and t.tgrelid = 'public.establishments'::regclass
      and t.tgenabled = 'O'
      and t.tgtype = 19
      and md5(pg_get_triggerdef(t.oid, false)) = 'df0b3d9ff934dfa3e8c918adf4ed6f2d'
  ) <> 1 or (
    select count(*) from pg_trigger t
    where not t.tgisinternal and t.tgfoid = v_function_oid
  ) <> 1 then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_TRIGGER_DRIFT';
  end if;

  perform set_config('pro04.lot03.rollback_function_oid', v_function_oid::text, true);
  perform set_config(
    'pro04.lot03.rollback_business_row_count',
    (select count(*)::text from public.establishments),
    true
  );
end
$preflight$;

grant execute on function public.protect_establishment_registry_columns()
  to public, anon, authenticated, service_role;
grant execute on function public.protect_establishment_registry_columns()
  to postgres;

do $postcheck$
declare
  v_function_oid oid := to_regprocedure('public.protect_establishment_registry_columns()');
  v_acl text[];
begin
  if v_function_oid is null
     or v_function_oid <> current_setting('pro04.lot03.rollback_function_oid')::oid
     or not exists (
       select 1
       from pg_proc p
       join pg_roles owner_role on owner_role.oid = p.proowner
       join pg_language language_row on language_row.oid = p.prolang
       where p.oid = v_function_oid
         and owner_role.rolname = 'postgres'
         and language_row.lanname = 'plpgsql'
         and p.prosecdef
         and p.provolatile = 'v'
         and p.proconfig = array['search_path=public']::text[]
         and md5(p.prosrc) = 'aa21b9b769cef6bebd5080027064d356'
         and md5(pg_get_functiondef(p.oid)) = '17e58602c8454c70c160e191e3c3ca9e'
     ) then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_POSTCHECK_FUNCTION_FAILED';
  end if;

  select array_agg(acl_item::text order by acl_item::text)
  into v_acl
  from pg_proc p
  cross join lateral unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
  where p.oid = v_function_oid;

  if v_acl <> array[
      '=X/postgres',
      'anon=X/postgres',
      'authenticated=X/postgres',
      'postgres=X/postgres',
      'service_role=X/postgres'
    ]::text[]
     or not has_function_privilege('public', v_function_oid, 'execute')
     or not has_function_privilege('anon', v_function_oid, 'execute')
     or not has_function_privilege('authenticated', v_function_oid, 'execute')
     or not has_function_privilege('service_role', v_function_oid, 'execute')
     or not has_function_privilege('postgres', v_function_oid, 'execute') then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_POSTCHECK_ACL_FAILED';
  end if;

  if (
    select count(*)
    from pg_trigger t
    where not t.tgisinternal
      and t.tgfoid = v_function_oid
      and t.tgname = 'establishments_protect_registry_columns'
      and t.tgrelid = 'public.establishments'::regclass
      and t.tgenabled = 'O'
      and t.tgtype = 19
      and md5(pg_get_triggerdef(t.oid, false)) = 'df0b3d9ff934dfa3e8c918adf4ed6f2d'
  ) <> 1 then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_POSTCHECK_TRIGGER_FAILED';
  end if;

  if (select count(*) from public.establishments)
       <> current_setting('pro04.lot03.rollback_business_row_count')::bigint then
    raise exception using message = 'PRO04_LOT03_ROLLBACK_BUSINESS_ROWS_CHANGED';
  end if;
end
$postcheck$;

commit;
