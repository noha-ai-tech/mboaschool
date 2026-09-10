-- ============================================================================
-- 20260910120000_mobile_01_student_roster_attendance.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- MOBILE-01 — première brique d'un modèle d'élèves réel : `public.students`
-- (aucune table élève n'existait avant cette migration — confirmé par audit
-- exhaustif, voir le rapport MOBILE-01), une notion d'occurrence datée d'un
-- cours (`public.lesson_sessions`, dérivée d'une ligne `emplois_du_temps`
-- récurrente + une date réelle, puisque `emplois_du_temps` ne modélise
-- qu'un gabarit hebdomadaire sans instance datée), et l'appel élève
-- lui-même (`public.student_attendance`).
--
-- Ne modifie AUCUNE table existante (classes, emplois_du_temps, enseignants,
-- establishments). Réutilise le moteur offline OFFLINE-01/01.1/01.2/01.3 :
-- l'écriture de présence passe exclusivement par une fonction SECURITY
-- DEFINER (sync_apply_attendance_mark) appelée depuis /api/sync/push,
-- jamais par un insert direct RLS-permis — même philosophie que
-- sync_apply_absence_create, avec le correctif P1 (scoping acteur +
-- établissement sur TOUS les chemins de replay) intégré dès la première
-- version plutôt que découvert après coup.
-- ============================================================================


-- ============================================================================
-- 1. ÉLÈVES — n'existait nulle part dans le schéma avant cette migration.
-- ============================================================================
-- Volontairement minimal (Phase 5 du brief OFFLINE-01 : ne pas forcer des
-- informations pour lesquelles le schéma ne dispose pas encore d'un modèle
-- fiable). Pas de données personnelles sensibles au-delà du nom — aucune
-- date de naissance, aucun contact, aucune photo : ce n'est pas l'objet de
-- MOBILE-01 (gestion complète des dossiers élèves) et minimise la surface
-- de données à protéger.
create table if not exists public.students (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  classe_id         uuid not null references public.classes(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_students_establishment on public.students(establishment_id);
create index if not exists idx_students_classe on public.students(classe_id);

alter table public.students enable row level security;

-- Le propriétaire de l'établissement gère librement sa liste d'élèves
-- (même modèle que "Owners can manage classes", auth-setup.sql).
drop policy if exists "students_owner_manage" on public.students;
create policy "students_owner_manage" on public.students
  for all
  using (
    exists (select 1 from public.establishments e where e.id = students.establishment_id and e.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.establishments e where e.id = students.establishment_id and e.owner_id = auth.uid())
  );

-- Un enseignant lit UNIQUEMENT les élèves des classes où il enseigne
-- réellement (dérivé de emplois_du_temps, comme "mes classes" dans
-- /enseignant/mon-espace) — jamais public, contrairement à `classes`
-- elle-même : un roster nominatif d'élèves est une donnée personnelle,
-- pas une fiche publique d'établissement.
drop policy if exists "students_teacher_read_own_classes" on public.students;
create policy "students_teacher_read_own_classes" on public.students
  for select
  using (
    classe_id in (
      select edt.classe_id
      from public.emplois_du_temps edt
      join public.enseignants ens on ens.id = edt.enseignant_id
      where ens.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 2. SÉANCES — occurrence DATÉE d'une ligne emplois_du_temps récurrente.
-- ============================================================================
-- emplois_du_temps ne porte aucune date (gabarit hebdomadaire via
-- creneaux_horaires.jour_semaine) : il n'existe nulle part dans le schéma
-- de ligne représentant "ce cours précis, tel jour". Clé naturelle
-- (emploi_du_temps_id, session_date) : le client n'a jamais besoin de
-- connaître un id de séance généré côté serveur pour agir — il connaît
-- déjà emploi_du_temps_id (depuis son emploi du temps) et la date du jour,
-- ce qui rend la synchronisation offline de l'appel indépendante de tout
-- ordre d'opérations ("ouvrir le cours" avant "faire l'appel").
create table if not exists public.lesson_sessions (
  id                  uuid primary key default gen_random_uuid(),
  establishment_id    uuid not null references public.establishments(id) on delete cascade,
  emploi_du_temps_id  uuid not null references public.emplois_du_temps(id) on delete cascade,
  classe_id           uuid not null references public.classes(id) on delete cascade,
  matiere_id          uuid not null references public.matieres(id) on delete cascade,
  enseignant_id       uuid not null references public.enseignants(id) on delete cascade,
  session_date        date not null,
  status              text not null default 'ouverte' check (status in ('ouverte', 'terminee')),
  opened_by           uuid references auth.users(id),
  opened_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (emploi_du_temps_id, session_date)
);
create index if not exists idx_lesson_sessions_establishment on public.lesson_sessions(establishment_id);
create index if not exists idx_lesson_sessions_enseignant_date on public.lesson_sessions(enseignant_id, session_date);

alter table public.lesson_sessions enable row level security;

drop policy if exists "lesson_sessions_owner_read" on public.lesson_sessions;
create policy "lesson_sessions_owner_read" on public.lesson_sessions
  for select
  using (
    exists (select 1 from public.establishments e where e.id = lesson_sessions.establishment_id and e.owner_id = auth.uid())
  );

-- Lecture seule pour l'enseignant assigné — jamais un insert/update RLS
-- direct : la création/ouverture d'une séance passe par
-- sync_apply_attendance_mark (section 4), qui la crée (upsert) de façon
-- atomique avec la première marque de présence, jamais par un chemin
-- séparé qui pourrait diverger.
drop policy if exists "lesson_sessions_teacher_read_own" on public.lesson_sessions;
create policy "lesson_sessions_teacher_read_own" on public.lesson_sessions
  for select
  using (
    enseignant_id in (select id from public.enseignants where user_id = auth.uid())
  );


-- ============================================================================
-- 3. APPEL ÉLÈVE — statuts minimum du brief : present | absent | late.
-- ============================================================================
-- Aucune policy insert/update pour authenticated : toute écriture passe
-- exclusivement par sync_apply_attendance_mark (SECURITY DEFINER), jamais
-- par un insert RLS-permis direct — plus strict que le modèle absences
-- existant (qui autorisait un insert direct avant OFFLINE-01), par
-- conception dès le départ ici puisqu'aucun chemin non-offline n'existe
-- pour cette nouvelle fonctionnalité.
create table if not exists public.student_attendance (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.lesson_sessions(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  status            text not null check (status in ('present', 'absent', 'late')),
  last_recorded_by  uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists idx_student_attendance_session on public.student_attendance(session_id);
create index if not exists idx_student_attendance_student on public.student_attendance(student_id);

alter table public.student_attendance enable row level security;

drop policy if exists "student_attendance_owner_read" on public.student_attendance;
create policy "student_attendance_owner_read" on public.student_attendance
  for select
  using (
    exists (
      select 1 from public.lesson_sessions ls
      join public.establishments e on e.id = ls.establishment_id
      where ls.id = student_attendance.session_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists "student_attendance_teacher_read_own_sessions" on public.student_attendance;
create policy "student_attendance_teacher_read_own_sessions" on public.student_attendance
  for select
  using (
    session_id in (
      select ls.id from public.lesson_sessions ls
      join public.enseignants ens on ens.id = ls.enseignant_id
      where ens.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 4. MARQUE DE PRÉSENCE ATOMIQUE — fonction SECURITY DEFINER
-- ============================================================================
-- Modélisation OFFLINE-01 (Phase 10) : chaque tap enseignant est une
-- mutation "create" au sens du moteur offline (un événement de marquage),
-- jamais un "update" — la fonction upsert sur (session_id, student_id) ;
-- le dernier événement appliqué gagne pour CE MÊME acteur (corrections
-- successives du même enseignant, y compris plusieurs taps mis en file
-- hors-ligne puis synchronisés dans l'ordre), mais un événement provenant
-- d'un AUTRE acteur alors que la ligne a déjà une valeur d'un tiers
-- déclenche un conflit explicite (jamais un écrasement silencieux,
-- Phase 11 du brief) : on compare `last_recorded_by`, pas un simple
-- horodatage — comparer uniquement `updated_at` aurait produit un faux
-- conflit dès la 2e correction du MÊME enseignant appliquée dans le même
-- lot de synchronisation (son propre événement précédent, déjà committé,
-- aurait changé `updated_at` entre-temps).
--
-- Idempotence et autorisation : même schéma que sync_apply_absence_create
-- (20260907230000_offline_sync_foundation.sql), correctif P1 inclus dès
-- cette première version — les DEUX chemins de replay (ligne déjà
-- existante ET rattrapage unique_violation) revalident acteur +
-- établissement avant de renvoyer quoi que ce soit.
create or replace function public.sync_apply_attendance_mark(
  p_mutation_id uuid,
  p_establishment_id uuid,
  p_emploi_du_temps_id uuid,
  p_student_id uuid,
  p_session_date date,
  p_status text
)
returns table (result_status text, result_entity_id uuid, result_error text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.sync_mutations;
  v_caller uuid := auth.uid();
  v_generic_denial text := 'Accès refusé pour ce cours ou cet élève';
  v_teacher_id uuid;
  v_edt public.emplois_du_temps;
  v_session_id uuid;
  v_existing_attendance public.student_attendance;
begin
  if v_caller is null then
    raise exception 'Non authentifié';
  end if;

  -- Idempotence / replay — voir le raisonnement complet dans
  -- 20260907230000_offline_sync_foundation.sql section 5 (correctif P1).
  select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id for update;
  if v_existing.mutation_id is not null then
    if v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
      return query select 'rejected'::text, null::uuid, v_generic_denial;
      return;
    end if;
    return query select v_existing.status, v_existing.entity_id, v_existing.error;
    return;
  end if;

  -- Autorisation : l'appelant doit être l'enseignant réellement assigné à
  -- CE créneau d'emploi du temps, dans CET établissement ; l'élève visé
  -- doit réellement appartenir à la classe de ce créneau. Défense en
  -- profondeur au-delà de RLS (cette fonction SECURITY DEFINER contourne
  -- RLS par nature).
  select id into v_teacher_id from public.enseignants where user_id = v_caller and etablissement_id = p_establishment_id limit 1;

  select * into v_edt from public.emplois_du_temps
  where id = p_emploi_du_temps_id
    and etablissement_id = p_establishment_id
    and enseignant_id = v_teacher_id;

  if v_teacher_id is null or v_edt.id is null then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'attendance', 'create', p_establishment_id, v_caller, null, 'rejected', v_generic_denial);
    return query select 'rejected'::text, null::uuid, v_generic_denial;
    return;
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.classe_id = v_edt.classe_id) then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'attendance', 'create', p_establishment_id, v_caller, null, 'rejected', v_generic_denial);
    return query select 'rejected'::text, null::uuid, v_generic_denial;
    return;
  end if;

  begin
    -- Séance : upsert idempotent sur (emploi_du_temps_id, session_date) —
    -- ne nécessite aucune ouverture préalable côté client.
    insert into public.lesson_sessions (establishment_id, emploi_du_temps_id, classe_id, matiere_id, enseignant_id, session_date, opened_by)
    values (p_establishment_id, v_edt.id, v_edt.classe_id, v_edt.matiere_id, v_teacher_id, p_session_date, v_caller)
    on conflict (emploi_du_temps_id, session_date) do update set session_date = excluded.session_date
    returning id into v_session_id;

    select * into v_existing_attendance from public.student_attendance
    where session_id = v_session_id and student_id = p_student_id
    for update;

    if v_existing_attendance.id is not null and v_existing_attendance.last_recorded_by != v_caller then
      -- Un autre acteur a modifié cette présence depuis — conflit
      -- explicite, jamais un écrasement silencieux (Phase 11).
      insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
      values (p_mutation_id, 'attendance', 'create', p_establishment_id, v_caller, v_existing_attendance.id, 'conflict', 'Présence déjà modifiée par un autre utilisateur depuis votre dernière synchronisation');
      return query select 'conflict'::text, v_existing_attendance.id, 'Présence déjà modifiée par un autre utilisateur depuis votre dernière synchronisation'::text;
      return;
    end if;

    insert into public.student_attendance (session_id, student_id, status, last_recorded_by)
    values (v_session_id, p_student_id, p_status, v_caller)
    on conflict (session_id, student_id) do update
      set status = excluded.status, last_recorded_by = excluded.last_recorded_by, updated_at = now()
    returning id into v_existing_attendance.id;

    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'attendance', 'create', p_establishment_id, v_caller, v_existing_attendance.id, 'applied', null);
  exception
    when unique_violation then
      -- Vraie course concurrente sur ce mutation_id (double-clic, retry
      -- réseau qui recroise la tentative encore en vol) — même
      -- raisonnement que sync_apply_absence_create : notre insert dans
      -- sync_mutations ci-dessus vient d'échouer sur la contrainte
      -- d'unicité, toute cette transaction (y compris l'upsert de
      -- présence ci-dessus) est annulée automatiquement.
      select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id;
      if v_existing.mutation_id is null or v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
        return query select 'rejected'::text, null::uuid, v_generic_denial;
        return;
      end if;
      return query select v_existing.status, v_existing.entity_id, v_existing.error;
      return;
  end;

  return query select 'applied'::text, v_existing_attendance.id, null::text;
end;
$$;


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée, aucune
-- opération destructive. N'affecte aucune règle RLS/table préexistante.
-- ============================================================================
