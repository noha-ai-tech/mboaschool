-- PRO-05.1 — anonymous public write lockdown.
-- PROPOSAL ONLY. DO NOT EXECUTE WITHOUT EDDY + ARCHITECT APPROVAL.
--
-- Scope:
--   * public.classes: public read, authenticated owner-only writes.
--   * public.class_announcements: closed; no active consumer.
--   * public.school_dashboard_context: closed; no active consumer.
--
-- No persistent DML. Behavioral truth-table writes are subtransactional and
-- row counts are verified before COMMIT. applications_public_insert is only
-- verified and remains unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Freeze the three write surfaces for the complete preflight/apply/post-check
-- interval. ACCESS SHARE protects the applications policy from concurrent DDL
-- without blocking ordinary application submissions.
lock table
  public.classes,
  public.class_announcements,
  public.school_dashboard_context
in access exclusive mode;

lock table public.applications in access share mode;

do $preflight$
declare
  v_initial_policies boolean;
  v_initial_acl boolean;
  v_final_policies boolean;
  v_final_acl boolean;
  v_owner_a uuid;
  v_school_a uuid;
  v_class_a uuid;
  v_owner_b uuid;
  v_school_b uuid;
begin
  if to_regclass('public.classes') is null
     or to_regclass('public.class_announcements') is null
     or to_regclass('public.school_dashboard_context') is null
     or to_regclass('public.applications') is null
  then
    raise exception using message = 'PRO05_1_TABLE_DRIFT';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.classes'::regclass),
        ('public.class_announcements'::regclass),
        ('public.school_dashboard_context'::regclass)
    ) expected(relid)
    join pg_class table_row on table_row.oid = expected.relid
    where table_row.relowner <> 'postgres'::regrole
       or not table_row.relrowsecurity
       or table_row.relforcerowsecurity
  ) then
    raise exception using message = 'PRO05_1_TABLE_SECURITY_DRIFT';
  end if;

  -- Exact production structure fingerprints captured on 2026-08-24. The lot
  -- changes policies and ACL only; columns, constraints and indexes must not
  -- drift in either the initial or replay state.
  if (
    select md5(string_agg(concat_ws(
      '|', attribute_row.attnum, attribute_row.attname,
      format_type(attribute_row.atttypid, attribute_row.atttypmod),
      attribute_row.attnotnull,
      coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
      attribute_row.attidentity, attribute_row.attgenerated
    ), ';' order by attribute_row.attnum))
    from pg_attribute attribute_row
    left join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.classes'::regclass
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
  ) <> 'dfd1396c5e08f289bf7b0d5d629d60b5'
  or (
    select md5(string_agg(concat_ws(
      '|', constraint_row.conname, constraint_row.contype,
      constraint_row.convalidated,
      pg_get_constraintdef(constraint_row.oid, true)
    ), ';' order by constraint_row.conname))
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.classes'::regclass
  ) <> '88fda4c98f43da1bd55312ac48159446'
  or (
    select md5(string_agg(concat_ws(
      '|', index_row.indexrelid::regclass::text,
      pg_get_indexdef(index_row.indexrelid),
      index_row.indisvalid, index_row.indisready
    ), ';' order by index_row.indexrelid::regclass::text))
    from pg_index index_row
    where index_row.indrelid = 'public.classes'::regclass
  ) <> 'd167c422b40035bfff62fd41fd1f418e'
  then
    raise exception using message = 'PRO05_1_CLASSES_STRUCTURE_DRIFT';
  end if;

  if (
    select md5(string_agg(concat_ws(
      '|', attribute_row.attnum, attribute_row.attname,
      format_type(attribute_row.atttypid, attribute_row.atttypmod),
      attribute_row.attnotnull,
      coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
      attribute_row.attidentity, attribute_row.attgenerated
    ), ';' order by attribute_row.attnum))
    from pg_attribute attribute_row
    left join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.class_announcements'::regclass
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
  ) <> '31010c469210620d7da696998a133a7f'
  or (
    select md5(string_agg(concat_ws(
      '|', constraint_row.conname, constraint_row.contype,
      constraint_row.convalidated,
      pg_get_constraintdef(constraint_row.oid, true)
    ), ';' order by constraint_row.conname))
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.class_announcements'::regclass
  ) <> '1a99942d54a586ed1cfb5c26a88aa921'
  or (
    select md5(string_agg(concat_ws(
      '|', index_row.indexrelid::regclass::text,
      pg_get_indexdef(index_row.indexrelid),
      index_row.indisvalid, index_row.indisready
    ), ';' order by index_row.indexrelid::regclass::text))
    from pg_index index_row
    where index_row.indrelid = 'public.class_announcements'::regclass
  ) <> 'c365bf447127440a19eef12a77929b8b'
  then
    raise exception using message = 'PRO05_1_CLASS_ANNOUNCEMENTS_STRUCTURE_DRIFT';
  end if;

  if (
    select md5(string_agg(concat_ws(
      '|', attribute_row.attnum, attribute_row.attname,
      format_type(attribute_row.atttypid, attribute_row.atttypmod),
      attribute_row.attnotnull,
      coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
      attribute_row.attidentity, attribute_row.attgenerated
    ), ';' order by attribute_row.attnum))
    from pg_attribute attribute_row
    left join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.school_dashboard_context'::regclass
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
  ) <> '6ed69155fc7711444f76aa5b7e680081'
  or (
    select md5(string_agg(concat_ws(
      '|', constraint_row.conname, constraint_row.contype,
      constraint_row.convalidated,
      pg_get_constraintdef(constraint_row.oid, true)
    ), ';' order by constraint_row.conname))
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.school_dashboard_context'::regclass
  ) <> 'a16adb8a0d9e40cb694d79c60ea58e72'
  or (
    select md5(string_agg(concat_ws(
      '|', index_row.indexrelid::regclass::text,
      pg_get_indexdef(index_row.indexrelid),
      index_row.indisvalid, index_row.indisready
    ), ';' order by index_row.indexrelid::regclass::text))
    from pg_index index_row
    where index_row.indrelid = 'public.school_dashboard_context'::regclass
  ) <> 'b7dba2ec80ed026ab4e61dbcb35a85ca'
  then
    raise exception using message = 'PRO05_1_DASHBOARD_CONTEXT_STRUCTURE_DRIFT';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid in (
      'public.classes'::regclass,
      'public.class_announcements'::regclass,
      'public.school_dashboard_context'::regclass
    )
      and not trigger_row.tgisinternal
  ) then
    raise exception using message = 'PRO05_1_TRIGGER_DRIFT';
  end if;

  -- A section linked to a class must belong to the same establishment. Existing
  -- NULL establishment/section rows are allowed and become fail-closed.
  if exists (
    select 1
    from public.classes classroom
    join public.sections section_row on section_row.id = classroom.section_id
    where section_row.etablissement_id is distinct from classroom.establishment_id
  ) then
    raise exception using message = 'PRO05_1_EXISTING_CROSS_SCHOOL_SECTION';
  end if;

  if (
    select count(*)
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'applications'
      and policy_row.policyname = 'applications_public_insert'
      and policy_row.permissive = 'PERMISSIVE'
      and policy_row.roles = array['anon', 'authenticated']::name[]
      and policy_row.cmd = 'INSERT'
      and policy_row.qual is null
      and policy_row.with_check = 'true'
  ) <> 1 then
    raise exception using message = 'PRO05_1_APPLICATIONS_PUBLIC_INSERT_DRIFT';
  end if;

  if (
    select md5(concat_ws(
      '|', policy_row.schemaname, policy_row.tablename,
      policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ))
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'applications'
      and policy_row.policyname = 'applications_public_insert'
  ) <> 'c53e8fd1b720fc18e2dca2c131ad109c'
  then
    raise exception using message = 'PRO05_1_APPLICATIONS_POLICY_CHECKSUM_DRIFT';
  end if;

  select
    (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
     from pg_policies policy_row
     where policy_row.schemaname = 'public'
       and policy_row.tablename = 'classes')
      = 'ad19aadfc8bd8d0f7b326322cf5aa623'
    and (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
     from pg_policies policy_row
     where policy_row.schemaname = 'public'
       and policy_row.tablename = 'class_announcements')
      = '82c5366e02982c43ff95945ded8b928c'
    and (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
     from pg_policies policy_row
     where policy_row.schemaname = 'public'
       and policy_row.tablename = 'school_dashboard_context')
      = '7910f825740bddd3163519aaed6bd630'
  into v_initial_policies;

  select bool_and(
    table_row.relacl::text =
      '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
  )
  into v_initial_acl
  from pg_class table_row
  where table_row.oid in (
    'public.classes'::regclass,
    'public.class_announcements'::regclass,
    'public.school_dashboard_context'::regclass
  );

  select
    (select count(*) from pg_policies policy_row
     where policy_row.schemaname = 'public'
       and policy_row.tablename = 'classes') = 4
    and (select count(*) from pg_policies policy_row
         where policy_row.schemaname = 'public'
           and policy_row.tablename = 'class_announcements') = 0
    and (select count(*) from pg_policies policy_row
         where policy_row.schemaname = 'public'
           and policy_row.tablename = 'school_dashboard_context') = 0
    and exists (
      select 1 from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes'
        and policy_row.policyname = 'classes_public_read'
        and policy_row.permissive = 'PERMISSIVE'
        and policy_row.roles = array['anon', 'authenticated']::name[]
        and policy_row.cmd = 'SELECT'
        and policy_row.qual = 'true'
        and policy_row.with_check is null
    )
    and exists (
      select 1 from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes'
        and policy_row.policyname = 'classes_owner_insert'
        and policy_row.roles = array['authenticated']::name[]
        and policy_row.cmd = 'INSERT'
        and policy_row.qual is null
        and policy_row.with_check is not null
    )
    and exists (
      select 1 from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes'
        and policy_row.policyname = 'classes_owner_update'
        and policy_row.roles = array['authenticated']::name[]
        and policy_row.cmd = 'UPDATE'
        and policy_row.qual is not null
        and policy_row.with_check is not null
    )
    and exists (
      select 1 from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes'
        and policy_row.policyname = 'classes_owner_delete'
        and policy_row.roles = array['authenticated']::name[]
        and policy_row.cmd = 'DELETE'
        and policy_row.qual is not null
        and policy_row.with_check is null
    )
  into v_final_policies;

  if v_final_policies then
    -- Validate structural catalog dependencies, never decompiled SQL text.
    with owner_policies(policy_name) as (
      values
        ('classes_owner_insert'),
        ('classes_owner_update'),
        ('classes_owner_delete')
    ), expected_columns(relid, column_name) as (
      values
        ('public.classes'::regclass, 'establishment_id'),
        ('public.classes'::regclass, 'section_id'),
        ('public.establishments'::regclass, 'id'),
        ('public.establishments'::regclass, 'owner_id'),
        ('public.sections'::regclass, 'id'),
        ('public.sections'::regclass, 'etablissement_id')
    )
    select
      not exists (
        select 1
        from owner_policies owner_policy
        cross join expected_columns expected_column
        where not exists (
          select 1
          from pg_policy policy_row
          join pg_depend dependency_row
            on dependency_row.classid = 'pg_policy'::regclass
           and dependency_row.objid = policy_row.oid
           and dependency_row.refclassid = 'pg_class'::regclass
          join pg_attribute attribute_row
            on attribute_row.attrelid = dependency_row.refobjid
           and attribute_row.attnum = dependency_row.refobjsubid
          where policy_row.polrelid = 'public.classes'::regclass
            and policy_row.polname = owner_policy.policy_name
            and attribute_row.attrelid = expected_column.relid
            and attribute_row.attname = expected_column.column_name
        )
      )
      and not exists (
        select 1
        from owner_policies owner_policy
        where not exists (
          select 1
          from pg_policy policy_row
          join pg_depend dependency_row
            on dependency_row.classid = 'pg_policy'::regclass
           and dependency_row.objid = policy_row.oid
           and dependency_row.refclassid = 'pg_proc'::regclass
          where policy_row.polrelid = 'public.classes'::regclass
            and policy_row.polname = owner_policy.policy_name
            and dependency_row.refobjid = 'auth.uid()'::regprocedure
        )
      )
      and not exists (
        select 1
        from pg_policy policy_row
        join pg_depend dependency_row
          on dependency_row.classid = 'pg_policy'::regclass
         and dependency_row.objid = policy_row.oid
         and dependency_row.refclassid = 'pg_proc'::regclass
        where policy_row.polrelid = 'public.classes'::regclass
          and policy_row.polname in (
            'classes_owner_insert',
            'classes_owner_update',
            'classes_owner_delete'
          )
          and dependency_row.refobjid = 'public.is_platform_admin()'::regprocedure
      )
    into v_final_policies
    ;
  end if;

  -- Exact final ACL: public has no table grant; anon can only SELECT classes;
  -- authenticated can CRUD classes; service_role has no grant on the scope.
  select
    (select coalesce(array_agg(acl_row.privilege_type order by acl_row.privilege_type), array[]::text[])
     from pg_class table_row
     left join lateral aclexplode(table_row.relacl) acl_row on true
     where table_row.oid = 'public.classes'::regclass
       and acl_row.grantee = 'anon'::regrole) = array['SELECT']::text[]
    and (select coalesce(array_agg(acl_row.privilege_type order by acl_row.privilege_type), array[]::text[])
         from pg_class table_row
         left join lateral aclexplode(table_row.relacl) acl_row on true
         where table_row.oid = 'public.classes'::regclass
           and acl_row.grantee = 'authenticated'::regrole)
      = array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]
    and not exists (
      select 1 from pg_class table_row
      cross join lateral aclexplode(table_row.relacl) acl_row
      where table_row.oid in (
        'public.classes'::regclass,
        'public.class_announcements'::regclass,
        'public.school_dashboard_context'::regclass
      )
        and (
          acl_row.grantee = 0
          or acl_row.grantee = 'service_role'::regrole
          or (
            table_row.oid = 'public.classes'::regclass
            and acl_row.grantee not in (
              'postgres'::regrole, 'anon'::regrole, 'authenticated'::regrole
            )
          )
          or (
            table_row.oid <> 'public.classes'::regclass
            and acl_row.grantee <> 'postgres'::regrole
          )
          or (
            table_row.oid <> 'public.classes'::regclass
            and acl_row.grantee in ('anon'::regrole, 'authenticated'::regrole)
          )
          or acl_row.is_grantable
        )
    )
  into v_final_acl;

  if v_initial_policies and v_initial_acl then
    perform set_config('pro05_1.state', 'initial', true);
  elsif v_final_policies and v_final_acl then
    perform set_config('pro05_1.state', 'final', true);
  else
    raise exception using message = 'PRO05_1_INTERMEDIATE_OR_DRIFTED_STATE';
  end if;

  perform set_config(
    'pro05_1.classes_rows',
    (select count(*)::text from public.classes),
    true
  );
  perform set_config(
    'pro05_1.class_announcements_rows',
    (select count(*)::text from public.class_announcements),
    true
  );
  perform set_config(
    'pro05_1.school_dashboard_context_rows',
    (select count(*)::text from public.school_dashboard_context),
    true
  );

  -- Select two real, distinct owners for the rollback-only behavioral truth
  -- table executed after policy creation. No PII is persisted or returned.
  select class_a.id, school_a.id, school_a.owner_id,
         school_b.id, school_b.owner_id
  into v_class_a, v_school_a, v_owner_a, v_school_b, v_owner_b
  from public.classes class_a
  join public.establishments school_a
    on school_a.id = class_a.establishment_id
  join public.establishments school_b
    on school_b.owner_id is distinct from school_a.owner_id
  where school_a.owner_id is not null
    and school_b.owner_id is not null
  order by school_a.id, school_b.id
  limit 1;

  if v_class_a is null or v_school_a is null or v_owner_a is null
     or v_school_b is null or v_owner_b is null
  then
    raise exception using message = 'PRO05_1_TRUTH_ACTORS_UNAVAILABLE';
  end if;

  perform set_config('pro05_1.truth_class_a', v_class_a::text, true);
  perform set_config('pro05_1.truth_school_a', v_school_a::text, true);
  perform set_config('pro05_1.truth_owner_a', v_owner_a::text, true);
  perform set_config('pro05_1.truth_school_b', v_school_b::text, true);
  perform set_config('pro05_1.truth_owner_b', v_owner_b::text, true);
