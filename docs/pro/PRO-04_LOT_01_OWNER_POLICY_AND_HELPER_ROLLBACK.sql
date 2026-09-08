-- PRO-04 / Lot 01 rollback — exact 2026-08-22 production semantics.
-- PROPOSAL ONLY.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.is_own_establishment(
  p_etablissement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.establishments e
    where e.id = p_etablissement_id
      and e.owner_id = auth.uid()
  );
$function$;

alter function public.is_own_establishment(uuid) owner to postgres;
revoke execute on function public.is_own_establishment(uuid) from public;
grant execute on function public.is_own_establishment(uuid)
  to anon, authenticated, service_role;

drop policy "Directeur lit le cout IA de son etablissement"
  on public.ai_usage;
create policy "Directeur lit le cout IA de son etablissement"
  on public.ai_usage
  for select
  to public
  using (public.is_own_establishment(etablissement_id));

drop policy admissions_config_owner_write
  on public.admissions_config;
create policy admissions_config_owner_write
  on public.admissions_config
  for all
  to public
  using (public.is_own_establishment(establishment_id))
  with check (public.is_own_establishment(establishment_id));

drop policy school_page_drafts_owner_only
  on public.school_page_drafts;
create policy school_page_drafts_owner_only
  on public.school_page_drafts
  for all
  to public
  using (public.is_own_establishment(establishment_id))
  with check (public.is_own_establishment(establishment_id));

commit;
