-- PRO-04 / Lot 01 — replace the exposed ownership helper in all live RLS dependencies.
-- PROPOSAL ONLY. DO NOT EXECUTE WITHOUT EDDY + ARCHITECT APPROVAL.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  v_helper_oid oid := to_regprocedure(
    'public.is_own_establishment(uuid)'
  )::oid;
  v_policy_dependencies text[];
begin
  if (
    with expected(schemaname, tablename, policyname, command) as (values
      (
        'public',
        'ai_usage',
        'Directeur lit le cout IA de son etablissement',
        'SELECT'
      ),
      (
        'public',
        'admissions_config',
        'admissions_config_owner_write',
        'ALL'
      ),
      (
        'public',
        'school_page_drafts',
        'school_page_drafts_owner_only',
        'ALL'
      )
    )
    select count(*)
    from expected e
    join pg_policies p
      using (schemaname, tablename, policyname)
    join pg_class c
      on c.oid = to_regclass(format('%I.%I', e.schemaname, e.tablename))
    where p.cmd = e.command
      and p.roles in (
        '{public}'::name[],
        '{authenticated}'::name[]
      )
      and c.relrowsecurity
  ) <> 3 then
    raise exception using message = 'PRO04_LOT01_TARGET_DRIFT';
  end if;

  select coalesce(
    array_agg(dependency_name order by dependency_name),
    '{}'::text[]
  )
  into v_policy_dependencies
  from (
    select distinct format(
      '%I.%I/%s',
      schemaname,
      tablename,
      policyname
    ) as dependency_name
    from pg_policies
    where coalesce(qual, '') like '%is_own_establishment%'
       or coalesce(with_check, '') like '%is_own_establishment%'
  ) dependencies;

  if v_helper_oid is not null then
    if v_policy_dependencies <> array[
      'public.admissions_config/admissions_config_owner_write',
      'public.ai_usage/Directeur lit le cout IA de son etablissement',
      'public.school_page_drafts/school_page_drafts_owner_only'
    ]::text[] then
      raise exception using message = 'PRO04_LOT01_DEPENDENCY_DRIFT';
    end if;

    if exists (
      select 1
      from pg_depend d
      where d.refclassid = 'pg_proc'::regclass
        and d.refobjid = v_helper_oid
        and not (
          d.classid = 'pg_policy'::regclass
          and exists (
            select 1
            from pg_policy pol
            join pg_class rel on rel.oid = pol.polrelid
            join pg_namespace nsp on nsp.oid = rel.relnamespace
            where pol.oid = d.objid
              and nsp.nspname = 'public'
              and (
                (rel.relname = 'ai_usage'
                  and pol.polname =
                    'Directeur lit le cout IA de son etablissement')
                or (rel.relname = 'admissions_config'
                  and pol.polname = 'admissions_config_owner_write')
                or (rel.relname = 'school_page_drafts'
                  and pol.polname = 'school_page_drafts_owner_only')
              )
          )
        )
    ) then
      raise exception using message = 'PRO04_LOT01_NON_POLICY_DEPENDENCY';
    end if;
  elsif cardinality(v_policy_dependencies) <> 0 then
    raise exception using message = 'PRO04_LOT01_ABSENT_HELPER_DRIFT';
  end if;
end
$preflight$;

drop policy "Directeur lit le cout IA de son etablissement"
  on public.ai_usage;
create policy "Directeur lit le cout IA de son etablissement"
  on public.ai_usage
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.establishments e
      where e.id = ai_usage.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy admissions_config_owner_write
  on public.admissions_config;
create policy admissions_config_owner_write
  on public.admissions_config
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.establishments e
      where e.id = admissions_config.establishment_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.establishments e
      where e.id = admissions_config.establishment_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy school_page_drafts_owner_only
  on public.school_page_drafts;
create policy school_page_drafts_owner_only
  on public.school_page_drafts
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.establishments e
      where e.id = school_page_drafts.establishment_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.establishments e
      where e.id = school_page_drafts.establishment_id
        and e.owner_id = (select auth.uid())
    )
  );

do $close_helper$
begin
  if to_regprocedure('public.is_own_establishment(uuid)') is not null then
    execute
      'revoke execute on function public.is_own_establishment(uuid) '
      || 'from public, anon, authenticated, service_role';
    execute
      'drop function public.is_own_establishment(uuid) restrict';
  end if;
end
$close_helper$;

do $postcheck$
begin
  if to_regprocedure('public.is_own_establishment(uuid)') is not null then
    raise exception using message = 'PRO04_LOT01_HELPER_STILL_PRESENT';
  end if;

  if exists (
    select 1
    from pg_policies
    where coalesce(qual, '') like '%is_own_establishment%'
       or coalesce(with_check, '') like '%is_own_establishment%'
  ) then
    raise exception using message = 'PRO04_LOT01_CONSUMER_STILL_PRESENT';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'ai_usage'
          and policyname =
            'Directeur lit le cout IA de son etablissement'
          and cmd = 'SELECT')
        or (tablename = 'admissions_config'
          and policyname = 'admissions_config_owner_write'
          and cmd = 'ALL')
        or (tablename = 'school_page_drafts'
          and policyname = 'school_page_drafts_owner_only'
          and cmd = 'ALL')
      )
      and roles = '{authenticated}'::name[]
  ) <> 3 then
    raise exception using message = 'PRO04_LOT01_POSTCHECK_FAILED';
  end if;
end
$postcheck$;

commit;
