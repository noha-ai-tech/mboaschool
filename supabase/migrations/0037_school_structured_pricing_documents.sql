-- GUYSKULL-02 / 0037 — structured pricing and document metadata.
-- Stage A only: prepared locally, never applied by this mission.
begin;

do $$
declare
  v_final boolean := to_regclass('public.school_fee_schedules') is not null;
begin
  if to_regclass('public.fees') is null or to_regclass('public.school_documents') is null
     or to_regprocedure('public.publish_school_page(uuid,timestamp with time zone)') is null then
    raise exception 'GUYSKULL_0037_PREFLIGHT_BASELINE_MISSING';
  end if;
  if md5(pg_get_functiondef('public.publish_school_page(uuid,timestamp with time zone)'::regprocedure)) <> 'f47fdb855ed5830814f15045a5157398'
     or md5(pg_get_functiondef('public.discard_school_page_draft(uuid,timestamp with time zone,jsonb)'::regprocedure)) <> 'b02e52187172d15100412bb637e22067'
     or exists (
       select 1 from pg_proc p
       where p.oid in (
         'public.publish_school_page(uuid,timestamp with time zone)'::regprocedure,
         'public.discard_school_page_draft(uuid,timestamp with time zone,jsonb)'::regprocedure
       )
       and (p.prosecdef or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.proowner <> 'postgres'::regrole)
     ) then
    raise exception 'GUYSKULL_0037_PREFLIGHT_RPC_DRIFT';
  end if;
  if not v_final then
    if exists (select 1 from public.school_documents where establishment_id is null) then
      raise exception 'GUYSKULL_0037_PREFLIGHT_DOCUMENT_WITHOUT_SCHOOL';
    end if;
    if (select count(*) from pg_policies where schemaname='public' and tablename='fees') <> 3
       or (select count(*) from pg_policies where schemaname='public' and tablename='school_documents') <> 2 then
      raise exception 'GUYSKULL_0037_PREFLIGHT_POLICY_DRIFT';
    end if;
    if (select array_agg(policyname order by policyname) from pg_policies where schemaname='public' and tablename='fees')
         is distinct from array['Owners can insert fees','Owners can update fees','Public can read fees']::name[]
       or (select array_agg(policyname order by policyname) from pg_policies where schemaname='public' and tablename='school_documents')
         is distinct from array['Owners can manage school documents','Public can read school documents']::name[] then
      raise exception 'GUYSKULL_0037_PREFLIGHT_POLICY_NAME_DRIFT';
    end if;
  else
    if to_regclass('public.school_fee_installments') is null
       or to_regclass('public.school_additional_fees') is null
       or to_regprocedure('public.publish_school_page_v2(uuid,timestamp with time zone)') is null then
      raise exception 'GUYSKULL_0037_PREFLIGHT_PARTIAL_STATE';
    end if;
  end if;
end $$;

create temporary table guyskull_0037_business_counts on commit drop as
select 'fees'::text as table_name, count(*)::bigint as row_count from public.fees
union all
select 'school_documents', count(*)::bigint from public.school_documents;

alter table public.fees add column if not exists is_qualified boolean not null default false;

create table if not exists public.school_fee_schedules (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  academic_year text not null check (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    and substring(academic_year from 6 for 4)::int = substring(academic_year from 1 for 4)::int + 1
  ),
  level_label text not null check (length(btrim(level_label)) between 1 and 120),
  registration_fee integer check (registration_fee between 0 and 2000000000),
  tuition_fee integer check (tuition_fee between 0 and 2000000000),
  currency text not null default 'FCFA' check (length(btrim(currency)) between 1 and 8),
  notes text check (notes is null or length(notes) <= 1000),
  position integer not null check (position between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, academic_year, position)
);

create table if not exists public.school_fee_installments (
  id uuid primary key default gen_random_uuid(),
  fee_schedule_id uuid not null references public.school_fee_schedules(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  position integer not null check (position between 0 and 23),
  amount integer not null check (amount between 0 and 2000000000),
  due_date date,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (fee_schedule_id, position)
);

create table if not exists public.school_additional_fees (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  academic_year text not null check (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    and substring(academic_year from 6 for 4)::int = substring(academic_year from 1 for 4)::int + 1
  ),
  category text not null check (category in ('application','uniform','sports_uniform','badge','supplies','insurance','ape_parent_contribution','exam','activity','transport','canteen','boarding','other')),
  label text not null check (length(btrim(label)) between 1 and 160),
  amount integer not null check (amount between 0 and 2000000000),
  mandatory boolean not null,
  frequency text not null check (length(btrim(frequency)) between 1 and 80),
  notes text check (notes is null or length(notes) <= 1000),
  position integer not null check (position between 0 and 199),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, academic_year, position)
);

create index if not exists school_fee_schedules_establishment_idx on public.school_fee_schedules(establishment_id);
create index if not exists school_fee_installments_schedule_idx on public.school_fee_installments(fee_schedule_id);
create index if not exists school_additional_fees_establishment_idx on public.school_additional_fees(establishment_id);

alter table public.school_fee_schedules enable row level security;
alter table public.school_fee_installments enable row level security;
alter table public.school_additional_fees enable row level security;

