-- PRO-03.4 — EXECUTED AND VERIFIED IN PRODUCTION ON 2026-08-21
-- Project: Ecoles237 (umcwwynrftidytxgqkwi). Post-check: 14/14 policies.
-- Wave D: payroll, messaging, imports and sensitive writes. Owner rights only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy if exists "Systeme peut enregistrer le cout IA" on public.ai_usage;
create policy "Systeme peut enregistrer le cout IA"
  on public.ai_usage for insert to authenticated
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = ai_usage.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          ai_usage.import_id is null
          or exists (
            select 1 from public.school_setup_imports batch
            where batch.id = ai_usage.import_id
              and batch.etablissement_id = ai_usage.etablissement_id
          )
        )
    )
  );

drop policy if exists bulletin_historique_directeur on public.bulletin_paie_historique;
create policy bulletin_historique_directeur
  on public.bulletin_paie_historique for all to authenticated
  using (
    exists (
      select 1
      from public.bulletins_paie payroll
      join public.establishments e on e.id = payroll.etablissement_id
      where payroll.id = bulletin_paie_historique.bulletin_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.bulletins_paie payroll
      join public.establishments e on e.id = payroll.etablissement_id
      where payroll.id = bulletin_paie_historique.bulletin_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists bulletin_lignes_directeur on public.bulletin_paie_lignes;
create policy bulletin_lignes_directeur
  on public.bulletin_paie_lignes for all to authenticated
  using (
    exists (
      select 1
      from public.bulletins_paie payroll
      join public.establishments e on e.id = payroll.etablissement_id
      where payroll.id = bulletin_paie_lignes.bulletin_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.bulletins_paie payroll
      join public.establishments e on e.id = payroll.etablissement_id
      where payroll.id = bulletin_paie_lignes.bulletin_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists bulletins_directeur on public.bulletins_paie;
create policy bulletins_directeur
  on public.bulletins_paie for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = bulletins_paie.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = bulletins_paie.staff_member_id
        and sm.etablissement_id = bulletins_paie.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists messages_directeur on public.messages;
create policy messages_directeur
  on public.messages for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = messages.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = messages.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists payroll_config_scope on public.payroll_config;
create policy payroll_config_scope
  on public.payroll_config for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = payroll_config.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = payroll_config.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists primes_directeur on public.primes;
create policy primes_directeur
  on public.primes for all to authenticated
  using (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = primes.staff_member_id
        and e.owner_id = (select auth.uid())
        and (
          primes.type_prime_id is null
          or exists (
            select 1 from public.types_primes kind
            where kind.id = primes.type_prime_id
              and kind.etablissement_id = sm.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = primes.staff_member_id
        and e.owner_id = (select auth.uid())
        and (
          primes.type_prime_id is null
          or exists (
            select 1 from public.types_primes kind
            where kind.id = primes.type_prime_id
              and kind.etablissement_id = sm.etablissement_id
          )
        )
    )
  );

drop policy if exists retenues_directeur on public.retenues;
create policy retenues_directeur
  on public.retenues for all to authenticated
  using (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = retenues.staff_member_id
        and e.owner_id = (select auth.uid())
        and (
          retenues.type_retenue_id is null
          or exists (
            select 1 from public.types_retenues kind
            where kind.id = retenues.type_retenue_id
              and kind.etablissement_id = sm.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = retenues.staff_member_id
        and e.owner_id = (select auth.uid())
        and (
          retenues.type_retenue_id is null
          or exists (
            select 1 from public.types_retenues kind
            where kind.id = retenues.type_retenue_id
              and kind.etablissement_id = sm.etablissement_id
          )
        )
    )
  );

drop policy if exists types_primes_scope on public.types_primes;
create policy types_primes_scope
  on public.types_primes for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = types_primes.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = types_primes.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists types_retenues_scope on public.types_retenues;
create policy types_retenues_scope
  on public.types_retenues for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = types_retenues.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = types_retenues.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Directeur gere ses imports" on public.school_setup_imports;
create policy "Directeur gere ses imports"
  on public.school_setup_imports for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = school_setup_imports.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          school_setup_imports.target_annee_scolaire_id is null
          or exists (
            select 1 from public.annees_scolaires school_year
            where school_year.id = school_setup_imports.target_annee_scolaire_id
              and school_year.etablissement_id = school_setup_imports.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = school_setup_imports.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          school_setup_imports.target_annee_scolaire_id is null
          or exists (
            select 1 from public.annees_scolaires school_year
            where school_year.id = school_setup_imports.target_annee_scolaire_id
              and school_year.etablissement_id = school_setup_imports.etablissement_id
          )
        )
    )
  );

drop policy if exists "Directeur gere ses fichiers d'import" on public.school_setup_files;
create policy "Directeur gere ses fichiers d'import"
  on public.school_setup_files for all to authenticated
  using (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_files.import_id
        and batch.etablissement_id = school_setup_files.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_files.import_id
        and batch.etablissement_id = school_setup_files.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Directeur gere ses brouillons d'import" on public.school_setup_drafts;
create policy "Directeur gere ses brouillons d'import"
  on public.school_setup_drafts for all to authenticated
  using (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_drafts.import_id
        and batch.etablissement_id = school_setup_drafts.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          school_setup_drafts.source_file_id is null
          or exists (
            select 1 from public.school_setup_files source_file
            where source_file.id = school_setup_drafts.source_file_id
              and source_file.import_id = school_setup_drafts.import_id
              and source_file.etablissement_id = school_setup_drafts.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_drafts.import_id
        and batch.etablissement_id = school_setup_drafts.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          school_setup_drafts.source_file_id is null
          or exists (
            select 1 from public.school_setup_files source_file
            where source_file.id = school_setup_drafts.source_file_id
              and source_file.import_id = school_setup_drafts.import_id
              and source_file.etablissement_id = school_setup_drafts.etablissement_id
          )
        )
    )
  );

drop policy if exists "Directeur gere les issues de ses imports" on public.school_setup_issues;
create policy "Directeur gere les issues de ses imports"
  on public.school_setup_issues for all to authenticated
  using (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_issues.import_id
        and batch.etablissement_id = school_setup_issues.etablissement_id
        and e.owner_id = (select auth.uid())
        and not exists (
          select 1
          from unnest(school_setup_issues.related_draft_ids) related_draft_id
          where not exists (
            select 1 from public.school_setup_drafts related_draft
            where related_draft.id = related_draft_id
              and related_draft.import_id = school_setup_issues.import_id
              and related_draft.etablissement_id = school_setup_issues.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.school_setup_imports batch
      join public.establishments e on e.id = batch.etablissement_id
      where batch.id = school_setup_issues.import_id
        and batch.etablissement_id = school_setup_issues.etablissement_id
        and e.owner_id = (select auth.uid())
        and not exists (
          select 1
          from unnest(school_setup_issues.related_draft_ids) related_draft_id
          where not exists (
            select 1 from public.school_setup_drafts related_draft
            where related_draft.id = related_draft_id
              and related_draft.import_id = school_setup_issues.import_id
              and related_draft.etablissement_id = school_setup_issues.etablissement_id
          )
        )
    )
  );

commit;
