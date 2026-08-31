-- PRO-03.4 — EXECUTED IN PRODUCTION ON 2026-08-21
-- Post-check: 12/12 policies authenticated-only, explicit USING/WITH CHECK;
-- business row counts unchanged.
-- Wave B: personnel, enseignants, sections and subjects. Owner rights only.
-- Existing self-read policies are intentionally not changed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy if exists absences_directeur on public.absences;
create policy absences_directeur
  on public.absences for all to authenticated
  using (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = absences.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = absences.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists conges_scope on public.conges_vacances;
create policy conges_scope
  on public.conges_vacances for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = conges_vacances.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = conges_vacances.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists ed_scope on public.enseignant_disponibilites;
create policy ed_scope
  on public.enseignant_disponibilites for all to authenticated
  using (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_disponibilites.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_disponibilites.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists em_scope on public.enseignant_matieres;
create policy em_scope
  on public.enseignant_matieres for all to authenticated
  using (
    exists (
      select 1
      from public.enseignants teacher
      join public.matieres subject
        on subject.id = enseignant_matieres.matiere_id
       and subject.etablissement_id = teacher.etablissement_id
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_matieres.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.enseignants teacher
      join public.matieres subject
        on subject.id = enseignant_matieres.matiere_id
       and subject.etablissement_id = teacher.etablissement_id
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_matieres.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists enseignants_scope on public.enseignants;
create policy enseignants_scope
  on public.enseignants for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = enseignants.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = enseignants.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists matieres_scope on public.matieres;
create policy matieres_scope
  on public.matieres for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = matieres.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = matieres.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists mvh_scope on public.matieres_volume_horaire;
create policy mvh_scope
  on public.matieres_volume_horaire for all to authenticated
  using (
    exists (
      select 1
      from public.matieres subject
      join public.establishments e on e.id = subject.etablissement_id
      where subject.id = matieres_volume_horaire.matiere_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.matieres subject
      join public.establishments e on e.id = subject.etablissement_id
      where subject.id = matieres_volume_horaire.matiere_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists sections_scope on public.sections;
create policy sections_scope
  on public.sections for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = sections.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          sections.responsable_staff_member_id is null
          or exists (
            select 1 from public.staff_members responsible
            where responsible.id = sections.responsable_staff_member_id
              and responsible.etablissement_id = sections.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = sections.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          sections.responsable_staff_member_id is null
          or exists (
            select 1 from public.staff_members responsible
            where responsible.id = sections.responsable_staff_member_id
              and responsible.etablissement_id = sections.etablissement_id
          )
        )
    )
  );

drop policy if exists staff_contracts_director on public.staff_contracts;
create policy staff_contracts_director
  on public.staff_contracts for all to authenticated
  using (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = staff_contracts.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = staff_contracts.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists staff_documents_director on public.staff_documents;
create policy staff_documents_director
  on public.staff_documents for all to authenticated
  using (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = staff_documents.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id = staff_documents.staff_member_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists staff_members_scope on public.staff_members;
create policy staff_members_scope
  on public.staff_members for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = staff_members.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = staff_members.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists staff_documents_director_access on storage.objects;
create policy staff_documents_director_access
  on storage.objects for all to authenticated
  using (
    bucket_id = 'staff-documents'
    and exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id::text = (storage.foldername(objects.name))[1]
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'staff-documents'
    and exists (
      select 1
      from public.staff_members sm
      join public.establishments e on e.id = sm.etablissement_id
      where sm.id::text = (storage.foldername(objects.name))[1]
        and e.owner_id = (select auth.uid())
    )
  );

commit;
