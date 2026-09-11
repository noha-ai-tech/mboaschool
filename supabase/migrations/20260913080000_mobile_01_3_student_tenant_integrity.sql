-- ============================================================================
-- 20260913080000_mobile_01_3_student_tenant_integrity.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- MOBILE-01.3 — corrige à la racine un P1 confirmé par le gate de
-- consolidation indépendant de MOBILE-01 (voir le rapport MOBILE-01 FINAL
-- CONSOLIDATION REPORT) : public.students porte à la fois
-- establishment_id ET classe_id, mais AUCUNE contrainte n'imposait avant
-- cette migration que ces deux valeurs se référent au MÊME établissement.
--
-- Exploit confirmé (reproduit à nouveau, fraîchement, avant ce correctif,
-- avec un vrai Postgres) :
--   1. Owner A découvre l'id d'une classe de l'École B via la policy
--      publique "Public can read classes" (classes.id n'a jamais été un
--      secret — voir section "Classes public read" ci-dessous).
--   2. Owner A insère un student avec establishment_id = École A et
--      classe_id = classe de l'École B. students_owner_manage ne
--      vérifiait QUE l'appartenance de establishment_id à l'owner
--      appelant — jamais la cohérence classe_id <-> establishment_id.
--      INSERT accepté.
--   3. Teacher B (assigné à cette classe) lit ce student planté via
--      students_teacher_read_own_classes, qui ne vérifiait QUE
--      l'appartenance de classe_id à l'une de ses classes enseignées —
--      jamais que l'establishment_id du student correspondait bien à
--      celui de l'emploi du temps trouvé.
--   4. Teacher B appelle sync_apply_attendance_mark sur ce student :
--      la fonction vérifiait classe_id = v_edt.classe_id (correct) mais
--      jamais que le student.establishment_id correspondait à
--      l'établissement du cours. result_status = 'applied'.
--
-- Cette migration ferme les QUATRE couches indépendamment (défense en
-- profondeur, mission §3/§5/§6/§7) : aucune ne doit dépendre uniquement
-- d'une autre pour rester sûre.
-- ============================================================================


-- ============================================================================
-- 0. GARDE-FOU — données déjà incohérentes.
-- ============================================================================
-- Les migrations MOBILE ne sont revendiquées appliquées nulle part (voir
-- les fichiers d'origine : "PRÉPARÉE MAIS NON EXÉCUTÉE"). Si un
-- environnement où MOBILE aurait déjà tourné contient malgré tout des
-- students dont classe_id pointe vers un établissement différent de
-- establishment_id, la contrainte composite ci-dessous échouerait de
-- toute façon à l'ALTER TABLE — mais avec un message Postgres générique
-- ("violates foreign key constraint"), pas actionnable. On préfère
-- échouer explicitement, ici, avec le détail des lignes en cause, plutôt
-- que de laisser un message bas niveau. Cette migration ne déplace JAMAIS
-- un élève vers une autre école et ne réécrit JAMAIS un establishment_id
-- pour "faire passer" la contrainte : une incohérence pré-existante est
-- un signal qu'il faut une décision humaine (quelle est la bonne
-- école ?), jamais une correction automatique.
do $$
declare
  v_bad_count integer;
begin
  select count(*) into v_bad_count
  from public.students s
  join public.classes c on c.id = s.classe_id
  where c.establishment_id is distinct from s.establishment_id;

  if v_bad_count > 0 then
    raise exception
      'MOBILE-01.3 abandonnée : % ligne(s) existante(s) dans public.students ont un classe_id dont l''établissement ne correspond pas à establishment_id. Cette migration ne corrige jamais automatiquement ces lignes (cela pourrait déplacer un élève vers la mauvaise école). Résoudre manuellement au cas par cas avant de relancer cette migration : select s.id, s.establishment_id as student_establishment_id, c.establishment_id as class_establishment_id from public.students s join public.classes c on c.id = s.classe_id where c.establishment_id is distinct from s.establishment_id;',
      v_bad_count;
  end if;
end
$$;


-- ============================================================================
-- 1. INVARIANT DB — FK composite (Owner RLS §3 : "option préférée").
-- ============================================================================
-- classes.id est déjà la clé primaire (donc déjà unique à lui seul) ; une
-- contrainte UNIQUE supplémentaire sur (id, establishment_id) est
-- nécessaire uniquement parce que Postgres exige que la cible d'une FK
-- composite soit couverte par une contrainte unique/PK portant EXACTEMENT
-- ces colonnes. N'affecte aucune ligne existante (id est déjà unique,
-- ajouter establishment_id à un ensemble déjà unique ne peut jamais violer
-- la contrainte).
alter table public.classes
  add constraint classes_id_establishment_unique unique (id, establishment_id);

-- Remplace la FK simple students.classe_id -> classes.id (posée par
-- 20260910120000_mobile_01_student_roster_attendance.sql, jamais modifiée
-- rétroactivement ici) par une FK composite qui rend l'incohérence
-- IMPOSSIBLE au niveau base de données, indépendamment de toute policy
-- RLS ou logique applicative. C'est la garantie la plus forte disponible :
-- même un accès direct avec des privilèges élevés qui contournerait RLS
-- resterait bloqué par cette contrainte.
alter table public.students
  drop constraint students_classe_id_fkey;

alter table public.students
  add constraint students_classe_establishment_fkey
  foreign key (classe_id, establishment_id)
  references public.classes (id, establishment_id)
  on delete cascade;
