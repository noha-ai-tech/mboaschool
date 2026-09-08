-- PRO-05.2 — Admission tracking oracle hardening rollback (NOT EXECUTED)
-- Restores the exact pre-PRO-05.2 function behavior and effective ACL. Any
-- operational rate-limit buckets are intentionally discarded with the table.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

lock table public.applications in access share mode;
lock table public.establishments in access share mode;
lock table private.admission_tracking_rate_limits in access exclusive mode;

do $pro05_2_rollback_preflight$
declare
  v_function_oid oid := to_regprocedure(
    'public.get_admission_by_tracking(text,text)'
  );
  v_direct_execute_grantees text[];
  v_direct_acl_exact boolean;
begin
  if v_function_oid is null
     or to_regclass('private.admission_tracking_rate_limits') is null then
    raise exception 'PRO05_2_ROLLBACK_FINAL_STATE_MISSING';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    join pg_roles owner_role on owner_role.oid = p.proowner
    where p.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and l.lanname = 'plpgsql'
      and p.prokind = 'f'
      and p.proretset
      and p.prorettype = 'record'::regtype
      and p.proargtypes = '25 25'::oidvector
      and p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=""']::text[]
      and p.prosrc like '%PRO05_2_GLOBAL_LIMIT%'
      and p.prosrc like '%private.admission_tracking_rate_limits%'
      and p.prosrc like '%pg_catalog.sha256%'
  ) then
    raise exception 'PRO05_2_ROLLBACK_FUNCTION_DRIFT';
  end if;

  select
    coalesce(
      array_agg(
        case
          when acl.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl.grantee)::text
        end
        order by case
          when acl.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl.grantee)::text
        end
      ) filter (where acl.privilege_type = 'EXECUTE'),
      '{}'::text[]
    ),
    coalesce(bool_and(
      acl.privilege_type = 'EXECUTE'
      and not acl.is_grantable
      and pg_get_userbyid(acl.grantor) = 'postgres'
    ), false)
  into v_direct_execute_grantees, v_direct_acl_exact
  from pg_proc direct_p
  cross join lateral aclexplode(
    coalesce(direct_p.proacl, acldefault('f', direct_p.proowner))
  ) acl
  where direct_p.oid = v_function_oid;

  if not v_direct_acl_exact
     or v_direct_execute_grantees is distinct from array[
       'anon', 'authenticated', 'postgres'
     ]::text[]
     or not has_function_privilege('anon', v_function_oid, 'execute')
     or not has_function_privilege('authenticated', v_function_oid, 'execute')
     or has_function_privilege('service_role', v_function_oid, 'execute')
     or not has_function_privilege('postgres', v_function_oid, 'execute') then
    raise exception 'PRO05_2_ROLLBACK_FUNCTION_ACL_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_roles owner_role on owner_role.oid = c.relowner
    where c.oid = 'private.admission_tracking_rate_limits'::regclass
      and c.relkind = 'r'
      and c.relrowsecurity
      and not c.relforcerowsecurity
      and owner_role.rolname = 'postgres'
  ) then
    raise exception 'PRO05_2_ROLLBACK_TABLE_DRIFT';
  end if;

  if (
    select count(*)
    from pg_attribute a
    where a.attrelid = 'private.admission_tracking_rate_limits'::regclass
      and a.attnum > 0
      and not a.attisdropped
  ) <> 5 then
    raise exception 'PRO05_2_ROLLBACK_TABLE_COLUMN_DRIFT';
  end if;

  if exists (
    with expected(attnum, attname, atttypid) as (
      values
        (1::smallint, 'scope'::name, 'text'::regtype::oid),
        (2::smallint, 'subject_hash'::name, 'bytea'::regtype::oid),
        (3::smallint, 'window_started_at'::name, 'timestamptz'::regtype::oid),
        (4::smallint, 'attempt_count'::name, 'integer'::regtype::oid),
        (5::smallint, 'updated_at'::name, 'timestamptz'::regtype::oid)
    )
    select 1
    from expected e
    left join pg_attribute a
      on a.attrelid = 'private.admission_tracking_rate_limits'::regclass
     and a.attnum = e.attnum
     and not a.attisdropped
    where a.attname is distinct from e.attname
       or a.atttypid is distinct from e.atttypid
       or a.attnotnull is distinct from true
  ) then
    raise exception 'PRO05_2_ROLLBACK_TABLE_COLUMN_DEFINITION_DRIFT';
  end if;

  if exists (
    select 1
    from pg_policy
    where polrelid = 'private.admission_tracking_rate_limits'::regclass
  ) or exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as roles(role_name)
    cross join unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) as privileges(privilege_name)
    where has_table_privilege(
      role_name,
      'private.admission_tracking_rate_limits',
      privilege_name
    )
  ) then
    raise exception 'PRO05_2_ROLLBACK_TABLE_ACL_OR_POLICY_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'private.admission_tracking_rate_limits'::regclass
      and c.conname = 'admission_tracking_rate_limits_pkey'
      and c.contype = 'p'
      and c.conkey = array[1::smallint, 2::smallint]
  ) or not exists (
    select 1
    from pg_class idx
    join pg_index i on i.indexrelid = idx.oid
    where i.indrelid = 'private.admission_tracking_rate_limits'::regclass
      and idx.relname = 'admission_tracking_rate_limits_updated_at_idx'
      and i.indisvalid
      and i.indisready
      and not i.indisunique
      and i.indpred is null
      and i.indexprs is null
      and i.indnkeyatts = 1
      and i.indkey::smallint[] = array[5::smallint]
  ) then
    raise exception 'PRO05_2_ROLLBACK_INDEX_OR_CONSTRAINT_DRIFT';
  end if;

  if exists (
    select 1
    from pg_depend d
    where d.refobjid = 'private.admission_tracking_rate_limits'::regclass
      and d.deptype not in ('a', 'i', 'n')
  ) then
    raise exception 'PRO05_2_ROLLBACK_UNEXPECTED_DEPENDENCY';
  end if;