end
$preflight$;

do $apply$
begin
  if current_setting('pro05_1.state', true) = 'initial' then
    execute 'drop policy "Allow all classes delete" on public.classes';
    execute 'drop policy "Allow all classes insert" on public.classes';
    execute 'drop policy "Allow all classes select" on public.classes';
    execute 'drop policy "Owners can manage classes" on public.classes';
    execute 'drop policy "Public can read classes" on public.classes';

    execute 'drop policy "Allow class announcements delete" on public.class_announcements';
    execute 'drop policy "Allow class announcements insert" on public.class_announcements';
    execute 'drop policy "Allow class announcements select" on public.class_announcements';

    execute 'drop policy "Allow all dashboard context insert" on public.school_dashboard_context';
    execute 'drop policy "Allow all dashboard context select" on public.school_dashboard_context';
    execute 'drop policy "Allow all dashboard context update" on public.school_dashboard_context';

    execute 'revoke all on table public.classes from public, anon, authenticated, service_role';
    execute 'revoke all on table public.class_announcements from public, anon, authenticated, service_role';
    execute 'revoke all on table public.school_dashboard_context from public, anon, authenticated, service_role';

    execute 'grant select on table public.classes to anon, authenticated';
    execute 'grant insert, update, delete on table public.classes to authenticated';

    execute $policy$
      create policy classes_public_read
      on public.classes
      for select
      to anon, authenticated
      using (true)
    $policy$;

    execute $policy$
      create policy classes_owner_insert
      on public.classes
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.establishments e
          where e.id = classes.establishment_id
            and e.owner_id = (select auth.uid())
        )
        and (
          classes.section_id is null
          or exists (
            select 1
            from public.sections section_row
            where section_row.id = classes.section_id
              and section_row.etablissement_id = classes.establishment_id
          )
        )
      )
    $policy$;

    execute $policy$
      create policy classes_owner_update
      on public.classes
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.establishments e
          where e.id = classes.establishment_id
            and e.owner_id = (select auth.uid())
        )
        and (
          classes.section_id is null
          or exists (
            select 1
            from public.sections section_row
            where section_row.id = classes.section_id
              and section_row.etablissement_id = classes.establishment_id
          )
        )
      )
      with check (
        exists (
          select 1
          from public.establishments e
          where e.id = classes.establishment_id
            and e.owner_id = (select auth.uid())
        )
        and (
          classes.section_id is null
          or exists (
            select 1
            from public.sections section_row
            where section_row.id = classes.section_id
              and section_row.etablissement_id = classes.establishment_id
          )
        )
      )
    $policy$;

    execute $policy$
      create policy classes_owner_delete
      on public.classes
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.establishments e
          where e.id = classes.establishment_id
            and e.owner_id = (select auth.uid())
        )
        and (
          classes.section_id is null
          or exists (
            select 1
            from public.sections section_row
            where section_row.id = classes.section_id
              and section_row.etablissement_id = classes.establishment_id
          )
        )
      )
    $policy$;
  elsif current_setting('pro05_1.state', true) <> 'final' then
    raise exception using message = 'PRO05_1_UNSAFE_APPLY_STATE';
  end if;
