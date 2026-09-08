-- PRO-05.2 — Admission tracking oracle hardening (PROPOSED, NOT EXECUTED)
-- Local preparation only. Do not apply without Eddy + architect approval and
-- a fresh read-only production snapshot.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

lock table public.applications in access share mode;
lock table public.establishments in access share mode;

do $pro05_2_preflight$
declare
  v_function_oid oid := to_regprocedure(
    'public.get_admission_by_tracking(text,text)'
  );
  v_initial boolean := false;
  v_final boolean := false;
  v_overload_count integer;
  v_direct_execute_grantees text[];
  v_direct_acl_exact boolean;
begin
  if current_database() is null then
    raise exception 'PRO05_2_PREFLIGHT_DATABASE_CONTEXT_MISSING';
  end if;

  if to_regnamespace('private') is null then
    raise exception 'PRO05_2_PREFLIGHT_PRIVATE_SCHEMA_MISSING';
  end if;

  if has_schema_privilege('anon', 'private', 'usage')
     or has_schema_privilege('authenticated', 'private', 'usage')
     or has_schema_privilege('service_role', 'private', 'usage') then
    raise exception 'PRO05_2_PREFLIGHT_PRIVATE_SCHEMA_EXPOSED';
  end if;

  if v_function_oid is null then
    raise exception 'PRO05_2_PREFLIGHT_FUNCTION_MISSING';
  end if;

  select count(*)
  into v_overload_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admission_by_tracking';

  if v_overload_count <> 1 then
    raise exception 'PRO05_2_PREFLIGHT_FUNCTION_OVERLOAD_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles owner_role on owner_role.oid = p.proowner
    where p.oid = v_function_oid
      and n.nspname = 'public'
      and owner_role.rolname = 'postgres'
      and p.prokind = 'f'
      and p.proretset
      and p.prorettype = 'record'::regtype
      and p.pronargs = 2
      and p.pronargdefaults = 0
      and p.proargtypes = '25 25'::oidvector
      and p.proallargtypes = array[
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'timestamptz'::regtype::oid,
        'public.admission_status'::regtype::oid,
        'text'::regtype::oid
      ]::oid[]
      and p.proargmodes = array[
        'i'::"char",
        'i'::"char",
        't'::"char",
        't'::"char",
        't'::"char",
        't'::"char",
        't'::"char",
        't'::"char"
      ]::"char"[]
      and p.proargnames = array[
        'p_tracking_code',
        'p_phone',
        'establishment_name',
        'student_name',
        'desired_level',
        'submitted_at',
        'status',
        'parent_message'
      ]::text[]
      and p.prosecdef
  ) then
    raise exception 'PRO05_2_PREFLIGHT_FUNCTION_SIGNATURE_OR_OWNER_DRIFT';
  end if;

  if to_regprocedure('pg_catalog.sha256(bytea)') is null
     or to_regprocedure('pg_catalog.convert_to(text,name)') is null then
    raise exception 'PRO05_2_PREFLIGHT_HASH_PRIMITIVE_MISSING';
  end if;

  if not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.applications'::regclass
      and a.attname in (
        'tracking_code',
        'parent_phone',
        'establishment_id',
        'full_student_name',
        'student_first_name',
        'student_last_name',
        'desired_level',
        'created_at',
        'admission_status',
        'parent_message'
      )
      and not a.attisdropped
    group by a.attrelid
    having count(*) = 10
  ) then
    raise exception 'PRO05_2_PREFLIGHT_APPLICATION_COLUMNS_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.establishments'::regclass
      and a.attname in ('id', 'name')
      and not a.attisdropped
    group by a.attrelid
    having count(*) = 2
  ) then
    raise exception 'PRO05_2_PREFLIGHT_ESTABLISHMENT_COLUMNS_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_am am on am.oid = idx.relam
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attname = 'tracking_code'
     and not a.attisdropped
    where i.indrelid = 'public.applications'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indpred is null
      and i.indexprs is null
      and i.indnkeyatts = 1
      and i.indnatts = 1
      and i.indkey[0] = a.attnum
      and am.amname = 'btree'
  ) then
    raise exception 'PRO05_2_PREFLIGHT_TRACKING_INDEX_MISSING';
  end if;

  if exists (
    select 1
    from public.applications a
    where a.tracking_code is not null
      and (
        a.tracking_code !~ '^E237-[A-HJ-NP-Z2-9]{6}$'
        or a.parent_phone is null
        or a.parent_phone = ''
        or a.parent_phone <> pg_catalog.btrim(a.parent_phone)
        or pg_catalog.octet_length(a.parent_phone) > 64
      )
  ) then
    raise exception 'PRO05_2_PREFLIGHT_EXISTING_TRACKING_INPUT_DRIFT';
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

  select
    l.lanname = 'sql'
    and p.provolatile = 's'
    and p.proconfig = array['search_path=public']::text[]
    and p.prosrc ~* 'from[[:space:]]+public[.]applications'
    and p.prosrc ~* 'join[[:space:]]+public[.]establishments'
    and p.prosrc ~* 'a[.]tracking_code[[:space:]]*=[[:space:]]*upper'
    and p.prosrc ~* 'a[.]parent_phone[[:space:]]*=[[:space:]]*p_phone'
    and v_direct_acl_exact
    and v_direct_execute_grantees = array[
      'anon', 'authenticated', 'postgres', 'service_role'
    ]::text[]
    and has_function_privilege('anon', p.oid, 'execute')
    and has_function_privilege('authenticated', p.oid, 'execute')
    and has_function_privilege('service_role', p.oid, 'execute')
    and has_function_privilege('postgres', p.oid, 'execute')
    and to_regclass('private.admission_tracking_rate_limits') is null,
    l.lanname = 'plpgsql'
    and p.provolatile = 'v'
    and p.proconfig = array['search_path=""']::text[]
    and p.prosrc like '%PRO05_2_GLOBAL_LIMIT%'
    and p.prosrc like '%private.admission_tracking_rate_limits%'
    and p.prosrc like '%pg_catalog.sha256%'
    and v_direct_acl_exact
    and v_direct_execute_grantees = array[
      'anon', 'authenticated', 'postgres'
    ]::text[]
    and has_function_privilege('anon', p.oid, 'execute')
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('service_role', p.oid, 'execute')
    and has_function_privilege('postgres', p.oid, 'execute')
    and to_regclass('private.admission_tracking_rate_limits') is not null
  into v_initial, v_final
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_function_oid;

  if v_final then
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner_role on owner_role.oid = c.relowner
      where c.oid = 'private.admission_tracking_rate_limits'::regclass
        and n.nspname = 'private'
        and c.relname = 'admission_tracking_rate_limits'
        and c.relkind = 'r'
        and c.relrowsecurity
        and not c.relforcerowsecurity
        and owner_role.rolname = 'postgres'
    ) then
      raise exception 'PRO05_2_PREFLIGHT_FINAL_TABLE_DRIFT';
    end if;

    if (
      select count(*)
      from pg_attribute a
      where a.attrelid = 'private.admission_tracking_rate_limits'::regclass
        and a.attnum > 0
        and not a.attisdropped
    ) <> 5 then
      raise exception 'PRO05_2_PREFLIGHT_FINAL_TABLE_COLUMN_DRIFT';
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
      raise exception 'PRO05_2_PREFLIGHT_FINAL_TABLE_COLUMN_DEFINITION_DRIFT';
    end if;

    if (
      select array_agg(c.conname order by c.conname)
      from pg_constraint c
      where c.conrelid = 'private.admission_tracking_rate_limits'::regclass
    ) <> array[
      'admission_tracking_rate_limits_attempt_count_check',
      'admission_tracking_rate_limits_hash_check',
      'admission_tracking_rate_limits_pkey',
      'admission_tracking_rate_limits_scope_check',
      'admission_tracking_rate_limits_time_check'
    ]::name[] then
      raise exception 'PRO05_2_PREFLIGHT_FINAL_CONSTRAINT_DRIFT';
    end if;

    if not exists (
      select 1
      from pg_index i
      join pg_class idx on idx.oid = i.indexrelid
      join pg_am am on am.oid = idx.relam
      where i.indrelid = 'private.admission_tracking_rate_limits'::regclass
        and idx.relname = 'admission_tracking_rate_limits_pkey'
        and i.indisprimary
        and i.indisunique
        and i.indisvalid
        and i.indisready
        and i.indpred is null
        and i.indexprs is null
        and i.indnkeyatts = 2
        and i.indkey::smallint[] = array[1::smallint, 2::smallint]
        and am.amname = 'btree'
    ) or not exists (
      select 1
      from pg_index i
      join pg_class idx on idx.oid = i.indexrelid
      join pg_am am on am.oid = idx.relam
      where i.indrelid = 'private.admission_tracking_rate_limits'::regclass
        and idx.relname = 'admission_tracking_rate_limits_updated_at_idx'
        and i.indisvalid
        and i.indisready
        and not i.indisunique
        and i.indpred is null
        and i.indexprs is null
        and i.indnkeyatts = 1
        and i.indkey::smallint[] = array[5::smallint]
        and am.amname = 'btree'
    ) then
      raise exception 'PRO05_2_PREFLIGHT_FINAL_INDEX_DRIFT';
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
      raise exception 'PRO05_2_PREFLIGHT_FINAL_TABLE_ACL_OR_POLICY_DRIFT';
    end if;
  end if;

  if v_initial = v_final then
    raise exception 'PRO05_2_PREFLIGHT_STATE_DRIFT';
  end if;
