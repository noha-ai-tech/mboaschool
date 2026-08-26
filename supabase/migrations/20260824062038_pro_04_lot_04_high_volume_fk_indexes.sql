-- PRO-04 / Lot 04 - eight validated missing-FK B-tree indexes.
-- PROPOSAL ONLY. DO NOT EXECUTE WITHOUT EDDY + ARCHITECT APPROVAL.
--
-- Production snapshot (2026-08-24 UTC):
--   establishment_import_staging: 2,378 rows / 3,817,472 total bytes.
--   establishments:                2,252 rows / 1,687,552 total bytes.
-- Ordinary CREATE INDEX is intentional: these small tables make the write-lock
-- window short, while one transaction preserves all-or-nothing execution.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
declare
  v_target record;
  v_constraint_count integer;
  v_covering_index_count integer;
  v_named_index_oid oid;
  v_present_count integer := 0;
  v_staging_rows bigint;
  v_establishment_rows bigint;
begin
  if to_regclass('public.establishment_import_staging') is null
    or to_regclass('public.establishments') is null
  then
    raise exception using message = 'PRO04_LOT04_TABLE_DRIFT';
  end if;

  select count(*) into v_staging_rows
  from public.establishment_import_staging;
  select count(*) into v_establishment_rows
  from public.establishments;

  perform set_config(
    'pro04.lot04.establishment_import_staging_rows',
    v_staging_rows::text,
    true
  );
  perform set_config(
    'pro04.lot04.establishments_rows',
    v_establishment_rows::text,
    true
  );

  for v_target in
    select *
    from (
      values
        ('establishment_import_staging', 'establishment_import_staging_arrondissement_id_fkey', 'arrondissement_id', 'geo_arrondissements', 'a', 'idx_establishment_import_staging_arrondissement_id'),
        ('establishment_import_staging', 'establishment_import_staging_department_id_fkey', 'department_id', 'geo_departments', 'a', 'idx_establishment_import_staging_department_id'),
        ('establishment_import_staging', 'establishment_import_staging_duplicate_of_establishment_id_fkey', 'duplicate_of_establishment_id', 'establishments', 'a', 'idx_establishment_import_staging_duplicate_of_establishment_id'),
        ('establishment_import_staging', 'establishment_import_staging_duplicate_of_staging_id_fkey', 'duplicate_of_staging_id', 'establishment_import_staging', 'a', 'idx_establishment_import_staging_duplicate_of_staging_id'),
        ('establishment_import_staging', 'establishment_import_staging_promoted_establishment_id_fkey', 'promoted_establishment_id', 'establishments', 'a', 'idx_establishment_import_staging_promoted_establishment_id'),
        ('establishment_import_staging', 'establishment_import_staging_region_id_fkey', 'region_id', 'geo_regions', 'a', 'idx_establishment_import_staging_region_id'),
        ('establishments', 'establishments_arrondissement_id_fkey', 'arrondissement_id', 'geo_arrondissements', 'a', 'idx_establishments_arrondissement_id'),
        ('establishments', 'establishments_owner_id_fkey', 'owner_id', 'profiles', 'n', 'idx_establishments_owner_id')
    ) as expected(
      table_name,
      constraint_name,
      column_name,
      referenced_table_name,
      delete_action,
      index_name
    )
  loop
    select count(*)
    into v_constraint_count
    from pg_constraint constraint_row
    join pg_attribute source_column
      on source_column.attrelid = constraint_row.conrelid
     and source_column.attname = v_target.column_name
     and not source_column.attisdropped
    join pg_attribute referenced_column
      on referenced_column.attrelid = constraint_row.confrelid
     and referenced_column.attname = 'id'
     and not referenced_column.attisdropped
    where constraint_row.conname = v_target.constraint_name
      and constraint_row.contype = 'f'
      and constraint_row.conrelid =
        format('public.%I', v_target.table_name)::regclass
      and constraint_row.confrelid =
        format('public.%I', v_target.referenced_table_name)::regclass
      and constraint_row.conkey = array[source_column.attnum]::smallint[]
      and constraint_row.confkey =
        array[referenced_column.attnum]::smallint[]
      and constraint_row.convalidated
      and constraint_row.confmatchtype = 's'
      and constraint_row.confupdtype = 'a'
      and constraint_row.confdeltype = v_target.delete_action;

    if v_constraint_count <> 1 then
      raise exception using message = 'PRO04_LOT04_FK_DRIFT';
    end if;

    v_named_index_oid := to_regclass(format('public.%I', v_target.index_name));

    if v_named_index_oid is not null then
      v_present_count := v_present_count + 1;

      if not exists (
        select 1
        from pg_index index_row
        join pg_class index_class on index_class.oid = index_row.indexrelid
        join pg_namespace index_schema
          on index_schema.oid = index_class.relnamespace
        join pg_am access_method on access_method.oid = index_class.relam
        join pg_attribute source_column
          on source_column.attrelid = index_row.indrelid
         and source_column.attname = v_target.column_name
         and not source_column.attisdropped
        where index_row.indexrelid = v_named_index_oid
          and index_schema.nspname = 'public'
          and index_row.indrelid =
            format('public.%I', v_target.table_name)::regclass
          and access_method.amname = 'btree'
          and index_row.indnkeyatts = 1
          and index_row.indnatts = 1
          and index_row.indkey[0] = source_column.attnum
          and index_row.indpred is null
          and index_row.indexprs is null
          and index_row.indisvalid
          and index_row.indisready
          and index_row.indislive
          and not index_row.indisunique
          and not index_row.indisprimary
          and not index_row.indisexclusion
          and not index_row.indisclustered
          and not index_row.indisreplident
          and not index_row.indnullsnotdistinct
          and pg_get_indexdef(index_row.indexrelid) = format(
            'CREATE INDEX %I ON public.%I USING btree (%I)',
            v_target.index_name,
            v_target.table_name,
            v_target.column_name
          )
      ) then
        raise exception using message = 'PRO04_LOT04_INDEX_DRIFT';
      end if;
    end if;

    select count(*)
    into v_covering_index_count
    from pg_index index_row
    join pg_attribute source_column
      on source_column.attrelid = index_row.indrelid
     and source_column.attname = v_target.column_name
     and not source_column.attisdropped
    where index_row.indrelid =
        format('public.%I', v_target.table_name)::regclass
      and index_row.indisvalid
      and index_row.indisready
      and index_row.indislive
      and index_row.indpred is null
      and index_row.indexprs is null
      and index_row.indnkeyatts >= 1
      and index_row.indkey[0] = source_column.attnum;

    if v_covering_index_count <> (
      case
        when v_named_index_oid is null then 0
        else 1
      end
    ) then
      raise exception using message = 'PRO04_LOT04_COVERAGE_DRIFT';
    end if;
  end loop;

  if v_present_count = 0 then
    perform set_config('pro04.lot04.state', 'initial', true);
  elsif v_present_count = 8 then
    perform set_config('pro04.lot04.state', 'final', true);
  else
    raise exception using message = 'PRO04_LOT04_PARTIAL_STATE_DRIFT';
  end if;