-- Impact ON DELETE : identique à l'ancienne FK pour toute ligne valide —
-- supprimer une classe supprime toujours ses students (la paire
-- (id, establishment_id) de la classe disparaît, donc toute ligne
-- students qui la référence est cascadée). La FK indépendante
-- students.establishment_id -> establishments(id) on delete cascade
-- (non touchée ici) continue par ailleurs de cascader sur suppression
-- d'un établissement entier.


-- ============================================================================
-- 2. RLS OWNER — défense en profondeur (mission §5).
-- ============================================================================
-- Ne dépend plus uniquement de l'invariant DB ci-dessus : re-vérifie
-- explicitement, dans USING et WITH CHECK, que la classe visée appartient
-- bien au même établissement que celui déclaré sur la ligne. Couvre
-- INSERT, UPDATE (nom, classe_id, tentative d'establishment_id),
-- archive/restore (un UPDATE de `status`, donc re-évalué par la même
-- policy) — la policy est unique pour "for all", donc les cinq cas du
-- brief passent tous par cette même vérification.
drop policy if exists "students_owner_manage" on public.students;
create policy "students_owner_manage" on public.students
  for all
  using (
    exists (select 1 from public.establishments e where e.id = students.establishment_id and e.owner_id = auth.uid())
    and exists (select 1 from public.classes c where c.id = students.classe_id and c.establishment_id = students.establishment_id)
  )
  with check (
    exists (select 1 from public.establishments e where e.id = students.establishment_id and e.owner_id = auth.uid())
    and exists (select 1 from public.classes c where c.id = students.classe_id and c.establishment_id = students.establishment_id)
  );


-- ============================================================================
-- 3. RLS TEACHER — défense en profondeur (mission §6).
-- ============================================================================
-- L'ancienne version ne vérifiait que l'appartenance de classe_id à une
-- classe réellement enseignée par l'appelant. Exige maintenant EN PLUS
-- que l'establishment_id du student corresponde à celui de CET emploi du
-- temps précis (edt.etablissement_id) — jamais uniquement classe_id, pour
-- ne pas dépendre exclusivement de l'invariant DB pour cette lecture.
drop policy if exists "students_teacher_read_own_classes" on public.students;
create policy "students_teacher_read_own_classes" on public.students
  for select
  using (
    exists (
      select 1
      from public.emplois_du_temps edt
      join public.enseignants ens on ens.id = edt.enseignant_id
      where ens.user_id = auth.uid()
        and edt.classe_id = students.classe_id
        and edt.etablissement_id = students.establishment_id
    )
  );


-- ============================================================================
-- 4. RPC ATTENDANCE — défense en profondeur (mission §7).
-- ============================================================================
-- CREATE OR REPLACE (jamais un ALTER rétroactif des fichiers d'origine).
-- Reprend sync_apply_attendance_mark telle que redéfinie par
-- 20260911090000_mobile_01_1_student_lifecycle.sql (exclusion des élèves
-- archivés) et ajoute la vérification manquante : le student visé doit
-- appartenir à CET établissement (p_establishment_id), pas seulement à
-- CETTE classe (v_edt.classe_id). Ne compte jamais uniquement sur la FK
-- composite ci-dessus : si une ligne incohérente existait malgré tout
-- (ancienne donnée jamais nettoyée, migration historique, accès
-- administratif direct, bug futur qui contournerait RLS), cette fonction
-- SECURITY DEFINER reste le dernier rempart et refuse explicitement.
-- Idempotence, revalidation acteur/établissement sur les deux chemins de
-- replay (mutation existante ET rattrapage unique_violation), conflit
-- explicite (comparaison last_recorded_by, jamais un simple horodatage),
-- et exclusion des élèves archivés : tous préservés à l'identique.
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

  -- MOBILE-01.3 : le student doit appartenir à la fois à la bonne classe
  -- ET au bon établissement — jamais l'un sans l'autre. C'est la vérité
  -- de dernier ressort de ce RPC, indépendante de l'invariant DB et de
  -- RLS ci-dessus.
  if not exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.classe_id = v_edt.classe_id
      and s.establishment_id = p_establishment_id
      and s.status = 'active'
  ) then
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
-- 5. CLASSES PUBLIC READ — audité, non modifié (mission §8).
-- ============================================================================
-- "Public can read classes" (auth-setup.sql, for select using (true))
-- n'est ni supprimée ni restreinte par cette migration. Elle alimente
-- l'expérience publique/annuaire de l'établissement (fiche école
-- publique) — retirer l'accès public à un id de classe casserait cette
-- fonctionnalité sans supprimer le vrai problème : un identifiant n'est
-- jamais, en soi, une frontière de sécurité. Le P1 ne venait pas du fait
-- que classe_id soit devinable, mais du fait qu'aucune couche (DB, RLS,
-- RPC) ne vérifiait la cohérence classe_id <-> establishment_id une fois
-- cet id obtenu. Les sections 1 à 4 ci-dessus corrigent exactement cela.
-- Elargir ce chantier à une refonte de la visibilité publique des classes
-- serait hors périmètre de MOBILE-01.3 (mission §8 : "ne pas élargir le
-- scope sans preuve") ; documenté ici comme dette distincte si une future
-- mission juge la lecture publique de `classes` elle-même trop large.


-- ============================================================================
-- FIN — aucune donnée supprimée, aucun historique de présence touché,
-- aucune migration antérieure modifiée rétroactivement.
-- ============================================================================