end
$apply$;

do $postcheck$
begin
  if (
    with targets(relid, table_name) as (
      values
        ('public.classes'::regclass, 'classes'),
        ('public.class_announcements'::regclass, 'class_announcements'),
        ('public.school_dashboard_context'::regclass, 'school_dashboard_context')
    ), fingerprints as (
      select target.table_name,
        (select md5(string_agg(concat_ws(
          '|', attribute_row.attnum, attribute_row.attname,
          format_type(attribute_row.atttypid, attribute_row.atttypmod),
          attribute_row.attnotnull,
          coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
          attribute_row.attidentity, attribute_row.attgenerated
        ), ';' order by attribute_row.attnum))
         from pg_attribute attribute_row
         left join pg_attrdef default_row
           on default_row.adrelid = attribute_row.attrelid
          and default_row.adnum = attribute_row.attnum
         where attribute_row.attrelid = target.relid
           and attribute_row.attnum > 0
           and not attribute_row.attisdropped) column_md5,
        (select md5(string_agg(concat_ws(
          '|', constraint_row.conname, constraint_row.contype,
          constraint_row.convalidated,
          pg_get_constraintdef(constraint_row.oid, true)
        ), ';' order by constraint_row.conname))
         from pg_constraint constraint_row
         where constraint_row.conrelid = target.relid) constraint_md5,
        (select md5(string_agg(concat_ws(
          '|', index_row.indexrelid::regclass::text,
          pg_get_indexdef(index_row.indexrelid),
          index_row.indisvalid, index_row.indisready
        ), ';' order by index_row.indexrelid::regclass::text))
         from pg_index index_row
         where index_row.indrelid = target.relid) index_md5,
        (select count(*) from pg_trigger trigger_row
         where trigger_row.tgrelid = target.relid
           and not trigger_row.tgisinternal) trigger_count
      from targets target
    )
    select md5(string_agg(concat_ws(
      '|', table_name, column_md5, constraint_md5, index_md5, trigger_count
    ), ';' order by table_name))
    from fingerprints
  ) <> '59f185d3f0bbf13bbfda775de0d551a7'
  or exists (
    select 1
    from pg_class table_row
    where table_row.oid in (
      'public.classes'::regclass,
      'public.class_announcements'::regclass,
      'public.school_dashboard_context'::regclass
    )
      and (
        table_row.relowner <> 'postgres'::regrole
        or not table_row.relrowsecurity
        or table_row.relforcerowsecurity
      )
  ) then
    raise exception using message = 'PRO05_1_POSTCHECK_STRUCTURE_FAILED';
  end if;

  if (select count(*) from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes') <> 4
     or exists (
       select 1 from pg_policies policy_row
       where policy_row.schemaname = 'public'
         and policy_row.tablename in (
           'class_announcements', 'school_dashboard_context'
         )
     )
  then
    raise exception using message = 'PRO05_1_POSTCHECK_POLICY_COUNT_FAILED';
  end if;

  if not exists (
    select 1 from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'classes'
      and policy_row.policyname = 'classes_public_read'
      and policy_row.roles = array['anon', 'authenticated']::name[]
      and policy_row.cmd = 'SELECT'
      and policy_row.qual = 'true'
      and policy_row.with_check is null
  )
  or not exists (
    select 1 from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'classes'
      and policy_row.policyname = 'classes_owner_insert'
      and policy_row.roles = array['authenticated']::name[]
      and policy_row.cmd = 'INSERT'
      and policy_row.qual is null
      and policy_row.with_check is not null
  )
  or not exists (
    select 1 from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'classes'
      and policy_row.policyname = 'classes_owner_update'
      and policy_row.roles = array['authenticated']::name[]
      and policy_row.cmd = 'UPDATE'
      and policy_row.qual is not null
      and policy_row.with_check is not null
  )
  or not exists (
    select 1 from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'classes'
      and policy_row.policyname = 'classes_owner_delete'
      and policy_row.roles = array['authenticated']::name[]
      and policy_row.cmd = 'DELETE'
      and policy_row.qual is not null
      and policy_row.with_check is null
  ) then
    raise exception using message = 'PRO05_1_POSTCHECK_POLICY_SHAPE_FAILED';
  end if;

  -- Validate structural catalog dependencies, never decompiled SQL text.
  if not (
    with owner_policies(policy_name) as (
      values
        ('classes_owner_insert'),
        ('classes_owner_update'),
        ('classes_owner_delete')
    ), expected_columns(relid, column_name) as (
      values
        ('public.classes'::regclass, 'establishment_id'),
        ('public.classes'::regclass, 'section_id'),
        ('public.establishments'::regclass, 'id'),
        ('public.establishments'::regclass, 'owner_id'),
        ('public.sections'::regclass, 'id'),
        ('public.sections'::regclass, 'etablissement_id')
    )
    select
      not exists (
        select 1
        from owner_policies owner_policy
        cross join expected_columns expected_column
        where not exists (
          select 1
          from pg_policy policy_row
          join pg_depend dependency_row
            on dependency_row.classid = 'pg_policy'::regclass
           and dependency_row.objid = policy_row.oid
           and dependency_row.refclassid = 'pg_class'::regclass
          join pg_attribute attribute_row
            on attribute_row.attrelid = dependency_row.refobjid
           and attribute_row.attnum = dependency_row.refobjsubid
          where policy_row.polrelid = 'public.classes'::regclass
            and policy_row.polname = owner_policy.policy_name
            and attribute_row.attrelid = expected_column.relid
            and attribute_row.attname = expected_column.column_name
        )
      )
      and not exists (
        select 1
        from owner_policies owner_policy
        where not exists (
          select 1
          from pg_policy policy_row
          join pg_depend dependency_row
            on dependency_row.classid = 'pg_policy'::regclass
           and dependency_row.objid = policy_row.oid
           and dependency_row.refclassid = 'pg_proc'::regclass
          where policy_row.polrelid = 'public.classes'::regclass
            and policy_row.polname = owner_policy.policy_name
            and dependency_row.refobjid = 'auth.uid()'::regprocedure
        )
      )
      and not exists (
        select 1
        from pg_policy policy_row
        join pg_depend dependency_row
          on dependency_row.classid = 'pg_policy'::regclass
         and dependency_row.objid = policy_row.oid
         and dependency_row.refclassid = 'pg_proc'::regclass
        where policy_row.polrelid = 'public.classes'::regclass
          and policy_row.polname in (
            'classes_owner_insert',
            'classes_owner_update',
            'classes_owner_delete'
          )
          and dependency_row.refobjid = 'public.is_platform_admin()'::regprocedure
      )
  ) then
    raise exception using message = 'PRO05_1_POSTCHECK_OWNER_PREDICATE_FAILED';
  end if;

  if (select coalesce(array_agg(acl_row.privilege_type order by acl_row.privilege_type), array[]::text[])
      from pg_class table_row
      left join lateral aclexplode(table_row.relacl) acl_row on true
      where table_row.oid = 'public.classes'::regclass
        and acl_row.grantee = 'anon'::regrole) <> array['SELECT']::text[]
  or (select coalesce(array_agg(acl_row.privilege_type order by acl_row.privilege_type), array[]::text[])
      from pg_class table_row
      left join lateral aclexplode(table_row.relacl) acl_row on true
      where table_row.oid = 'public.classes'::regclass
        and acl_row.grantee = 'authenticated'::regrole)
      <> array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]
  or exists (
    select 1 from pg_class table_row
    cross join lateral aclexplode(table_row.relacl) acl_row
    where table_row.oid in (
      'public.classes'::regclass,
      'public.class_announcements'::regclass,
      'public.school_dashboard_context'::regclass
    )
      and (
        acl_row.grantee = 0
        or acl_row.grantee = 'service_role'::regrole
        or (
          table_row.oid = 'public.classes'::regclass
          and acl_row.grantee not in (
            'postgres'::regrole, 'anon'::regrole, 'authenticated'::regrole
          )
        )
        or (
          table_row.oid <> 'public.classes'::regclass
          and acl_row.grantee <> 'postgres'::regrole
        )
        or (
          table_row.oid <> 'public.classes'::regclass
          and acl_row.grantee in ('anon'::regrole, 'authenticated'::regrole)
        )
        or acl_row.is_grantable
      )
  ) then
    raise exception using message = 'PRO05_1_POSTCHECK_ACL_FAILED';
  end if;

  if (select count(*) from public.classes)
       <> current_setting('pro05_1.classes_rows')::bigint
     or (select count(*) from public.class_announcements)
       <> current_setting('pro05_1.class_announcements_rows')::bigint
     or (select count(*) from public.school_dashboard_context)
       <> current_setting('pro05_1.school_dashboard_context_rows')::bigint
  then
    raise exception using message = 'PRO05_1_BUSINESS_ROWS_CHANGED';
  end if;

  if (
    select md5(concat_ws(
      '|', policy_row.schemaname, policy_row.tablename,
      policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ))
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'applications'
      and policy_row.policyname = 'applications_public_insert'
  ) <> 'c53e8fd1b720fc18e2dca2c131ad109c'
  then
    raise exception using message = 'PRO05_1_APPLICATIONS_POLICY_CHANGED';
  end if;