end
$pro05_2_preflight$;

create table if not exists private.admission_tracking_rate_limits (
  scope text not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  updated_at timestamptz not null,
  constraint admission_tracking_rate_limits_pkey
    primary key (scope, subject_hash),
  constraint admission_tracking_rate_limits_scope_check
    check (scope in ('global', 'tracking_code')),
  constraint admission_tracking_rate_limits_hash_check
    check (pg_catalog.octet_length(subject_hash) = 32),
  constraint admission_tracking_rate_limits_attempt_count_check
    check (attempt_count > 0),
  constraint admission_tracking_rate_limits_time_check
    check (window_started_at <= updated_at)
);

alter table private.admission_tracking_rate_limits owner to postgres;
alter table private.admission_tracking_rate_limits enable row level security;

revoke all privileges on table private.admission_tracking_rate_limits
  from public, anon, authenticated, service_role;

create index if not exists admission_tracking_rate_limits_updated_at_idx
  on private.admission_tracking_rate_limits using btree (updated_at);

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
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  -- PRO05_2_GLOBAL_LIMIT: protects the database and bounds broad enumeration.
  c_global_limit constant integer := 300;
  c_global_window constant interval := interval '1 minute';
  c_tracking_limit constant integer := 10;
  c_tracking_window constant interval := interval '15 minutes';
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_code text;
  v_global_count integer;
  v_tracking_count integer;
  v_global_hash bytea := pg_catalog.sha256(
    pg_catalog.convert_to('PRO05.2:admission-tracking:global', 'UTF8')
  );
  v_tracking_hash bytea;
