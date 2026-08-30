-- PRO-04 / Lot 02 — low-risk search_path hardening.
-- PROPOSAL ONLY. DO NOT EXECUTE WITHOUT EDDY + ARCHITECT APPROVAL.
--
-- Expected function source captured from production:
--   MD5:    9b1889f56258bf9d6554213c05019c76
--   SHA256: 3c6d6c41d6262a20e7c102dbd49bb3383bd86a4138c8a3ab6b9b04a1ec2420a5
-- Only proconfig may transition from NULL to {search_path=""}.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  v_function_oid oid := to_regprocedure(
    'public.touch_school_page_sections_updated_at()'
  )::oid;
  v_named_function_count integer;
  v_trigger_count integer;
  v_dependency_count integer;
  v_trigger_oid oid;
  v_trigger_definition_md5 text;
  v_business_row_count bigint;
begin
  select count(*)
  into v_named_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'touch_school_page_sections_updated_at';

  if v_function_oid is null or v_named_function_count <> 1 then
    raise exception using message = 'PRO04_LOT02_SIGNATURE_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles owner_role on owner_role.oid = p.proowner
    join pg_language lang on lang.oid = p.prolang
    where p.oid = v_function_oid
      and n.nspname = 'public'
      and p.proname = 'touch_school_page_sections_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prokind = 'f'
      and p.pronargs = 0
      and p.pronargdefaults = 0
      and p.prorettype = 'trigger'::regtype
      and lang.lanname = 'plpgsql'
      and owner_role.rolname = 'postgres'
      and not p.prosecdef
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proisstrict
      and not p.proleakproof
      and md5(p.prosrc) = '9b1889f56258bf9d6554213c05019c76'
  ) then
    raise exception using message = 'PRO04_LOT02_FUNCTION_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_function_oid
      and (
        p.proconfig is null
        or p.proconfig = array['search_path=""']::text[]
      )
  ) then
    raise exception using message = 'PRO04_LOT02_STATE_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_function_oid
      and p.proacl = array['postgres=X/postgres']::aclitem[]
      and not exists (
        select 1
        from aclexplode(p.proacl) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
      and not has_function_privilege('anon', v_function_oid, 'EXECUTE')
      and not has_function_privilege(
        'authenticated',
        v_function_oid,
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        v_function_oid,
        'EXECUTE'
      )
      and has_function_privilege('postgres', v_function_oid, 'EXECUTE')
  ) then
    raise exception using message = 'PRO04_LOT02_ACL_DRIFT';
  end if;

  select count(*)
  into v_trigger_count
  from pg_trigger trigger_row
  where trigger_row.tgfoid = v_function_oid
    and not trigger_row.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception using message = 'PRO04_LOT02_TRIGGER_DRIFT';
  end if;

  select trigger_row.oid, md5(pg_get_triggerdef(trigger_row.oid, false))
  into v_trigger_oid, v_trigger_definition_md5
  from pg_trigger trigger_row
  where trigger_row.tgfoid = v_function_oid
    and trigger_row.tgrelid = 'public.school_page_sections'::regclass
    and trigger_row.tgname = 'school_page_sections_touch_updated_at'
    and not trigger_row.tgisinternal
    and trigger_row.tgenabled = 'O'
    -- pg_trigger flags: ROW (1) + BEFORE (2) + UPDATE (16).
    and trigger_row.tgtype = 19
    and trigger_row.tgnargs = 0
    and trigger_row.tgconstraint = 0
    and not trigger_row.tgdeferrable
    and not trigger_row.tginitdeferred
    and trigger_row.tgqual is null;

  if not found then
    raise exception using message = 'PRO04_LOT02_TRIGGER_DRIFT';
  end if;

  select count(*)
  into v_dependency_count
  from pg_depend dependency
  where dependency.refclassid = 'pg_proc'::regclass
    and dependency.refobjid = v_function_oid;

  if v_dependency_count <> 1 or not exists (
    select 1
    from pg_depend dependency
    where dependency.refclassid = 'pg_proc'::regclass
      and dependency.refobjid = v_function_oid
      and dependency.classid = 'pg_trigger'::regclass
      and dependency.objid = v_trigger_oid
      and dependency.deptype = 'n'
  ) then
    raise exception using message = 'PRO04_LOT02_DEPENDENCY_DRIFT';
  end if;

  select count(*)
  into v_business_row_count
  from public.school_page_sections;

  perform set_config('pro04.lot02.function_oid', v_function_oid::text, true);
  perform set_config('pro04.lot02.trigger_oid', v_trigger_oid::text, true);
  perform set_config(
    'pro04.lot02.trigger_definition_md5',
    v_trigger_definition_md5,
    true
  );
  perform set_config(
    'pro04.lot02.business_row_count',
    v_business_row_count::text,
    true
  );