end
$postcheck$;

-- Behavioral truth table. Every successful write is enclosed in a PL/pgSQL
-- exception subtransaction and deliberately rolled back before the test
-- continues. Denied writes must fail with insufficient_privilege (42501).
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pro05_1.truth_owner_a'),
  true
);

do $truth_owner_allow$
declare
  v_test_class uuid := gen_random_uuid();
  v_insert_rows integer := 0;
  v_update_rows integer := 0;
  v_delete_rows integer := 0;
begin
  begin
    insert into public.classes (id, establishment_id, name)
    values (
      v_test_class,
      current_setting('pro05_1.truth_school_a')::uuid,
      'PRO05_TRUTH_OWNER'
    );
    get diagnostics v_insert_rows = row_count;

    update public.classes
    set name = 'PRO05_TRUTH_OWNER_UPDATED'
    where id = v_test_class;
    get diagnostics v_update_rows = row_count;

    delete from public.classes where id = v_test_class;
    get diagnostics v_delete_rows = row_count;

    raise exception using
      errcode = 'P5101',
      message = 'PRO05_1_TRUTH_ROLLBACK_OWNER';
  exception
    when sqlstate 'P5101' then null;
  end;

  if v_insert_rows <> 1 or v_update_rows <> 1 or v_delete_rows <> 1 then
    raise exception using message = 'PRO05_1_TRUTH_OWNER_ALLOW_FAILED';
  end if;