begin
  -- Fail closed without revealing whether code, phone, or rate limit failed.
  if p_tracking_code is null
     or p_phone is null
     or pg_catalog.octet_length(p_tracking_code) > 64
     or pg_catalog.octet_length(p_phone) > 64
     or p_phone = ''
     or p_phone <> pg_catalog.btrim(p_phone) then
    return;
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(p_tracking_code));

  if v_code !~ '^E237-[A-HJ-NP-Z2-9]{6}$' then
    return;
  end if;

  insert into private.admission_tracking_rate_limits as rate (
    scope,
    subject_hash,
    window_started_at,
    attempt_count,
    updated_at
  ) values (
    'global',
    v_global_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, subject_hash) do update
  set window_started_at = case
        when rate.window_started_at <= excluded.updated_at - c_global_window
          then excluded.window_started_at
        else rate.window_started_at
      end,
      attempt_count = case
        when rate.window_started_at <= excluded.updated_at - c_global_window
          then 1
        else rate.attempt_count + 1
      end,
      updated_at = excluded.updated_at
  returning attempt_count into v_global_count;

  if v_global_count > c_global_limit then
    return;
  end if;

  v_tracking_hash := pg_catalog.sha256(
    pg_catalog.convert_to(v_code, 'UTF8')
  );

  -- Bound stale bucket retention without storing a raw code or phone number.
  with stale as (
    select bucket.ctid
    from private.admission_tracking_rate_limits bucket
    where bucket.scope = 'tracking_code'
      and bucket.updated_at < v_now - interval '1 hour'
    order by bucket.updated_at
    limit 64
    for update skip locked
  )
  delete from private.admission_tracking_rate_limits bucket
  using stale
  where bucket.ctid = stale.ctid;

  insert into private.admission_tracking_rate_limits as rate (
    scope,
    subject_hash,
    window_started_at,
    attempt_count,
    updated_at
  ) values (
    'tracking_code',
    v_tracking_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, subject_hash) do update
  set window_started_at = case
        when rate.window_started_at <= excluded.updated_at - c_tracking_window
          then excluded.window_started_at
        else rate.window_started_at
      end,
      attempt_count = case
        when rate.window_started_at <= excluded.updated_at - c_tracking_window
          then 1
        else rate.attempt_count + 1
      end,
      updated_at = excluded.updated_at
  returning attempt_count into v_tracking_count;

  if v_tracking_count > c_tracking_limit then
    return;
  end if;

  return query
  select
    e.name,
    coalesce(
      nullif(a.full_student_name, ''),
      pg_catalog.btrim(
        coalesce(a.student_first_name, '') || ' ' ||
        coalesce(a.student_last_name, '')
      )
    ),
    a.desired_level,
    a.created_at,
    a.admission_status,
    a.parent_message
  from public.applications a
  join public.establishments e on e.id = a.establishment_id
  where a.tracking_code = v_code
    and a.parent_phone = p_phone
  limit 1;