drop policy if exists school_fee_schedules_public_read on public.school_fee_schedules;
create policy school_fee_schedules_public_read on public.school_fee_schedules for select to anon, authenticated using (true);
drop policy if exists school_fee_installments_public_read on public.school_fee_installments;
create policy school_fee_installments_public_read on public.school_fee_installments for select to anon, authenticated using (true);
drop policy if exists school_additional_fees_public_read on public.school_additional_fees;
create policy school_additional_fees_public_read on public.school_additional_fees for select to anon, authenticated using (true);

-- No client role receives INSERT/UPDATE/DELETE. The publication RPC is the
-- only owner path; service_role/postgres retain the maintenance path.
revoke all on public.school_fee_schedules, public.school_fee_installments, public.school_additional_fees from public, anon, authenticated;
grant select on public.school_fee_schedules, public.school_fee_installments, public.school_additional_fees to anon, authenticated;
grant all on public.school_fee_schedules, public.school_fee_installments, public.school_additional_fees to service_role;

drop policy if exists "Owners can insert fees" on public.fees;
drop policy if exists "Owners can update fees" on public.fees;
drop policy if exists "Public can read fees" on public.fees;
drop policy if exists fees_public_read on public.fees;
create policy fees_public_read on public.fees for select to anon, authenticated using (true);
revoke all on public.fees from public, anon, authenticated;
grant select on public.fees to anon, authenticated;
grant all on public.fees to service_role;

alter table public.school_documents add column if not exists academic_year text;
alter table public.school_documents add column if not exists mime_type text;
alter table public.school_documents add column if not exists description text;
alter table public.school_documents add column if not exists is_public boolean not null default true;
alter table public.school_documents add column if not exists status text not null default 'live';
alter table public.school_documents alter column establishment_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='school_documents_academic_year_check' and conrelid='public.school_documents'::regclass) then
    alter table public.school_documents add constraint school_documents_academic_year_check check (academic_year is null or academic_year ~ '^[0-9]{4}-[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='school_documents_status_check' and conrelid='public.school_documents'::regclass) then
    alter table public.school_documents add constraint school_documents_status_check check (status = 'live');
  end if;
  if not exists (select 1 from pg_constraint where conname='school_documents_public_only_check' and conrelid='public.school_documents'::regclass) then
    alter table public.school_documents add constraint school_documents_public_only_check check (is_public);
  end if;
end $$;

drop policy if exists "Owners can manage school documents" on public.school_documents;
drop policy if exists "Public can read school documents" on public.school_documents;
drop policy if exists school_documents_owner_write on public.school_documents;
drop policy if exists school_documents_public_live_read on public.school_documents;
create policy school_documents_owner_write on public.school_documents for all to authenticated
  using (exists (select 1 from public.establishments e where e.id=school_documents.establishment_id and e.owner_id=(select auth.uid())))
  with check (
    split_part(storage_path, '/', 1) = establishment_id::text
    and status = 'live'
    and is_public
    and exists (select 1 from public.establishments e where e.id=school_documents.establishment_id and e.owner_id=(select auth.uid()))
  );
create policy school_documents_public_live_read on public.school_documents for select to anon, authenticated
  using (status='live' and is_public);
revoke all on public.school_documents from public, anon, authenticated;
grant select on public.school_documents to anon, authenticated;
grant insert, update, delete on public.school_documents to authenticated;
grant all on public.school_documents to service_role;

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

revoke all on function public.publish_school_page(uuid,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.publish_school_page_v2(uuid,timestamptz) from public, anon, service_role;
grant execute on function public.publish_school_page_v2(uuid,timestamptz) to authenticated;

do $$ begin
  if not exists (select 1 from pg_proc where oid='public.publish_school_page_v2(uuid,timestamp with time zone)'::regprocedure and prosecdef and proconfig=array['search_path=""']::text[]) then
    raise exception 'GUYSKULL_0037_POSTCHECK_RPC';
  end if;
  if has_function_privilege('anon','public.publish_school_page_v2(uuid,timestamp with time zone)','EXECUTE')
     or not has_function_privilege('authenticated','public.publish_school_page_v2(uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'GUYSKULL_0037_POSTCHECK_RPC_ACL';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('school_fee_schedules','school_fee_installments','school_additional_fees')) <> 3 then
    raise exception 'GUYSKULL_0037_POSTCHECK_RLS';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='school_documents' and policyname='school_documents_owner_write'
      and with_check ilike '%split_part(storage_path%establishment_id%status%live%is_public%'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid='public.school_documents'::regclass and conname='school_documents_public_only_check'
      and pg_get_constraintdef(oid) = 'CHECK (is_public)'
  ) then
    raise exception 'GUYSKULL_0037_POSTCHECK_DOCUMENT_BOUNDARY';
  end if;
  if (select count(*) from public.fees) <> (select row_count from guyskull_0037_business_counts where table_name='fees')
     or (select count(*) from public.school_documents) <> (select row_count from guyskull_0037_business_counts where table_name='school_documents') then
    raise exception 'GUYSKULL_0037_POSTCHECK_BUSINESS_COUNT_CHANGED';
  end if;
end $$;

commit;
