-- GUYSKULL-02 / 0037 rollback. DESTRUCTIVE for structured pricing rows and
-- new document metadata. Export those values before any production use.
-- Restores the exact production ACL/policy shape captured on 2026-08-30.
begin;

do $$ begin
  if to_regprocedure('public.publish_school_page_v2(uuid,timestamp with time zone)') is null
     or to_regclass('public.school_fee_schedules') is null
     or to_regclass('public.school_fee_installments') is null
     or to_regclass('public.school_additional_fees') is null then
    raise exception 'GUYSKULL_0037_ROLLBACK_UNEXPECTED_STATE';
  end if;
end $$;

drop function public.publish_school_page_v2(uuid,timestamptz);
grant execute on function public.publish_school_page(uuid,timestamptz) to authenticated;

drop table public.school_fee_installments;
drop table public.school_fee_schedules;
drop table public.school_additional_fees;

drop policy if exists fees_public_read on public.fees;
create policy "Owners can insert fees" on public.fees for insert
  with check (exists(select 1 from public.establishments e where e.id=fees.establishment_id and e.owner_id=auth.uid()));
create policy "Owners can update fees" on public.fees for update
  using (exists(select 1 from public.establishments e where e.id=fees.establishment_id and e.owner_id=auth.uid()));
create policy "Public can read fees" on public.fees for select using (true);
grant all on public.fees to anon, authenticated, service_role;
alter table public.fees drop column is_qualified;

drop policy if exists school_documents_owner_write on public.school_documents;
drop policy if exists school_documents_public_live_read on public.school_documents;
create policy "Owners can manage school documents" on public.school_documents for all
  using (exists(select 1 from public.establishments e where e.id=school_documents.establishment_id and e.owner_id=auth.uid()));
create policy "Public can read school documents" on public.school_documents for select using (true);
grant all on public.school_documents to anon, authenticated, service_role;
alter table public.school_documents alter column establishment_id drop not null;
alter table public.school_documents drop constraint school_documents_academic_year_check;
alter table public.school_documents drop constraint school_documents_status_check;
alter table public.school_documents drop constraint school_documents_public_only_check;
alter table public.school_documents drop column academic_year;
alter table public.school_documents drop column mime_type;
alter table public.school_documents drop column description;
alter table public.school_documents drop column is_public;
alter table public.school_documents drop column status;

do $$ begin
  if to_regprocedure('public.publish_school_page_v2(uuid,timestamp with time zone)') is not null
     or to_regclass('public.school_fee_schedules') is not null
     or (select count(*) from pg_policies where schemaname='public' and tablename='fees') <> 3 then
    raise exception 'GUYSKULL_0037_ROLLBACK_POSTCHECK_FAILED';
  end if;
end $$;

commit;
