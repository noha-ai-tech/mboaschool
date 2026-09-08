-- PRO-04 / Lot 04 rollback.
-- PROPOSAL ONLY. Run only after a confirmed regression and explicit approval.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
declare
  v_target record;
  v_covering_index_count integer;
  v_staging_rows bigint;
  v_establishment_rows bigint;
begin
  select count(*) into v_staging_rows
  from public.establishment_import_staging;
  select count(*) into v_establishment_rows
  from public.establishments;

  perform set_config(
    'pro04.lot04.rollback_establishment_import_staging_rows',
    v_staging_rows::text,
    true
  );
  perform set_config(
    'pro04.lot04.rollback_establishments_rows',
    v_establishment_rows::text,
    true
  );

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
      raise exception using message = 'PRO04_LOT04_ROLLBACK_INDEX_DRIFT';
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
      raise exception using message = 'PRO04_LOT04_ROLLBACK_COVERAGE_DRIFT';
    end if;
  end loop;
end
$preflight$;

do $rollback$
declare
  v_index_name text;
begin
  foreach v_index_name in array array[
    'idx_establishment_import_staging_arrondissement_id',
    'idx_establishment_import_staging_department_id',
    'idx_establishment_import_staging_duplicate_of_establishment_id',
    'idx_establishment_import_staging_duplicate_of_staging_id',
    'idx_establishment_import_staging_promoted_establishment_id',
    'idx_establishment_import_staging_region_id',
    'idx_establishments_arrondissement_id',
    'idx_establishments_owner_id'
  ]
  loop
    execute format('drop index public.%I', v_index_name);
  end loop;
end
$rollback$;

do $postcheck$
declare
  v_target record;
  v_expected_staging_rows bigint := nullif(
    current_setting(
      'pro04.lot04.rollback_establishment_import_staging_rows',
      true
    ),
    ''
  )::bigint;
  v_expected_establishment_rows bigint := nullif(
    current_setting('pro04.lot04.rollback_establishments_rows', true),
    ''
  )::bigint;
begin
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
    if to_regclass(format('public.%I', v_target.index_name)) is not null then
      raise exception using message =
        'PRO04_LOT04_ROLLBACK_POSTCHECK_INDEX_FAILED';
    end if;

    if exists (
      select 1
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
        and index_row.indkey[0] = source_column.attnum
    ) then
      raise exception using message =
        'PRO04_LOT04_ROLLBACK_POSTCHECK_COVERAGE_FAILED';
    end if;
  end loop;

  if v_expected_staging_rows is null
    or v_expected_establishment_rows is null
    or (select count(*) from public.establishment_import_staging)
      <> v_expected_staging_rows
    or (select count(*) from public.establishments)
      <> v_expected_establishment_rows
  then
    raise exception using message =
      'PRO04_LOT04_ROLLBACK_BUSINESS_ROWS_CHANGED';
  end if;
end
$postcheck$;

commit;
