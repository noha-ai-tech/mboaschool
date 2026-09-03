-- ============================================================================
-- PRICING-01_0038_ROLLBACK.sql
--
-- Exact rollback for 0038_school_fee_matrix_extension.sql. Restores
-- publish_school_page_v2 byte-for-byte to its 0037 body, restores
-- school_additional_fees.mandatory (backfilled from status), restores
-- amount NOT NULL, drops status and cycle. NOT applied by PRICING-01 —
-- kept alongside the migration for PRICING-01B.
-- ============================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_fee_schedules' and column_name='cycle')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='status') then
    raise exception 'PRICING_01_ROLLBACK_NOT_APPLIED';
  end if;
end $$;

-- Restore mandatory (backfilled from status: 'mandatory' -> true, anything
-- else -> false — 'included'/'contact' rows created only after 0038 have no
-- pre-0038 equivalent and are conservatively treated as non-mandatory on
-- rollback; review any such rows manually before relying on this restore).
alter table public.school_additional_fees add column if not exists mandatory boolean;
update public.school_additional_fees set mandatory = (status = 'mandatory') where mandatory is null;
alter table public.school_additional_fees alter column mandatory set not null;

alter table public.school_additional_fees drop constraint if exists school_additional_fees_amount_status_check;
alter table public.school_additional_fees drop constraint if exists school_additional_fees_status_check;

-- Any 'contact' rows have a NULL amount with no pre-0038 equivalent —
-- restoring NOT NULL would fail on them; review/resolve manually first.
do $$
begin
  if exists (select 1 from public.school_additional_fees where amount is null) then
    raise exception 'PRICING_01_ROLLBACK_NULL_AMOUNT_ROWS_PRESENT';
  end if;
end $$;
alter table public.school_additional_fees alter column amount set not null;

alter table public.school_additional_fees drop column status;
alter table public.school_fee_schedules drop column if exists cycle;

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
       or jsonb_array_length(v_schedule->'installments') > 24 then
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
    if jsonb_typeof(v_fee->'amount') is distinct from 'number' or (v_fee->>'amount')::numeric < 0
       or jsonb_typeof(v_fee->'mandatory') is distinct from 'boolean'
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
      insert into public.school_fee_schedules(establishment_id,academic_year,level_label,registration_fee,tuition_fee,currency,notes,position)
      values (p_establishment_id,v_schedule->>'academic_year',v_schedule->>'level_label',nullif(v_schedule->>'registration_fee','')::integer,nullif(v_schedule->>'tuition_fee','')::integer,v_schedule->>'currency',nullif(v_schedule->>'notes',''),(v_schedule->>'position')::integer)
      returning id into v_schedule_id;
      for v_installment in select * from jsonb_array_elements(v_schedule->'installments') loop
        insert into public.school_fee_installments(fee_schedule_id,label,position,amount,due_date,notes)
        values(v_schedule_id,v_installment->>'label',(v_installment->>'position')::integer,(v_installment->>'amount')::integer,nullif(v_installment->>'due_date','')::date,nullif(v_installment->>'notes',''));
      end loop;
    end loop;
    for v_fee in select * from jsonb_array_elements(v_payload->'pricing'->'additional_fees') loop
      insert into public.school_additional_fees(establishment_id,academic_year,category,label,amount,mandatory,frequency,notes,position)
      values(p_establishment_id,v_fee->>'academic_year',v_fee->>'category',v_fee->>'label',(v_fee->>'amount')::integer,(v_fee->>'mandatory')::boolean,v_fee->>'frequency',nullif(v_fee->>'notes',''),(v_fee->>'position')::integer);
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

do $$
begin
  if md5(pg_get_functiondef('public.publish_school_page_v2(uuid,timestamp with time zone)'::regprocedure)) <> '513b9da8ba0cd8fa2681a84fa84ad099' then
    raise exception 'PRICING_01_ROLLBACK_POSTCHECK_FUNCTION_MISMATCH';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_fee_schedules' and column_name='cycle')
     or exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_additional_fees' and column_name='status') then
    raise exception 'PRICING_01_ROLLBACK_POSTCHECK_COLUMNS_STILL_PRESENT';
  end if;
end $$;

commit;
