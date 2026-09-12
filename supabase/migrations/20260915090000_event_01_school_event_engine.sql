-- ============================================================================
-- 20260915090000_event_01_school_event_engine.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- EVENT-01 — fondation canonique du School Event Engine : une seule table
-- d'événements opérationnels acceptés serveur, remplie exclusivement par
-- les write paths canoniques déjà existants, jamais par un insert client
-- direct. Aucun LLM, aucun résumé, aucun chatbot — moteur entièrement
-- déterministe.
--
-- AUDIT PRÉALABLE (repo complet, voir le rapport EVENT-01 pour le détail) :
--   - Aucune table d'événements générique n'existe. public.admissions_history
--     (0012_admissions_v1.sql) journalise UNIQUEMENT les transitions de
--     admission_status via deux triggers (log_admission_submission,
--     log_admission_status_change) — un précédent réel et directement
--     réutilisable pour le PATTERN (trigger + SECURITY DEFINER), mais
--     lui-même scopé à un seul domaine, sans establishment_id direct, sans
--     taxonomie event_type, sans séparation actor/subject/metadata —
--     jamais un School Event Engine.
--   - public.platform_audit_log (0013_platform_operating_center.sql) est
--     structurellement générique (actor/action/target/metadata) mais
--     RESTREINT EN LECTURE au platform_admin, pour des actions de
--     plateforme — mauvaise frontière de sécurité pour des événements
--     d'établissement. Non réutilisé.
--   - public.sync_mutations (offline_sync_foundation) est le ledger de
--     replay-safety du moteur offline : il enregistre CHAQUE tentative
--     (y compris "rejected"/"conflict"), n'a pas de occurred_at distinct
--     de recorded_at, et n'est pas indexé pour une lecture par type
--     d'événement métier. Un "fait accepté" (Section 4) est un sous-
--     ensemble strict de ses lignes ('applied' uniquement) — jamais
--     l'inverse. Non réutilisé tel quel comme journal d'événements.
--   - lesson_sessions.status ne transite JAMAIS vers 'terminee' nulle part
--     dans le code (grep exhaustif effectué) : class.started/completed/
--     cancelled/uncovered n'ont AUCUN signal canonique aujourd'hui.
--     emplois_du_temps est une configuration récurrente, jamais une
--     occurrence datée — class.scheduled n'a pas non plus de sens en tant
--     qu'événement. DEFERRED (les quatre), documenté au catalogue.
--   - Aucune table incidents n'existe. incident.* DEFERRED (domaine absent).
--   - applications.admission_status transite réellement vers 'accepted'
--     (déjà journalisé par admissions_history) — admission.accepted est
--     donc implémentable avec preuve réelle. Aucune ligne students n'est
--     jamais créée automatiquement depuis une admission acceptée (audité :
--     aucun insert into students depuis le module admissions) —
--     enrollment.confirmed DEFERRED (domaine absent). public.platform_payments
--     est la facturation SaaS de la plateforme elle-même, sans rapport avec
--     un paiement d'inscription élève. public.payments (supabase/schema.sql,
--     application_id + payment_status) existe bien et modélise
--     conceptuellement un paiement d'inscription — mais AUCUN code
--     applicatif ne le lit ni ne l'écrit nulle part dans src/ (grep
--     exhaustif de .from("payments") : zéro résultat). C'est une table
--     morte, sans write path réel — registration_payment.confirmed
--     DEFERRED pour cette raison précise (pas "aucune table n'existe",
--     mais "aucun write path canonique n'existe").
--   - timesheet_approvals.status prévoit 'disputed' dans sa contrainte
--     CHECK, mais AUCUN write path ne le positionne jamais (grep exhaustif
--     du diff TIMESHEET-01 et du code applicatif) — timesheet.disputed
--     DEFERRED. timesheet_corrections n'a pas de notion de "soumission"
--     distincte de la demande de correction elle-même — timesheet.submitted
--     DEFERRED (le modèle actuel est "l'owner approuve directement",
--     jamais "l'enseignant soumet puis attend").
--
-- ENSEMBLE V1 RETENU (8 événements, chacun avec un write path canonique
-- prouvé) : student.present, student.absent, student.late,
-- staff.checked_in, staff.checked_out, timesheet.approved,
-- application.received, admission.accepted. Voir docs/events/event-catalog-v1.md
-- pour le détail complet par type.
-- ============================================================================