end
$pro05_2_rollback_preflight$;

create or replace function public.get_admission_by_tracking(
  p_tracking_code text,
  p_phone text
)
returns table (
  establishment_name text,
  student_name text,
  desired_level text,
  submitted_at timestamptz,
  status public.admission_status,
  parent_message text
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    e.name,
    coalesce(nullif(a.full_student_name, ''), trim(coalesce(a.student_first_name, '') || ' ' || coalesce(a.student_last_name, ''))),
    a.desired_level,
    a.created_at,
    a.admission_status,
    a.parent_message
  from public.applications a
  join public.establishments e on e.id = a.establishment_id
  where a.tracking_code = upper(trim(p_tracking_code))
    and a.parent_phone = p_phone
  limit 1;
$function$;

revoke all privileges on function public.get_admission_by_tracking(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admission_by_tracking(text, text)
  to anon, authenticated, service_role;

drop table private.admission_tracking_rate_limits restrict;

do $pro05_2_rollback_postcheck$
declare
  v_function_oid oid := to_regprocedure(
    'public.get_admission_by_tracking(text,text)'
  );
  v_direct_execute_grantees text[];
  v_direct_acl_exact boolean;
begin
  if to_regclass('private.admission_tracking_rate_limits') is not null then
    raise exception 'PRO05_2_ROLLBACK_POSTCHECK_TABLE_REMAINS';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    join pg_roles owner_role on owner_role.oid = p.proowner
    where p.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and l.lanname = 'sql'
      and p.prokind = 'f'
      and p.proretset
      and p.prorettype = 'record'::regtype
      and p.proargtypes = '25 25'::oidvector
      and p.prosecdef
      and p.provolatile = 's'
      and p.proconfig = array['search_path=public']::text[]
      and p.prosrc ~* 'from[[:space:]]+public[.]applications'
      and p.prosrc ~* 'join[[:space:]]+public[.]establishments'
      and p.prosrc ~* 'a[.]tracking_code[[:space:]]*=[[:space:]]*upper'
      and p.prosrc ~* 'a[.]parent_phone[[:space:]]*=[[:space:]]*p_phone'
  ) then
    raise exception 'PRO05_2_ROLLBACK_POSTCHECK_FUNCTION_FAILED';
  end if;

  select
    coalesce(
      array_agg(
        case
          when acl.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl.grantee)::text
        end
        order by case
          when acl.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl.grantee)::text
        end
      ) filter (where acl.privilege_type = 'EXECUTE'),
      '{}'::text[]
    ),
    coalesce(bool_and(
      acl.privilege_type = 'EXECUTE'
      and not acl.is_grantable
      and pg_get_userbyid(acl.grantor) = 'postgres'
    ), false)
  into v_direct_execute_grantees, v_direct_acl_exact
  from pg_proc direct_p
  cross join lateral aclexplode(
    coalesce(direct_p.proacl, acldefault('f', direct_p.proowner))
  ) acl
  where direct_p.oid = v_function_oid;

  if not v_direct_acl_exact
     or v_direct_execute_grantees is distinct from array[
       'anon', 'authenticated', 'postgres', 'service_role'
     ]::text[]
     or not has_function_privilege('anon', v_function_oid, 'execute')
     or not has_function_privilege('authenticated', v_function_oid, 'execute')
     or not has_function_privilege('service_role', v_function_oid, 'execute')
     or not has_function_privilege('postgres', v_function_oid, 'execute') then
    raise exception 'PRO05_2_ROLLBACK_POSTCHECK_ACL_FAILED';
  end if;
end
$pro05_2_rollback_postcheck$;

commit;