end
$function$;

revoke all privileges on function public.get_admission_by_tracking(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admission_by_tracking(text, text)
  to anon, authenticated;

do $pro05_2_postcheck$
declare
  v_function_oid oid := to_regprocedure(
    'public.get_admission_by_tracking(text,text)'
  );
  v_rate_rows_before bigint;
  v_result_count integer;
  v_sample record;
  v_wrong_phone text;
  v_attempt integer;
  v_direct_execute_grantees text[];
  v_direct_acl_exact boolean;
begin
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
    raise exception 'PRO05_2_POSTCHECK_FUNCTION_DRIFT';
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
    raise exception 'PRO05_2_POSTCHECK_FUNCTION_ACL_FAILED';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_roles owner_role on owner_role.oid = c.relowner
    where c.oid = 'private.admission_tracking_rate_limits'::regclass
      and c.relrowsecurity
      and not c.relforcerowsecurity
      and owner_role.rolname = 'postgres'
  ) or exists (
    select 1
    from pg_policy
    where polrelid = 'private.admission_tracking_rate_limits'::regclass
  ) then
    raise exception 'PRO05_2_POSTCHECK_RATE_TABLE_RLS_FAILED';
  end if;

  if exists (
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
    raise exception 'PRO05_2_POSTCHECK_RATE_TABLE_ACL_FAILED';
  end if;

  select count(*)
  into v_rate_rows_before
  from private.admission_tracking_rate_limits;

  select a.tracking_code, a.parent_phone
  into v_sample
  from public.applications a
  where a.tracking_code ~ '^E237-[A-HJ-NP-Z2-9]{6}$'
    and a.parent_phone is not null
    and a.parent_phone <> ''
    and a.parent_phone = pg_catalog.btrim(a.parent_phone)
    and pg_catalog.octet_length(a.parent_phone) <= 64
  order by a.id
  limit 1;

  if found then
    v_wrong_phone := case
      when v_sample.parent_phone = '__PRO05_2_INVALID__' then '__PRO05_2_OTHER__'
      else '__PRO05_2_INVALID__'
    end;

    -- Real anon behavior in a rollback-only subtransaction. All operational
    -- bucket writes below are deliberately discarded by the sentinel.
    begin
      delete from private.admission_tracking_rate_limits;
      execute 'set local role anon';

      select count(*) into v_result_count
      from public.get_admission_by_tracking(
        v_sample.tracking_code,
        v_sample.parent_phone
      );
      if v_result_count <> 1 then
        raise exception 'PRO05_2_POSTCHECK_ANON_VALID_LOOKUP_FAILED';
      end if;

      select count(*) into v_result_count
      from public.get_admission_by_tracking(
        v_sample.tracking_code,
        v_wrong_phone
      );
      if v_result_count <> 0 then
        raise exception 'PRO05_2_POSTCHECK_WRONG_PHONE_ORACLE_FAILED';
      end if;

      for v_attempt in 3..10 loop
        perform *
        from public.get_admission_by_tracking(
          v_sample.tracking_code,
          v_sample.parent_phone
        );
      end loop;

      select count(*) into v_result_count
      from public.get_admission_by_tracking(
        v_sample.tracking_code,
        v_sample.parent_phone
      );
      if v_result_count <> 0 then
        raise exception 'PRO05_2_POSTCHECK_TRACKING_RATE_LIMIT_FAILED';
      end if;

      execute 'reset role';
      raise exception using
        errcode = 'Z5201',
        message = 'PRO05_2_ANON_TEST_ROLLBACK';
    exception
      when sqlstate 'Z5201' then null;
    end;

    begin
      delete from private.admission_tracking_rate_limits;
      execute 'set local role authenticated';

      select count(*) into v_result_count
      from public.get_admission_by_tracking(
        v_sample.tracking_code,
        v_sample.parent_phone
      );
      if v_result_count <> 1 then
        raise exception 'PRO05_2_POSTCHECK_AUTHENTICATED_LOOKUP_FAILED';
      end if;

      execute 'reset role';
      raise exception using
        errcode = 'Z5202',
        message = 'PRO05_2_AUTH_TEST_ROLLBACK';
    exception
      when sqlstate 'Z5202' then null;
    end;
  end if;

  if (select count(*) from private.admission_tracking_rate_limits)
     <> v_rate_rows_before then
    raise exception 'PRO05_2_POSTCHECK_OPERATIONAL_ROWS_CHANGED';
  end if;
end
$pro05_2_postcheck$;

commit;