end
$preflight$;

alter function public.touch_school_page_sections_updated_at()
  set search_path = '';

revoke execute on function public.touch_school_page_sections_updated_at()
  from public, anon, authenticated, service_role;

do $postcheck$
declare
  v_function_oid oid := to_regprocedure(
    'public.touch_school_page_sections_updated_at()'
  )::oid;
  v_expected_function_oid oid := nullif(
    current_setting('pro04.lot02.function_oid', true),
    ''
  )::oid;
  v_expected_trigger_oid oid := nullif(
    current_setting('pro04.lot02.trigger_oid', true),
    ''
  )::oid;
  v_expected_trigger_definition_md5 text := current_setting(
    'pro04.lot02.trigger_definition_md5',
    true
  );
  v_expected_business_row_count bigint := nullif(
    current_setting('pro04.lot02.business_row_count', true),
    ''
  )::bigint;
begin
  if v_function_oid is null
    or v_expected_function_oid is null
    or v_function_oid <> v_expected_function_oid
    or (
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'touch_school_page_sections_updated_at'
    ) <> 1
  then
    raise exception using message = 'PRO04_LOT02_POSTCHECK_SIGNATURE_FAILED';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_roles owner_role on owner_role.oid = p.proowner
    join pg_language lang on lang.oid = p.prolang
    where p.oid = v_function_oid
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prokind = 'f'
      and p.pronargs = 0
      and p.pronargdefaults = 0
      and p.prorettype = 'trigger'::regtype
      and lang.lanname = 'plpgsql'
      and owner_role.rolname = 'postgres'
      and not p.prosecdef
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proisstrict
      and not p.proleakproof
      and md5(p.prosrc) = '9b1889f56258bf9d6554213c05019c76'
      and p.proconfig = array['search_path=""']::text[]
  ) then
    raise exception using message = 'PRO04_LOT02_POSTCHECK_FUNCTION_FAILED';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_function_oid
      and p.proacl = array['postgres=X/postgres']::aclitem[]
      and not exists (
        select 1
        from aclexplode(p.proacl) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
      and not has_function_privilege('anon', v_function_oid, 'EXECUTE')
      and not has_function_privilege(
        'authenticated',
        v_function_oid,
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        v_function_oid,
        'EXECUTE'
      )
      and has_function_privilege('postgres', v_function_oid, 'EXECUTE')
  ) then
    raise exception using message = 'PRO04_LOT02_POSTCHECK_ACL_FAILED';
  end if;

  if v_expected_trigger_oid is null
    or v_expected_trigger_definition_md5 is null
    or (
    select count(*)
    from pg_trigger trigger_row
    where trigger_row.tgfoid = v_function_oid
      and not trigger_row.tgisinternal
  ) <> 1
    or not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.oid = v_expected_trigger_oid
      and trigger_row.tgfoid = v_function_oid
      and trigger_row.tgrelid = 'public.school_page_sections'::regclass
      and trigger_row.tgname = 'school_page_sections_touch_updated_at'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 19
      and trigger_row.tgnargs = 0
      and trigger_row.tgconstraint = 0
      and not trigger_row.tgdeferrable
      and not trigger_row.tginitdeferred
      and trigger_row.tgqual is null
      and md5(pg_get_triggerdef(trigger_row.oid, false))
        = v_expected_trigger_definition_md5
  ) then
    raise exception using message = 'PRO04_LOT02_POSTCHECK_TRIGGER_FAILED';
  end if;

  if (
    select count(*)
    from pg_depend dependency
    where dependency.refclassid = 'pg_proc'::regclass
      and dependency.refobjid = v_function_oid
  ) <> 1 or not exists (
    select 1
    from pg_depend dependency
    where dependency.refclassid = 'pg_proc'::regclass
      and dependency.refobjid = v_function_oid
      and dependency.classid = 'pg_trigger'::regclass
      and dependency.objid = v_expected_trigger_oid
      and dependency.deptype = 'n'
  ) then
    raise exception using message = 'PRO04_LOT02_POSTCHECK_DEPENDENCY_FAILED';
  end if;

  if v_expected_business_row_count is null or (
    select count(*)
    from public.school_page_sections
  ) <> v_expected_business_row_count then
    raise exception using message = 'PRO04_LOT02_BUSINESS_ROWS_CHANGED';
  end if;
end
$postcheck$;

commit;