end
$preflight$;

do $apply$
declare
  v_target record;
begin
  if current_setting('pro04.lot04.state', true) = 'initial' then
    for v_target in
      select *
      from (
        values
          ('establishment_import_staging', 'arrondissement_id', 'idx_establishment_import_staging_arrondissement_id'),
          ('establishment_import_staging', 'department_id', 'idx_establishment_import_staging_department_id'),
          ('establishment_import_staging', 'duplicate_of_establishment_id', 'idx_establishment_import_staging_duplicate_of_establishment_id'),
          ('establishment_import_staging', 'duplicate_of_staging_id', 'idx_establishment_import_staging_duplicate_of_staging_id'),
          ('establishment_import_staging', 'promoted_establishment_id', 'idx_establishment_import_staging_promoted_establishment_id'),
          ('establishment_import_staging', 'region_id', 'idx_establishment_import_staging_region_id'),
          ('establishments', 'arrondissement_id', 'idx_establishments_arrondissement_id'),
          ('establishments', 'owner_id', 'idx_establishments_owner_id')
      ) as expected(table_name, column_name, index_name)
    loop
      execute format(
        'create index %I on public.%I using btree (%I)',
        v_target.index_name,
        v_target.table_name,
        v_target.column_name
      );
    end loop;
  elsif current_setting('pro04.lot04.state', true) <> 'final' then
    raise exception using message = 'PRO04_LOT04_UNSAFE_APPLY_STATE';
  end if;
end
$apply$;

do $postcheck$
declare
  v_target record;
  v_constraint_count integer;
  v_covering_index_count integer;
  v_expected_staging_rows bigint := nullif(
    current_setting(
      'pro04.lot04.establishment_import_staging_rows',
      true
    ),
    ''
  )::bigint;
  v_expected_establishment_rows bigint := nullif(
    current_setting('pro04.lot04.establishments_rows', true),
    ''
  )::bigint;