-- ============================================================================
-- 1. TABLE CANONIQUE — un seul modèle, jamais un doublon par domaine.
-- ============================================================================
create table public.school_events (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null,
  establishment_id uuid not null references public.establishments(id) on delete cascade,

  -- Moment métier autoritaire du fait (mission §6) — jamais un timestamp
  -- appareil. Pour staff.*, c'est pointages.horodatage (jamais
  -- device_occurred_at). Pour student.*, c'est le moment où le serveur a
  -- accepté ce statut précis (created_at/updated_at de la ligne
  -- student_attendance, capturé dans la même transaction que l'écriture —
  -- cette table ne porte pas de device_occurred_at distinct aujourd'hui).
  occurred_at      timestamptz not null,
  -- Moment où CET événement a été durablement enregistré ici — distinct
  -- de occurred_at par construction (defaut serveur, jamais fourni par
  -- l'appelant).
  recorded_at      timestamptz not null default now(),

  -- Qui a causé/enregistré le fait, jamais confondu avec le sujet
  -- (mission §15). Nullable : une admission publique peut n'avoir aucun
  -- utilisateur authentifié (dossier soumis par un parent anonyme).
  actor_user_id    uuid references auth.users(id) on delete set null,

  -- L'entité métier concernée par le fait.
  subject_type     text not null,
  subject_id       uuid not null,

  -- Traçabilité vers la ligne opérationnelle source exacte (mission §12) —
  -- jamais une copie du contenu, uniquement un pointeur.
  source_type      text not null,
  source_id        uuid not null,

  -- Minimisé par construction (mission §13) : jamais de notes privées, de
  -- corps de message, de contenu de document, de secret, d'URL signée, de
  -- chemin de stockage. Chaque champ ajouté ici doit être justifié dans le
  -- catalogue.
  metadata         jsonb not null default '{}'::jsonb,

  schema_version   integer not null default 1,
  created_at       timestamptz not null default now(),

  -- Idempotence (mission §11) : un même fait source ne produit jamais deux
  -- fois le même type d'événement. Une correction (nouveau event_type pour
  -- la même source_id, ex. student.absent -> student.present) reste
  -- possible ; un replay exact (même source_id, même event_type) est
  -- silencieusement absorbé par emit_school_event ci-dessous.
  constraint school_events_source_type_id_event_type_key unique (source_type, source_id, event_type)
);

create index idx_school_events_establishment_occurred on public.school_events (establishment_id, occurred_at);
create index idx_school_events_type_occurred on public.school_events (event_type, occurred_at);
create index idx_school_events_subject on public.school_events (subject_type, subject_id);

alter table public.school_events enable row level security;

-- Lecture owner-only, établissement par établissement (mission §20/§21) —
-- même frontière d'autorité réelle que tout le reste de /pro/**
-- aujourd'hui (voir l'audit de TIMESHEET-01 sur EstablishmentCapability).
-- Aucune policy teacher (aucun besoin produit actuel identifié — mission
-- §20 : "seulement si un besoin produit actuel le justifie"). Aucune
-- policy anonyme. AUCUNE policy INSERT/UPDATE/DELETE pour un rôle client
-- quelconque : la table n'est écrite que par emit_school_event() et les
-- triggers ci-dessous, tous SECURITY DEFINER — un accès direct
-- authenticated/anon est structurellement impossible, pas seulement
-- interdit par convention.
create policy "school_events_owner_read" on public.school_events
  for select
  using (exists (select 1 from public.establishments e where e.id = school_events.establishment_id and e.owner_id = auth.uid()));


