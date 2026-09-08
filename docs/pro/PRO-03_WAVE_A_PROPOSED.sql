-- PRO-03 — PROPOSED, NOT VALIDATED, NOT EXECUTED
-- Wave A: minimal read-only owner predicate. Do not execute without approval.

begin;

drop policy if exists "Directeur lit le cout IA de son etablissement"
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

commit;
