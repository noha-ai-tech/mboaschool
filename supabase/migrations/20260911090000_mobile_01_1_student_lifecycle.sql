-- ============================================================================
-- 20260911090000_mobile_01_1_student_lifecycle.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- MOBILE-01.1 — évolution additive de public.students (créée par
-- 20260910120000_mobile_01_student_roster_attendance.sql, non modifiée
-- rétroactivement ici, conformément à la consigne). Audit préalable :
-- public.student_attendance référence students.id en `on delete cascade`
-- — un retrait brutal (DELETE) d'un élève ayant déjà un historique de
-- présence supprimerait cet historique silencieusement. Un statut
-- actif/archivé est donc la stratégie retenue plutôt qu'une suppression
-- physique, avec restauration possible et aucune perte d'historique.
--
-- Ne modifie AUCUNE donnée existante (colonne ajoutée avec une valeur par
-- défaut, aucune ligne actuelle affectée). Ne touche aucune autre table.
-- ============================================================================


alter table public.students
  add column if not exists status text not null default 'active' check (status in ('active', 'archived'));

create index if not exists idx_students_status on public.students(status);


-- ============================================================================
-- sync_apply_attendance_mark — redéfinie (CREATE OR REPLACE, jamais un ALTER
-- rétroactif du fichier d'origine) pour exclure les élèves archivés du
-- périmètre autorisé : un élève archivé ne doit plus pouvoir être marqué
-- présent/absent/en retard, mais son historique de présence déjà existant
-- reste intact et lisible (aucune ligne student_attendance n'est touchée
-- par cette migration).
-- ============================================================================
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

  select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id for update;
  if v_existing.mutation_id is not null then
    if v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
      return query select 'rejected'::text, null::uuid, v_generic_denial;
      return;
    end if;
    return query select v_existing.status, v_existing.entity_id, v_existing.error;
    return;
  end if;

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

  -- MOBILE-01.1 : un élève archivé n'appartient plus au périmètre
  -- marquable, même s'il appartenait bien à cette classe.
  if not exists (select 1 from public.students s where s.id = p_student_id and s.classe_id = v_edt.classe_id and s.status = 'active') then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'attendance', 'create', p_establishment_id, v_caller, null, 'rejected', v_generic_denial);
    return query select 'rejected'::text, null::uuid, v_generic_denial;
    return;
  end if;

  begin
    insert into public.lesson_sessions (establishment_id, emploi_du_temps_id, classe_id, matiere_id, enseignant_id, session_date, opened_by)
    values (p_establishment_id, v_edt.id, v_edt.classe_id, v_edt.matiere_id, v_teacher_id, p_session_date, v_caller)
    on conflict (emploi_du_temps_id, session_date) do update set session_date = excluded.session_date
    returning id into v_session_id;

    select * into v_existing_attendance from public.student_attendance
    where session_id = v_session_id and student_id = p_student_id
    for update;

    if v_existing_attendance.id is not null and v_existing_attendance.last_recorded_by != v_caller then
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
-- FIN — évolution additive uniquement : colonne ajoutée avec valeur par
-- défaut (aucune ligne existante affectée), fonction redéfinie mais jamais
-- le fichier de migration d'origine. Aucune donnée d'historique de
-- présence supprimée ou modifiée.
-- ============================================================================