end
$truth_owner_allow$;

do $truth_owner_a_foreign_school_deny$
declare
  v_denied boolean := false;
  v_unexpected_success boolean := false;
begin
  begin
    insert into public.classes (id, establishment_id, name)
    values (
      gen_random_uuid(),
      current_setting('pro05_1.truth_school_b')::uuid,
      'PRO05_TRUTH_OWNER_A_FOREIGN'
    );
    v_unexpected_success := true;
    raise exception using
      errcode = 'P5102',
      message = 'PRO05_1_TRUTH_ROLLBACK_OWNER_A_FOREIGN';
  exception
    when insufficient_privilege then v_denied := true;
    when sqlstate 'P5102' then null;
  end;

  if not v_denied or v_unexpected_success then
    raise exception using message = 'PRO05_1_TRUTH_OWNER_A_FOREIGN_DENY_FAILED';
  end if;
end
$truth_owner_a_foreign_school_deny$;

select set_config(
  'request.jwt.claim.sub',
  current_setting('pro05_1.truth_owner_b'),
  true
);

do $truth_authenticated_non_owner_deny$
declare
  v_denied boolean := false;
  v_unexpected_success boolean := false;
  v_update_rows integer := 0;
  v_delete_rows integer := 0;
begin
  begin
    insert into public.classes (id, establishment_id, name)
    values (
      gen_random_uuid(),
      current_setting('pro05_1.truth_school_a')::uuid,
      'PRO05_TRUTH_AUTHENTICATED_NON_OWNER'
    );
    v_unexpected_success := true;
    raise exception using
      errcode = 'P5103',
      message = 'PRO05_1_TRUTH_ROLLBACK_AUTHENTICATED_NON_OWNER';
  exception
    when insufficient_privilege then v_denied := true;
    when sqlstate 'P5103' then null;
  end;

  begin
    update public.classes
    set name = name
    where id = current_setting('pro05_1.truth_class_a')::uuid;
    get diagnostics v_update_rows = row_count;

    delete from public.classes
    where id = current_setting('pro05_1.truth_class_a')::uuid;
    get diagnostics v_delete_rows = row_count;

    raise exception using
      errcode = 'P5105',
      message = 'PRO05_1_TRUTH_ROLLBACK_NON_OWNER_UPDATE_DELETE';
  exception
    when sqlstate 'P5105' then null;
  end;

  if not v_denied or v_unexpected_success
     or v_update_rows <> 0 or v_delete_rows <> 0
  then
    raise exception using message = 'PRO05_1_TRUTH_AUTHENTICATED_NON_OWNER_DENY_FAILED';
  end if;
