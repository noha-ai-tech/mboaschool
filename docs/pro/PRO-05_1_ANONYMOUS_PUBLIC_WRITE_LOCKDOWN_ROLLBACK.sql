-- PRO-05.1 exact rollback.
-- Execute only if the production state is the exact final state of PRO-05.1.
-- Restores the original policies and ACL; no business-row DML.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

lock table
  public.classes,
  public.class_announcements,
  public.school_dashboard_context
in access exclusive mode;

lock table public.applications in access share mode;

do $preflight$
declare
  v_owner_predicate text;
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
  then
    raise exception using message = 'PRO05_1_ROLLBACK_STRUCTURE_DRIFT';
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
    raise exception using message = 'PRO05_1_ROLLBACK_POLICY_STATE_DRIFT';
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
      and regexp_replace(policy_row.qual, '\s+', '', 'g')
        = regexp_replace(policy_row.with_check, '\s+', '', 'g')
  )
  or not exists (
    select 1 from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'classes'
      and policy_row.policyname = 'classes_owner_delete'
      and policy_row.roles = array['authenticated']::name[]
      and policy_row.cmd = 'DELETE'
      and policy_row.qual is not null
  ) then
    raise exception using message = 'PRO05_1_ROLLBACK_POLICY_SHAPE_DRIFT';
  end if;

  select lower(regexp_replace(policy_row.with_check, '\s+', '', 'g'))
  into v_owner_predicate
  from pg_policies policy_row
  where policy_row.schemaname = 'public'
    and policy_row.tablename = 'classes'
    and policy_row.policyname = 'classes_owner_insert';

  if v_owner_predicate not like '%e.id=classes.establishment_id%'
     or v_owner_predicate not like '%e.owner_id=(selectauth.uid()%'
     or v_owner_predicate not like '%classes.section_idisnull%'
     or v_owner_predicate not like '%section_row.id=classes.section_id%'
     or v_owner_predicate not like
       '%section_row.etablissement_id=classes.establishment_id%'
     or v_owner_predicate ilike '%is_platform_admin%'
     or v_owner_predicate <> (
       select lower(regexp_replace(policy_row.qual, '\s+', '', 'g'))
       from pg_policies policy_row
       where policy_row.schemaname = 'public'
         and policy_row.tablename = 'classes'
         and policy_row.policyname = 'classes_owner_update'
     )
  then
    raise exception using message = 'PRO05_1_ROLLBACK_PREDICATE_DRIFT';
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
    raise exception using message = 'PRO05_1_ROLLBACK_ACL_DRIFT';
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
    raise exception using message = 'PRO05_1_ROLLBACK_APPLICATIONS_DRIFT';
  end if;

  perform set_config(
    'pro05_1.rollback.classes_rows',
    (select count(*)::text from public.classes), true
  );
  perform set_config(
    'pro05_1.rollback.class_announcements_rows',
    (select count(*)::text from public.class_announcements), true
  );
  perform set_config(
    'pro05_1.rollback.school_dashboard_context_rows',
    (select count(*)::text from public.school_dashboard_context), true
  );
end
$preflight$;

drop policy classes_public_read on public.classes;
drop policy classes_owner_insert on public.classes;
drop policy classes_owner_update on public.classes;
drop policy classes_owner_delete on public.classes;

revoke all on table public.classes
  from public, anon, authenticated, service_role;
revoke all on table public.class_announcements
  from public, anon, authenticated, service_role;
revoke all on table public.school_dashboard_context
  from public, anon, authenticated, service_role;

create policy "Allow all classes delete"
on public.classes for delete to anon using (true);

create policy "Allow all classes insert"
on public.classes for insert to anon with check (true);

create policy "Allow all classes select"
on public.classes for select to anon using (true);

create policy "Owners can manage classes"
on public.classes for all
using (
  exists (
    select 1 from public.establishments e
    where e.id = classes.establishment_id
      and e.owner_id = auth.uid()
  )
);

create policy "Public can read classes"
on public.classes for select using (true);

create policy "Allow class announcements delete"
on public.class_announcements for delete to anon using (true);

create policy "Allow class announcements insert"
on public.class_announcements for insert to anon with check (true);

create policy "Allow class announcements select"
on public.class_announcements for select to anon using (true);

create policy "Allow all dashboard context insert"
on public.school_dashboard_context for insert to anon with check (true);

create policy "Allow all dashboard context select"
on public.school_dashboard_context for select to anon using (true);

create policy "Allow all dashboard context update"
on public.school_dashboard_context for update to anon using (true);

grant all on table public.classes to anon, authenticated, service_role;
grant all on table public.class_announcements to anon, authenticated, service_role;
grant all on table public.school_dashboard_context to anon, authenticated, service_role;

do $postcheck$
begin
  if (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'classes')
      <> 'ad19aadfc8bd8d0f7b326322cf5aa623'
  or (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'class_announcements')
      <> '82c5366e02982c43ff95945ded8b928c'
  or (select md5(string_agg(concat_ws(
      '|', policy_row.policyname, policy_row.permissive,
      policy_row.roles::text, policy_row.cmd,
      coalesce(policy_row.qual, ''), coalesce(policy_row.with_check, '')
    ), ';' order by policy_row.policyname))
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'school_dashboard_context')
      <> '7910f825740bddd3163519aaed6bd630'
  then
    raise exception using message = 'PRO05_1_ROLLBACK_POLICY_RESTORE_FAILED';
  end if;

  if exists (
    select 1
    from pg_class table_row
    where table_row.oid in (
      'public.classes'::regclass,
      'public.class_announcements'::regclass,
      'public.school_dashboard_context'::regclass
    )
      and table_row.relacl::text <>
        '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
  ) then
    raise exception using message = 'PRO05_1_ROLLBACK_ACL_RESTORE_FAILED';
  end if;

  if (select count(*) from public.classes)
       <> current_setting('pro05_1.rollback.classes_rows')::bigint
     or (select count(*) from public.class_announcements)
       <> current_setting('pro05_1.rollback.class_announcements_rows')::bigint
     or (select count(*) from public.school_dashboard_context)
       <> current_setting('pro05_1.rollback.school_dashboard_context_rows')::bigint
  then
    raise exception using message = 'PRO05_1_ROLLBACK_BUSINESS_ROWS_CHANGED';
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
    raise exception using message = 'PRO05_1_ROLLBACK_APPLICATIONS_CHANGED';
  end if;
end
$postcheck$;

commit;