-- ============================================================================
-- 2. EMISSION CENTRALISÉE — jamais exposée au navigateur (mission §18/§19).
-- ============================================================================
-- Valide le event_type contre une liste fermée (jamais un type arbitraire
-- fourni par un appelant), exige establishment_id, et absorbe
-- silencieusement un replay exact (même source, même type) plutôt que de
-- lever une exception qui ferait échouer la transaction appelante — un
-- appel dupliqué ne doit jamais faire échouer l'écriture opérationnelle
-- qui l'accompagne.
create or replace function public.emit_school_event(
  p_event_type text,
  p_establishment_id uuid,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not in (
    'student.present', 'student.absent', 'student.late',
    'staff.checked_in', 'staff.checked_out',
    'timesheet.approved',
    'application.received', 'admission.accepted'
  ) then
    raise exception 'Type d''événement inconnu : %', p_event_type;
  end if;

  if p_establishment_id is null or p_occurred_at is null or p_subject_type is null or p_subject_id is null or p_source_type is null or p_source_id is null then
    raise exception 'Champs requis manquants pour emit_school_event';
  end if;

  insert into public.school_events (
    event_type, establishment_id, occurred_at, actor_user_id,
    subject_type, subject_id, source_type, source_id, metadata
  )
  values (
    p_event_type, p_establishment_id, p_occurred_at, p_actor_user_id,
    p_subject_type, p_subject_id, p_source_type, p_source_id, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_type, source_id, event_type) do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- Jamais accessible depuis le navigateur — ni PUBLIC, ni anon, ni
-- authenticated, ni service_role. Seuls des appelants SECURITY DEFINER
-- (les RPC/triggers ci-dessous, exécutés avec les privilèges du
-- propriétaire de la fonction) peuvent l'invoquer.
revoke all on function public.emit_school_event(text, uuid, timestamptz, uuid, text, uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;


-- ============================================================================
-- 3. ATTENDANCE — student.present / student.absent / student.late.
-- ============================================================================
-- CREATE OR REPLACE de sync_apply_attendance_mark (fichier d'origine
-- 20260910120000, jamais modifié rétroactivement) : ajoute uniquement
-- l'appel emit_school_event, dans la MÊME transaction que l'upsert
-- student_attendance — atomique par construction (mission §17), aucune
-- autre logique touchée. v_now capture le moment exact utilisé pour
-- updated_at, garantissant occurred_at = la vérité stockée en base, pas
-- un second appel à now() qui pourrait diverger de quelques microsecondes.
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
  v_now timestamptz := now();
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

    insert into public.student_attendance (session_id, student_id, status, last_recorded_by, updated_at)
    values (v_session_id, p_student_id, p_status, v_caller, v_now)
    on conflict (session_id, student_id) do update
      set status = excluded.status, last_recorded_by = excluded.last_recorded_by, updated_at = v_now
    returning id into v_existing_attendance.id;

    -- EVENT-01 : émis uniquement après acceptation serveur réelle de ce
    -- statut précis, jamais avant. Un replay exact (même ligne, même
    -- statut) est absorbé sans erreur par emit_school_event ; une
    -- correction (statut différent) produit un nouvel événement distinct,
    -- jamais une réécriture du précédent (mission §25 : le reducer de
    -- lecture, pas l'écriture, décide de l'état final).
    perform public.emit_school_event(
      'student.' || p_status,
      p_establishment_id,
      v_now,
      v_caller,
      'student',
      p_student_id,
      'student_attendance',
      v_existing_attendance.id
    );

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
-- 4. STAFF PUNCH — staff.checked_in / staff.checked_out.
-- ============================================================================
-- CREATE OR REPLACE de sync_apply_staff_punch (fichier d'origine
-- 20260914090000, jamais modifié rétroactivement) : ajoute uniquement
-- l'émission, après l'insert réussi, dans la même transaction. v_now est
-- déjà la variable utilisée pour horodatage — réutilisée telle quelle,
-- jamais device_occurred_at (mission §26).
create or replace function public.sync_apply_staff_punch(
  p_mutation_id uuid,
  p_establishment_id uuid,
  p_type text,
  p_device_occurred_at timestamptz default null
)
returns table (result_status text, result_entity_id uuid, result_error text, result_anomaly text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.sync_mutations;
  v_caller uuid := auth.uid();
  v_teacher_id uuid;
  v_now timestamptz := now();
  v_last_open public.pointages;
  v_new_id uuid;
  v_anomaly text := null;
  v_event_type text;
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_caller is null then
    raise exception 'Non authentifié';
  end if;

  if p_type not in ('arrivee', 'depart') then
    return query select 'rejected'::text, null::uuid, 'Type de pointage invalide'::text, null::text;
    return;
  end if;

  select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id for update;
  if v_existing.mutation_id is not null then
    if v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
      return query select 'rejected'::text, null::uuid, 'Accès refusé'::text, null::text;
      return;
    end if;
    return query select v_existing.status, v_existing.entity_id, v_existing.error, null::text;
    return;
  end if;

  select id into v_teacher_id from public.enseignants
    where user_id = v_caller and etablissement_id = p_establishment_id
    limit 1;

  if v_teacher_id is null then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Accès refusé pour cet établissement');
    return query select 'rejected'::text, null::uuid, 'Accès refusé pour cet établissement'::text, null::text;
    return;
  end if;

  select * into v_last_open from public.pointages
    where enseignant_id = v_teacher_id
      and etablissement_id = p_establishment_id
      and source = 'mobile_self_service'
      and horodatage::date = v_now::date
    order by horodatage desc
    limit 1;

  if p_type = 'arrivee' and v_last_open.id is not null and v_last_open.type = 'arrivee' then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Une journée est déjà en cours — terminez-la avant d''en commencer une nouvelle');
    return query select 'rejected'::text, null::uuid, 'Une journée est déjà en cours — terminez-la avant d''en commencer une nouvelle'::text, null::text;
    return;
  end if;

  if p_type = 'depart' and (v_last_open.id is null or v_last_open.type != 'arrivee') then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Aucune journée en cours à terminer');
    return query select 'rejected'::text, null::uuid, 'Aucune journée en cours à terminer'::text, null::text;
    return;
  end if;

  if p_type = 'depart' and v_now < v_last_open.horodatage then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Horodatage incohérent');
    return query select 'rejected'::text, null::uuid, 'Horodatage incohérent'::text, null::text;
    return;
  end if;

  if p_device_occurred_at is not null and p_device_occurred_at > v_now + interval '10 minutes' then
    v_anomaly := 'offline_timestamp_review';
  elsif p_type = 'depart' and v_now - v_last_open.horodatage > interval '12 hours' then
    v_anomaly := 'schedule_variance';
  end if;

  begin
    insert into public.pointages (etablissement_id, enseignant_id, type, source, horodatage, device_occurred_at, photo_path)
    values (p_establishment_id, v_teacher_id, p_type, 'mobile_self_service', v_now, p_device_occurred_at, null)
    returning id into v_new_id;

    -- EVENT-01 : occurred_at = v_now = pointages.horodatage, exactement
    -- comme la ligne stockée. device_occurred_at n'apparaît qu'en
    -- metadata, jamais comme autorité (mission §6/§10).
    v_event_type := case when p_type = 'arrivee' then 'staff.checked_in' else 'staff.checked_out' end;
    if v_anomaly is not null then
      v_metadata := jsonb_build_object('anomaly', v_anomaly);
    end if;
    perform public.emit_school_event(
      v_event_type,
      p_establishment_id,
      v_now,
      v_caller,
      'enseignant',
      v_teacher_id,
      'pointages',
      v_new_id,
      v_metadata
    );

    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, v_new_id, 'applied', null);
  exception
    when unique_violation then
      select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id;
      if v_existing.mutation_id is null or v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
        return query select 'rejected'::text, null::uuid, 'Accès refusé'::text, null::text;
        return;
      end if;
      return query select v_existing.status, v_existing.entity_id, v_existing.error, null::text;
      return;
  end;

  return query select 'applied'::text, v_new_id, null::text, v_anomaly;
end;
$$;


-- ============================================================================
-- 5. TIMESHEET APPROVAL — timesheet.approved, via trigger (pas de RPC
--    centrale existante pour cette écriture — timesheet_approvals est
--    inséré directement par le propriétaire, RLS-scoped, comme audité
--    dans TIMESHEET-01). Même pattern que admissions_history
--    (AFTER INSERT, SECURITY DEFINER) : précédent déjà réel dans ce repo.
-- ============================================================================
create or replace function public.emit_timesheet_approved_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.emit_school_event(
    'timesheet.approved',
    new.establishment_id,
    new.approved_at,
    new.approved_by,
    'enseignant',
    new.enseignant_id,
    'timesheet_approvals',
    new.id,
    jsonb_build_object(
      'approved_minutes', new.approved_minutes,
      'period_start', new.period_start,
      'period_end', new.period_end
    )
  );
  return new;
end;
$$;

drop trigger if exists timesheet_approvals_emit_event on public.timesheet_approvals;
create trigger timesheet_approvals_emit_event
  after insert on public.timesheet_approvals
  for each row execute procedure public.emit_timesheet_approved_event();


-- ============================================================================
-- 6. APPLICATIONS — application.received / admission.accepted, via
--    triggers additionnels sur applications, à côté (jamais à la place)
--    des triggers admissions_history existants (0012_admissions_v1.sql,
--    jamais modifiés rétroactivement).
-- ============================================================================
create or replace function public.emit_application_received_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- applications.establishment_id est nullable au niveau schéma
  -- (supabase/schema.sql) même si le seul vrai write path aujourd'hui
  -- (src/app/preinscription/page.tsx) l'exige côté formulaire avant
  -- soumission. Défense en profondeur : ne JAMAIS laisser ce trigger, ou
  -- le raise strict d'emit_school_event sur establishment_id manquant,
  -- faire échouer l'insertion réelle de la candidature elle-même — un
  -- événement manqué est acceptable, une admission perdue ne l'est pas
  -- (mission §42 : l'émission ne doit jamais casser l'écriture
  -- opérationnelle qu'elle accompagne).
  if new.establishment_id is not null then
    perform public.emit_school_event(
      'application.received',
      new.establishment_id,
      new.created_at,
      null, -- une admission publique peut n'avoir aucun utilisateur authentifié
      'application',
      new.id,
      'applications',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists applications_emit_received_event on public.applications;
create trigger applications_emit_received_event
  after insert on public.applications
  for each row execute procedure public.emit_application_received_event();

create or replace function public.emit_admission_accepted_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Même garde que emit_application_received_event : ne jamais faire
  -- échouer la mise à jour de statut elle-même si establishment_id est
  -- absent sur cette ligne.
  if new.admission_status = 'accepted' and (old.admission_status is distinct from new.admission_status) and new.establishment_id is not null then
    perform public.emit_school_event(
      'admission.accepted',
      new.establishment_id,
      now(),
      auth.uid(),
      'application',
      new.id,
      'applications',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists applications_emit_accepted_event on public.applications;
create trigger applications_emit_accepted_event
  after update of admission_status on public.applications
  for each row execute procedure public.emit_admission_accepted_event();


-- ============================================================================
-- 7. DAILY DETERMINISTIC PROOF — agrégation correction-aware, sans IA
--    (mission §37/§39). Pour l'attendance, ne compte jamais naïvement tous
--    les événements : ne retient que le DERNIER événement student.* par
--    (subject_id) parmi ceux dont la source (student_attendance.session_id)
--    correspond à une séance du jour demandé, puis compte par type final.
-- ============================================================================
create or replace function public.get_daily_school_proof(p_establishment_id uuid, p_day date)
returns table (
  metric text,
  count_value bigint,
  event_ids uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with attendance_events as (
    -- Un seul événement retenu par élève : le plus récent parmi ceux
    -- rattachés à une séance du jour demandé (correction-aware, mission §39).
    select distinct on (se.subject_id)
      se.id, se.event_type, se.subject_id, se.occurred_at
    from public.school_events se
    join public.student_attendance sa on sa.id = se.source_id and se.source_type = 'student_attendance'
    join public.lesson_sessions ls on ls.id = sa.session_id
    where se.establishment_id = p_establishment_id
      and se.event_type in ('student.present', 'student.absent', 'student.late')
      and ls.session_date = p_day
    order by se.subject_id, se.occurred_at desc
  ),
  staff_in as (
    select id from public.school_events
    where establishment_id = p_establishment_id and event_type = 'staff.checked_in' and occurred_at::date = p_day
  ),
  staff_out as (
    select id from public.school_events
    where establishment_id = p_establishment_id and event_type = 'staff.checked_out' and occurred_at::date = p_day
  ),
  apps_received as (
    select id from public.school_events
    where establishment_id = p_establishment_id and event_type = 'application.received' and occurred_at::date = p_day
  ),
  timesheets_approved as (
    select id from public.school_events
    where establishment_id = p_establishment_id and event_type = 'timesheet.approved' and occurred_at::date = p_day
  )
  select 'students_present'::text, count(*) filter (where event_type = 'student.present')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.present'), array[]::uuid[]) from attendance_events
  union all
  select 'students_absent'::text, count(*) filter (where event_type = 'student.absent')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.absent'), array[]::uuid[]) from attendance_events
  union all
  select 'students_late'::text, count(*) filter (where event_type = 'student.late')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.late'), array[]::uuid[]) from attendance_events
  union all
  select 'staff_checked_in'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from staff_in
  union all
  select 'staff_checked_out'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from staff_out
  union all
  select 'applications_received'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from apps_received
  union all
  select 'timesheets_approved'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from timesheets_approved;
$$;

-- security invoker (pas definer) : cette fonction ne fait que lire
-- school_events via le rôle appelant — RLS (school_events_owner_read)
-- s'applique donc normalement, jamais contournée. Un owner ne peut
-- obtenir le proof que de ses propres établissements.
revoke all on function public.get_daily_school_proof(uuid, date) from public, anon, service_role;
grant execute on function public.get_daily_school_proof(uuid, date) to authenticated;


-- ============================================================================
-- FIN — aucune donnée existante supprimée ou modifiée, aucune migration
-- antérieure altérée rétroactivement, aucun second modèle Teacher/Student
-- créé, aucun accès direct navigateur à l'écriture d'événements, moteur
-- offline (syncEngine/syncIdentity/outbox) jamais touché, aucun LLM/IA.
-- ============================================================================