end
$truth_authenticated_non_owner_deny$;

set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);

do $truth_anon_deny$
declare
  v_denied boolean := false;
  v_unexpected_success boolean := false;
begin
  begin
    insert into public.classes (id, establishment_id, name)
    values (
      gen_random_uuid(),
      current_setting('pro05_1.truth_school_a')::uuid,
      'PRO05_TRUTH_ANON'
    );
    v_unexpected_success := true;
    raise exception using
      errcode = 'P5104',
      message = 'PRO05_1_TRUTH_ROLLBACK_ANON';
  exception
    when insufficient_privilege then v_denied := true;
    when sqlstate 'P5104' then null;
  end;

  if not v_denied or v_unexpected_success then
    raise exception using message = 'PRO05_1_TRUTH_ANON_DENY_FAILED';
  end if;
end
$truth_anon_deny$;

reset role;

do $truth_final_counts$
begin
  if (select count(*) from public.classes)
       <> current_setting('pro05_1.classes_rows')::bigint
     or (select count(*) from public.class_announcements)
       <> current_setting('pro05_1.class_announcements_rows')::bigint
     or (select count(*) from public.school_dashboard_context)
       <> current_setting('pro05_1.school_dashboard_context_rows')::bigint
  then
    raise exception using message = 'PRO05_1_TRUTH_TABLE_ROWS_CHANGED';
  end if;
end
$truth_final_counts$;

commit;
