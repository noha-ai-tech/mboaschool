-- ============================================================================
-- 0038_school_fee_matrix_extension.sql
--
-- PRICING-01 — additive evolution of the 0037 structured-pricing model into
-- a generic Écoles237 fee-matrix module. NOT APPLIED TO PRODUCTION BY
-- PRICING-01 — this file is a reviewed, locally-tested PROPOSAL. Production
-- application requires the separate PRICING-01B security/preflight gate,
-- which must re-verify the checksums below against live state before
-- running this file (state may have drifted since this file was authored).
--
-- WHY EXTEND RATHER THAN REPLACE — audited 0037 first (PRICING-01 §1):
--   - school_fee_schedules (one row per level per academic_year) already
--     IS the "grid" concept — no separate school_fee_grids/school_fee_levels
--     table is needed, it would just duplicate this one.
--   - school_fee_installments already supports an arbitrary number of
--     tranches (0-24) with label/amount/position/due_date/notes — no change
--     needed here at all.
--   - school_additional_fees (one row per fee, free label + category +
--     amount + frequency text + position) already supports MULTIPLE rows
--     of the same category — so transport zones ("Zone A — Bonamoussadi /
--     Makepe", "Zone B — PK8 / PK10 / PK12", ...) and canteen periodicities
--     ("25 000 FCFA / mois") are each just additional_fees rows with
--     category='transport' / 'canteen' and a descriptive label + the
--     existing free-text `frequency` column as the periodicity. No new
--     school_transport_zones table is needed — one would just be a second,
--     competing way to express the same "labeled fee with an amount and a
--     period" concept 0037 already has.
--   - The one genuine gap: additional_fees can only say "mandatory: true/
--     false" — there is no way to express "included" (no separate charge)
--     or "contact the school" (amount genuinely unknown) without lying
--     with a fake 0 FCFA or a fabricated amount. This file replaces the
--     boolean with a `status` enum and makes `amount` nullable exactly
--     when status = 'contact'.
--   - school_fee_schedules also gains an optional `cycle` free-text column
--     (e.g. "Maternelle") for the public year/cycle grouping — nullable,
--     so every existing row (Guyskull's included) keeps working unchanged
--     with no cycle grouping until a school chooses to set one.
--
-- Everything else about 0037 (installments, publish_school_page_v2's
-- ownership/draft-conflict/structural-validation gates, RLS, grants) is
-- kept exactly as-is — this is a `create or replace function` on the same
-- signature, not a new function, and no grant/revoke statements are needed
-- since none of the ACL surface changes.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.school_fee_schedules') is null
     or to_regclass('public.school_additional_fees') is null
     or to_regprocedure('public.publish_school_page_v2(uuid,timestamp with time zone)') is null then
    raise exception 'PRICING_01_PREFLIGHT_0037_MISSING';
  end if;
  -- Live-verified 2026-09-02 against umcwwynrftidytxgqkwi. PRICING-01B MUST
  -- re-run this exact preflight query against live production immediately
  -- before applying — if either checksum has drifted, STOP and re-audit,
  -- do not edit these constants to force a match.
  if md5(pg_get_functiondef('public.publish_school_page(uuid,timestamp with time zone)'::regprocedure)) <> 'f47fdb855ed5830814f15045a5157398'
     or md5(pg_get_functiondef('public.publish_school_page_v2(uuid,timestamp with time zone)'::regprocedure)) <> '513b9da8ba0cd8fa2681a84fa84ad099' then
    raise exception 'PRICING_01_PREFLIGHT_RPC_DRIFT';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_fee_schedules' and column_name='cycle')
     or exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='status') then
    raise exception 'PRICING_01_PREFLIGHT_ALREADY_APPLIED';
  end if;
end $$;

create temporary table pricing_01_business_counts on commit drop as
select 'school_fee_schedules'::text as table_name, count(*)::bigint as row_count from public.school_fee_schedules
union all
select 'school_additional_fees', count(*)::bigint from public.school_additional_fees
union all
select 'school_fee_installments', count(*)::bigint from public.school_fee_installments;

-- ============================================================================
-- 1. school_fee_schedules.cycle — optional free-text grouping (e.g.
--    "Maternelle", "Primaire", "Secondaire", or any school-specific value —
--    deliberately not an enum, per the mission's explicit "do not hardcode
--    these examples" instruction).
-- ============================================================================
alter table public.school_fee_schedules
  add column if not exists cycle text
  check (cycle is null or length(btrim(cycle)) between 1 and 60);

comment on column public.school_fee_schedules.cycle is
  'PRICING-01 — optional free-text cycle/section grouping for the public fee matrix (e.g. "Maternelle"). NULL = no cycle grouping, the level renders in a flat list. Never a fixed enum — every Cameroon school system differs.';

-- ============================================================================
-- 2. school_additional_fees.status — replaces the boolean `mandatory` with
--    a 4-state status so "included" (no separate charge) and "contact"
--    (amount genuinely unknown) can be expressed honestly instead of a
--    fabricated 0 FCFA or an invented amount.
-- ============================================================================
alter table public.school_additional_fees add column if not exists status text;

update public.school_additional_fees
  set status = case when mandatory then 'mandatory' else 'optional' end
  where status is null;

alter table public.school_additional_fees
  alter column status set not null,
  alter column status set default 'mandatory';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_additional_fees_status_check') then
    alter table public.school_additional_fees
      add constraint school_additional_fees_status_check
      check (status in ('mandatory','optional','included','contact'));
  end if;
end $$;

alter table public.school_additional_fees alter column amount drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_additional_fees_amount_status_check') then
    alter table public.school_additional_fees
      add constraint school_additional_fees_amount_status_check
      check ((status = 'contact' and amount is null) or (status <> 'contact' and amount is not null));
  end if;
end $$;

alter table public.school_additional_fees drop column mandatory;

comment on column public.school_additional_fees.status is
  'PRICING-01 — mandatory | optional | included | contact. Replaces the old boolean `mandatory` column (backfilled: true -> mandatory, false -> optional). "included" = covered by tuition, no separate charge (never expressed as amount=0). "contact" = amount genuinely unpublished; amount must be NULL in that case (school_additional_fees_amount_status_check).';

-- ============================================================================
-- 3. publish_school_page_v2 — same signature, same ownership/draft-conflict/
--    structural-validation gates as 0037, extended to validate and write
--    the new cycle/status fields. Historical 29,000 FCFA safety unchanged:
--    this function has never read or written the legacy flat fee columns
--    except `fees.is_qualified`/`fees.currency`, which stay exactly as
--    0037 left them.
-- ============================================================================
create or replace function public.publish_school_page_v2(
  p_establishment_id uuid,
  p_expected_draft_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_schedule jsonb;
  v_installment jsonb;
  v_fee jsonb;
  v_schedule_id uuid;
  v_result jsonb;
begin
  if not exists (select 1 from public.establishments e where e.id=p_establishment_id and e.owner_id=(select auth.uid())) then
    return jsonb_build_object('ok',false,'error_code','NOT_AUTHORIZED','error','Établissement introuvable ou non autorisé pour cet utilisateur.');
  end if;

  select d.payload into v_payload from public.school_page_drafts d
    where d.establishment_id=p_establishment_id and d.updated_at=p_expected_draft_updated_at for update;
  if not found then
    return jsonb_build_object('ok',false,'error_code','DRAFT_CONFLICT','error','Le brouillon a été modifié depuis votre dernière lecture.');
  end if;
  if jsonb_typeof(v_payload->'pricing') is distinct from 'object'
     or jsonb_typeof(v_payload->'pricing'->'schedules') is distinct from 'array'
     or jsonb_typeof(v_payload->'pricing'->'additional_fees') is distinct from 'array'
     or jsonb_typeof(v_payload->'pricing'->'legacy_amounts_qualified') is distinct from 'boolean'
     or jsonb_array_length(v_payload->'pricing'->'schedules') > 100
     or jsonb_array_length(v_payload->'pricing'->'additional_fees') > 200 then
    return jsonb_build_object('ok',false,'error_code','PRICING_INVALID','error','La structure des tarifs est invalide.');
  end if;

  for v_schedule in select * from jsonb_array_elements(v_payload->'pricing'->'schedules') loop
    if jsonb_typeof(v_schedule) is distinct from 'object' or coalesce(v_schedule->>'academic_year','') !~ '^[0-9]{4}-[0-9]{4}$'
       or length(btrim(coalesce(v_schedule->>'level_label',''))) not between 1 and 120
       or jsonb_typeof(v_schedule->'position') is distinct from 'number'
       or (v_schedule->>'position')::numeric <> trunc((v_schedule->>'position')::numeric)
       or (v_schedule->>'position')::numeric not between 0 and 99
       or jsonb_typeof(v_schedule->'installments') is distinct from 'array'
       or jsonb_array_length(v_schedule->'installments') > 24
       or (v_schedule ? 'cycle' and jsonb_typeof(v_schedule->'cycle') is distinct from 'null'
           and (jsonb_typeof(v_schedule->'cycle') is distinct from 'string' or length(btrim(v_schedule->>'cycle')) not between 1 and 60))
    then
      return jsonb_build_object('ok',false,'error_code','PRICING_INVALID','error','Un tarif par niveau est invalide.');
    end if;
    for v_installment in select * from jsonb_array_elements(v_schedule->'installments') loop
      if jsonb_typeof(v_installment->'amount') is distinct from 'number' or (v_installment->>'amount')::numeric < 0
         or jsonb_typeof(v_installment->'position') is distinct from 'number'
         or (v_installment->>'position')::numeric <> trunc((v_installment->>'position')::numeric)
         or (v_installment->>'position')::numeric not between 0 and 23
         or length(btrim(coalesce(v_installment->>'label',''))) not between 1 and 120 then
        return jsonb_build_object('ok',false,'error_code','PRICING_INVALID','error','Une tranche est invalide.');
      end if;
    end loop;
  end loop;
  for v_fee in select * from jsonb_array_elements(v_payload->'pricing'->'additional_fees') loop
    if coalesce(v_fee->>'status','') <> all(array['mandatory','optional','included','contact'])
       or (
         v_fee->>'status' = 'contact'
         and jsonb_typeof(v_fee->'amount') is distinct from 'null'
       )
       or (
         v_fee->>'status' <> 'contact'
         and (jsonb_typeof(v_fee->'amount') is distinct from 'number' or (v_fee->>'amount')::numeric < 0)
       )
       or coalesce(v_fee->>'academic_year','') !~ '^[0-9]{4}-[0-9]{4}$'
       or coalesce(v_fee->>'category','') <> all(array['application','uniform','sports_uniform','badge','supplies','insurance','ape_parent_contribution','exam','activity','transport','canteen','boarding','other'])
       or jsonb_typeof(v_fee->'position') is distinct from 'number'
       or (v_fee->>'position')::numeric <> trunc((v_fee->>'position')::numeric)
       or (v_fee->>'position')::numeric not between 0 and 199 then
      return jsonb_build_object('ok',false,'error_code','PRICING_INVALID','error','Un frais additionnel est invalide.');
    end if;
  end loop;

  begin
    v_result := public.publish_school_page(p_establishment_id,p_expected_draft_updated_at);
    if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

    delete from public.school_fee_schedules where establishment_id=p_establishment_id;
    delete from public.school_additional_fees where establishment_id=p_establishment_id;
    for v_schedule in select * from jsonb_array_elements(v_payload->'pricing'->'schedules') loop
      insert into public.school_fee_schedules(establishment_id,academic_year,level_label,cycle,registration_fee,tuition_fee,currency,notes,position)
      values (p_establishment_id,v_schedule->>'academic_year',v_schedule->>'level_label',nullif(v_schedule->>'cycle',''),nullif(v_schedule->>'registration_fee','')::integer,nullif(v_schedule->>'tuition_fee','')::integer,v_schedule->>'currency',nullif(v_schedule->>'notes',''),(v_schedule->>'position')::integer)
      returning id into v_schedule_id;
      for v_installment in select * from jsonb_array_elements(v_schedule->'installments') loop
        insert into public.school_fee_installments(fee_schedule_id,label,position,amount,due_date,notes)
        values(v_schedule_id,v_installment->>'label',(v_installment->>'position')::integer,(v_installment->>'amount')::integer,nullif(v_installment->>'due_date','')::date,nullif(v_installment->>'notes',''));
      end loop;
    end loop;
    for v_fee in select * from jsonb_array_elements(v_payload->'pricing'->'additional_fees') loop
      insert into public.school_additional_fees(establishment_id,academic_year,category,label,amount,status,frequency,notes,position)
      values(p_establishment_id,v_fee->>'academic_year',v_fee->>'category',v_fee->>'label',nullif(v_fee->>'amount','')::integer,v_fee->>'status',v_fee->>'frequency',nullif(v_fee->>'notes',''),(v_fee->>'position')::integer);
    end loop;
    update public.fees set
      is_qualified=(v_payload->'pricing'->>'legacy_amounts_qualified')::boolean,
      currency=coalesce(nullif(v_payload->'pricing'->>'currency',''),'FCFA')
    where establishment_id=p_establishment_id;
  exception when others then
    raise log 'publish_school_page_v2 failed for establishment %: %',p_establishment_id,sqlerrm;
    return jsonb_build_object('ok',false,'error_code','PUBLISH_FAILED','error','La publication a échoué. Aucune modification n''a été appliquée.');
  end;
  return v_result;
end;
$$;

-- No grant/revoke statements: the ACL surface is unchanged from 0037
-- (authenticated EXECUTE on publish_school_page_v2 only; anon/service_role
-- still have none; direct client INSERT/UPDATE/DELETE on
-- school_fee_schedules/installments/additional_fees is still impossible —
-- CREATE OR REPLACE FUNCTION preserves existing grants on the same
-- signature, and the two ALTER TABLE column changes above do not touch
-- table-level or column-level grants).

-- ============================================================================
-- POSTCHECK — business continuity + shape verification.
-- ============================================================================
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select row_count into v_before from pricing_01_business_counts where table_name = 'school_fee_schedules';
  select count(*) into v_after from public.school_fee_schedules;
  if v_before <> v_after then raise exception 'PRICING_01_POSTCHECK_SCHEDULES_ROWCOUNT_CHANGED'; end if;

  select row_count into v_before from pricing_01_business_counts where table_name = 'school_additional_fees';
  select count(*) into v_after from public.school_additional_fees;
  if v_before <> v_after then raise exception 'PRICING_01_POSTCHECK_ADDITIONAL_FEES_ROWCOUNT_CHANGED'; end if;

  select row_count into v_before from pricing_01_business_counts where table_name = 'school_fee_installments';
  select count(*) into v_after from public.school_fee_installments;
  if v_before <> v_after then raise exception 'PRICING_01_POSTCHECK_INSTALLMENTS_ROWCOUNT_CHANGED'; end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_fee_schedules' and column_name='cycle' and is_nullable='YES') then
    raise exception 'PRICING_01_POSTCHECK_CYCLE_COLUMN_WRONG';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='mandatory') then
    raise exception 'PRICING_01_POSTCHECK_MANDATORY_COLUMN_STILL_PRESENT';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='status' and is_nullable='NO') then
    raise exception 'PRICING_01_POSTCHECK_STATUS_COLUMN_WRONG';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='amount' and is_nullable='NO') then
    raise exception 'PRICING_01_POSTCHECK_AMOUNT_STILL_NOT_NULL';
  end if;

  -- PRICING-0038-HOTFIX-VERIFY — the prior direct array-equality comparison
  -- (`proconfig is distinct from array['search_path=']`) could never
  -- succeed: PostgreSQL serializes `set search_path = ''` in proconfig as
  -- the GUC-list-quoted element `search_path=""` (two literal double-quote
  -- characters denoting one empty list element), not the bare, unquoted
  -- `search_path=`. Live-verified against the already-correct 0037
  -- function before ever relying on this check. pg_options_to_table()
  -- parses proconfig into proper (option_name, option_value) rows instead
  -- of relying on exact-array-literal/position matching, so this also
  -- correctly tolerates config-entry reordering and explicitly rejects any
  -- additional, unexpected proconfig entry (count <> 1) as well as a wrong
  -- value, a missing search_path entry, or a null/empty proconfig.
  if (
    select p.prosecdef is distinct from true
      or (select count(*) from pg_options_to_table(p.proconfig)) <> 1
      or not exists (
        select 1 from pg_options_to_table(p.proconfig) o
        where o.option_name = 'search_path' and o.option_value = '""'
      )
    from pg_proc p where p.oid = 'public.publish_school_page_v2(uuid,timestamp with time zone)'::regprocedure
  ) then
    raise exception 'PRICING_01_POSTCHECK_FUNCTION_SECURITY_PROPERTIES_CHANGED';
  end if;
  if has_function_privilege('anon','public.publish_school_page_v2(uuid,timestamp with time zone)','EXECUTE')
     or has_function_privilege('service_role','public.publish_school_page_v2(uuid,timestamp with time zone)','EXECUTE')
     or not has_function_privilege('authenticated','public.publish_school_page_v2(uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'PRICING_01_POSTCHECK_FUNCTION_ACL_CHANGED';
  end if;

  -- Historical 29,000 FCFA safety — untouched by this migration, verified
  -- explicitly rather than assumed.
  if exists (
    select 1 from public.fees f
    where f.establishment_id = 'a4cc4966-0d85-4c63-9c24-0538b8d5133b'
      and (f.tuition_fee is distinct from 29000 or f.is_qualified is distinct from false)
  ) then
    raise exception 'PRICING_01_POSTCHECK_GUYSKULL_LEGACY_FEE_CHANGED';
  end if;
end $$;

commit;
