-- PRO-04 — LOCAL CONSOLIDATION OF DDL ALREADY EXECUTED IN PRODUCTION
-- DO NOT REPLAY ON Ecoles237. Reconcile migration history only after approval.
-- Canonical source: docs/pro/PRO-03_WAVE_C_PROPOSED.sql

-- PRO-03.4 — RETRY EXECUTED IN PRODUCTION ON 2026-08-21
-- Post-check: 11/11 policies validated; hours function recreated without a
-- default, SECURITY INVOKER, authenticated-only; business rows unchanged.
-- Wave C: timetable, attendance, replacements and attendance storage.
-- Application prerequisite: every RPC call passes p_etablissement_id.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy if exists annees_scolaires_scope on public.annees_scolaires;
create policy annees_scolaires_scope
  on public.annees_scolaires for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = annees_scolaires.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = annees_scolaires.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists trimestres_scope on public.trimestres;
create policy trimestres_scope
  on public.trimestres for all to authenticated
  using (
    exists (
      select 1
      from public.annees_scolaires school_year
      join public.establishments e on e.id = school_year.etablissement_id
      where school_year.id = trimestres.annee_scolaire_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.annees_scolaires school_year
      join public.establishments e on e.id = school_year.etablissement_id
      where school_year.id = trimestres.annee_scolaire_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists contraintes_scope on public.contraintes_etablissement;
create policy contraintes_scope
  on public.contraintes_etablissement for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = contraintes_etablissement.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = contraintes_etablissement.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists creneaux_scope on public.creneaux_horaires;
create policy creneaux_scope
  on public.creneaux_horaires for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = creneaux_horaires.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = creneaux_horaires.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists edt_scope on public.emplois_du_temps;
create policy edt_scope
  on public.emplois_du_temps for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = emplois_du_temps.etablissement_id
        and e.owner_id = (select auth.uid())
        and exists (
          select 1 from public.classes classroom
          where classroom.id = emplois_du_temps.classe_id
            and classroom.establishment_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.matieres subject
          where subject.id = emplois_du_temps.matiere_id
            and subject.etablissement_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.enseignants teacher
          where teacher.id = emplois_du_temps.enseignant_id
            and teacher.etablissement_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.creneaux_horaires slot
          where slot.id = emplois_du_temps.creneau_id
            and slot.etablissement_id = emplois_du_temps.etablissement_id
        )
        and (
          emplois_du_temps.annee_scolaire_id is null
          or exists (
            select 1 from public.annees_scolaires school_year
            where school_year.id = emplois_du_temps.annee_scolaire_id
              and school_year.etablissement_id = emplois_du_temps.etablissement_id
          )
        )
        and (
          emplois_du_temps.salle_id is null
          or exists (
            select 1 from public.salles room
            where room.id = emplois_du_temps.salle_id
              and room.etablissement_id = emplois_du_temps.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = emplois_du_temps.etablissement_id
        and e.owner_id = (select auth.uid())
        and exists (
          select 1 from public.classes classroom
          where classroom.id = emplois_du_temps.classe_id
            and classroom.establishment_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.matieres subject
          where subject.id = emplois_du_temps.matiere_id
            and subject.etablissement_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.enseignants teacher
          where teacher.id = emplois_du_temps.enseignant_id
            and teacher.etablissement_id = emplois_du_temps.etablissement_id
        )
        and exists (
          select 1 from public.creneaux_horaires slot
          where slot.id = emplois_du_temps.creneau_id
            and slot.etablissement_id = emplois_du_temps.etablissement_id
        )
        and (
          emplois_du_temps.annee_scolaire_id is null
          or exists (
            select 1 from public.annees_scolaires school_year
            where school_year.id = emplois_du_temps.annee_scolaire_id
              and school_year.etablissement_id = emplois_du_temps.etablissement_id
          )
        )
        and (
          emplois_du_temps.salle_id is null
          or exists (
            select 1 from public.salles room
            where room.id = emplois_du_temps.salle_id
              and room.etablissement_id = emplois_du_temps.etablissement_id
          )
        )
    )
  );

drop policy if exists ens_indispo_directeur on public.enseignant_indisponibilites;
create policy ens_indispo_directeur
  on public.enseignant_indisponibilites for all to authenticated
  using (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_indisponibilites.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = enseignant_indisponibilites.enseignant_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists salles_scope on public.salles;
create policy salles_scope
  on public.salles for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = salles.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = salles.etablissement_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists salle_indispo_scope on public.salle_indisponibilites;
create policy salle_indispo_scope
  on public.salle_indisponibilites for all to authenticated
  using (
    exists (
      select 1
      from public.salles room
      join public.establishments e on e.id = room.etablissement_id
      where room.id = salle_indisponibilites.salle_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.salles room
      join public.establishments e on e.id = room.etablissement_id
      where room.id = salle_indisponibilites.salle_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists pointages_scope on public.pointages;
create policy pointages_scope
  on public.pointages for all to authenticated
  using (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = pointages.enseignant_id
        and teacher.etablissement_id = pointages.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          pointages.creneau_id is null
          or exists (
            select 1 from public.creneaux_horaires slot
            where slot.id = pointages.creneau_id
              and slot.etablissement_id = pointages.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.enseignants teacher
      join public.establishments e on e.id = teacher.etablissement_id
      where teacher.id = pointages.enseignant_id
        and teacher.etablissement_id = pointages.etablissement_id
        and e.owner_id = (select auth.uid())
        and (
          pointages.creneau_id is null
          or exists (
            select 1 from public.creneaux_horaires slot
            where slot.id = pointages.creneau_id
              and slot.etablissement_id = pointages.etablissement_id
          )
        )
    )
  );

drop policy if exists remplacements_directeur on public.remplacements;
create policy remplacements_directeur
  on public.remplacements for all to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = remplacements.etablissement_id
        and e.owner_id = (select auth.uid())
        and exists (
          select 1 from public.emplois_du_temps schedule
          where schedule.id = remplacements.emploi_du_temps_id
            and schedule.etablissement_id = remplacements.etablissement_id
        )
        and exists (
          select 1 from public.enseignants absent_teacher
          where absent_teacher.id = remplacements.enseignant_absent_id
            and absent_teacher.etablissement_id = remplacements.etablissement_id
        )
        and (
          remplacements.enseignant_remplacant_id is null
          or exists (
            select 1 from public.enseignants replacement_teacher
            where replacement_teacher.id = remplacements.enseignant_remplacant_id
              and replacement_teacher.etablissement_id = remplacements.etablissement_id
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = remplacements.etablissement_id
        and e.owner_id = (select auth.uid())
        and exists (
          select 1 from public.emplois_du_temps schedule
          where schedule.id = remplacements.emploi_du_temps_id
            and schedule.etablissement_id = remplacements.etablissement_id
        )
        and exists (
          select 1 from public.enseignants absent_teacher
          where absent_teacher.id = remplacements.enseignant_absent_id
            and absent_teacher.etablissement_id = remplacements.etablissement_id
        )
        and (
          remplacements.enseignant_remplacant_id is null
          or exists (
            select 1 from public.enseignants replacement_teacher
            where replacement_teacher.id = remplacements.enseignant_remplacant_id
              and replacement_teacher.etablissement_id = remplacements.etablissement_id
          )
        )
    )
  );

drop policy if exists pointages_owner_access on storage.objects;
create policy pointages_owner_access
  on storage.objects for all to authenticated
  using (
    bucket_id = 'pointages-photos'
    and exists (
      select 1 from public.establishments e
      where e.id::text = (storage.foldername(objects.name))[1]
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'pointages-photos'
    and exists (
      select 1 from public.establishments e
      where e.id::text = (storage.foldername(objects.name))[1]
        and e.owner_id = (select auth.uid())
    )
  );

-- CREATE OR REPLACE cannot remove the historical DEFAULT NULL. Dropping the
-- exact signature inside this transaction is required to make the school
-- parameter mandatory. RESTRICT is implicit: any unexpected database
-- dependency aborts and rolls back the whole wave.
drop function if exists public.calculer_heures_enseignant(uuid, date, date, uuid);

create or replace function public.calculer_heures_enseignant(
  p_enseignant_id uuid,
  p_date_debut date,
  p_date_fin date,
  p_etablissement_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    sum(extract(epoch from (departure.horodatage - arrival.horodatage)) / 3600.0),
    0
  )
  from public.pointages arrival
  inner join lateral (
    select departure_candidate.horodatage
    from public.pointages departure_candidate
    where departure_candidate.enseignant_id = arrival.enseignant_id
      and departure_candidate.etablissement_id = arrival.etablissement_id
      and departure_candidate.type = 'depart'
      and departure_candidate.horodatage::date = arrival.horodatage::date
      and departure_candidate.horodatage > arrival.horodatage
    order by departure_candidate.horodatage
    limit 1
  ) departure on true
  where arrival.enseignant_id = p_enseignant_id
    and arrival.etablissement_id = p_etablissement_id
    and arrival.type = 'arrivee'
    and arrival.horodatage::date between p_date_debut and p_date_fin;
$function$;

revoke execute on function public.calculer_heures_enseignant(uuid, date, date, uuid)
  from public, anon, service_role;
grant execute on function public.calculer_heures_enseignant(uuid, date, date, uuid)
  to authenticated;

commit;