begin
  for v_target in
    select *
    from (
      values
        ('establishment_import_staging', 'establishment_import_staging_arrondissement_id_fkey', 'arrondissement_id', 'geo_arrondissements', 'a', 'idx_establishment_import_staging_arrondissement_id'),
        ('establishment_import_staging', 'establishment_import_staging_department_id_fkey', 'department_id', 'geo_departments', 'a', 'idx_establishment_import_staging_department_id'),
        ('establishment_import_staging', 'establishment_import_staging_duplicate_of_establishment_id_fkey', 'duplicate_of_establishment_id', 'establishments', 'a', 'idx_establishment_import_staging_duplicate_of_establishment_id'),
        ('establishment_import_staging', 'establishment_import_staging_duplicate_of_staging_id_fkey', 'duplicate_of_staging_id', 'establishment_import_staging', 'a', 'idx_establishment_import_staging_duplicate_of_staging_id'),
        ('establishment_import_staging', 'establishment_import_staging_promoted_establishment_id_fkey', 'promoted_establishment_id', 'establishments', 'a', 'idx_establishment_import_staging_promoted_establishment_id'),
        ('establishment_import_staging', 'establishment_import_staging_region_id_fkey', 'region_id', 'geo_regions', 'a', 'idx_establishment_import_staging_region_id'),
        ('establishments', 'establishments_arrondissement_id_fkey', 'arrondissement_id', 'geo_arrondissements', 'a', 'idx_establishments_arrondissement_id'),
        ('establishments', 'establishments_owner_id_fkey', 'owner_id', 'profiles', 'n', 'idx_establishments_owner_id')
    ) as expected(
      table_name,
      constraint_name,
      column_name,
      referenced_table_name,
      delete_action,
      index_name
    )
  loop
    select count(*)
    into v_constraint_count
    from pg_constraint constraint_row
    join pg_attribute source_column
      on source_column.attrelid = constraint_row.conrelid
     and source_column.attname = v_target.column_name
     and not source_column.attisdropped
    join pg_attribute referenced_column
      on referenced_column.attrelid = constraint_row.confrelid
     and referenced_column.attname = 'id'
     and not referenced_column.attisdropped
    where constraint_row.conname = v_target.constraint_name
      and constraint_row.contype = 'f'
      and constraint_row.conrelid =
        format('public.%I', v_target.table_name)::regclass
      and constraint_row.confrelid =
        format('public.%I', v_target.referenced_table_name)::regclass
      and constraint_row.conkey = array[source_column.attnum]::smallint[]
      and constraint_row.confkey =
        array[referenced_column.attnum]::smallint[]
      and constraint_row.convalidated
      and constraint_row.confmatchtype = 's'
      and constraint_row.confupdtype = 'a'
      and constraint_row.confdeltype = v_target.delete_action;

    if v_constraint_count <> 1 then
      raise exception using message = 'PRO04_LOT04_POSTCHECK_FK_FAILED';
    end if;

    if not exists (
      select 1
      from pg_index index_row
      join pg_class index_class on index_class.oid = index_row.indexrelid
      join pg_namespace index_schema
        on index_schema.oid = index_class.relnamespace
      join pg_am access_method on access_method.oid = index_class.relam
      join pg_attribute source_column
        on source_column.attrelid = index_row.indrelid
       and source_column.attname = v_target.column_name
       and not source_column.attisdropped
      where index_row.indexrelid =
          to_regclass(format('public.%I', v_target.index_name))
        and index_schema.nspname = 'public'
        and index_row.indrelid =
          format('public.%I', v_target.table_name)::regclass
        and access_method.amname = 'btree'
        and index_row.indnkeyatts = 1
        and index_row.indnatts = 1
        and index_row.indkey[0] = source_column.attnum
        and index_row.indpred is null
        and index_row.indexprs is null
        and index_row.indisvalid
        and index_row.indisready
        and index_row.indislive
        and not index_row.indisunique
        and not index_row.indisprimary
        and not index_row.indisexclusion
        and not index_row.indisclustered
        and not index_row.indisreplident
        and not index_row.indnullsnotdistinct
        and pg_get_indexdef(index_row.indexrelid) = format(
          'CREATE INDEX %I ON public.%I USING btree (%I)',
          v_target.index_name,
          v_target.table_name,
          v_target.column_name
        )
    ) then
      raise exception using message = 'PRO04_LOT04_POSTCHECK_INDEX_FAILED';
    end if;

    select count(*)
    into v_covering_index_count
    from pg_index index_row
    join pg_attribute source_column
      on source_column.attrelid = index_row.indrelid
     and source_column.attname = v_target.column_name
     and not source_column.attisdropped
    where index_row.indrelid =
        format('public.%I', v_target.table_name)::regclass
      and index_row.indisvalid
      and index_row.indisready
      and index_row.indislive
      and index_row.indpred is null
      and index_row.indexprs is null
      and index_row.indnkeyatts >= 1
      and index_row.indkey[0] = source_column.attnum;

    if v_covering_index_count <> 1 then
      raise exception using message = 'PRO04_LOT04_POSTCHECK_COVERAGE_FAILED';
    end if;
  end loop;

  if v_expected_staging_rows is null
    or v_expected_establishment_rows is null
    or (select count(*) from public.establishment_import_staging)
      <> v_expected_staging_rows
    or (select count(*) from public.establishments)
      <> v_expected_establishment_rows
  then
    raise exception using message = 'PRO04_LOT04_BUSINESS_ROWS_CHANGED';
  end if;
end
$postcheck$;

commit;
