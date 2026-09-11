-- ============================================================================
-- 20260914090000_timesheet_01_foundation.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- TIMESHEET-01 — fondation du suivi du temps enseignant : distingue heures
-- prévues (emplois_du_temps), pointages réels (arrivée/départ), heures
-- calculées, corrections et heures validées, sans encore construire le
-- moteur de paie complet.
--
-- AUDIT PRÉALABLE (voir le rapport TIMESHEET-01, section ARCHITECTURE
-- AUDIT, pour le détail complet) :
--   - public.pointages (0002_presence.sql) modélise déjà arrivée/départ,
--     mais en mode KIOSQUE UNIQUEMENT : photo_path est NOT NULL (la photo
--     EST le mécanisme anti-fraude de ce flux), l'acteur authentifié est
--     le propriétaire/le kiosque (capability attendance:manage), jamais
--     l'enseignant lui-même, et enseignant_id est résolu via un
--     code_pointage partagé, jamais via auth.uid(). C'est un modèle de
--     confiance fondamentalement différent d'un pointage mobile
--     auto-déclaré. Décision : ÉTENDRE pointages (jamais une table
--     parallèle) — même table, même clé enseignant_id, mais une colonne
--     `source` distingue explicitement les deux provenances, et
--     photo_path devient nullable (rétrocompatible : aucune ligne
--     existante n'est affectée, le flux kiosque continue de fournir une
--     photo comme avant, simplement plus jamais imposé au niveau colonne
--     pour les nouvelles lignes mobile_self_service).
--   - public.staff_members.enseignant_id est un lien OPTIONNEL vers
--     enseignants pour la couche RH générale ; enseignants reste, selon
--     le commentaire de 0009_pro_hr_foundation.sql lui-même, la source de
--     vérité pour matières/emplois du temps/POINTAGE. TIMESHEET-01 ne
--     crée donc aucune relation vers staff_members.
--   - public.absences (0011_payroll_engine.sql) est keyée sur
--     staff_member_id, pas enseignant_id — c'est le modèle d'absence RH
--     (congé/mission), distinct de l'absence élève (student_attendance).
--     Vu la couverture non garantie enseignants -> staff_members,
--     TIMESHEET-01 ne construit PAS de jointure vers cette table pour ce
--     sprint : une journée "prévue mais sans aucun pointage" est déjà
--     observable directement depuis emplois_du_temps + pointages, ce qui
--     suffit à "reconnaître" l'absence au sens de la mission (section 24)
--     sans décider d'une politique de paie ni inventer une relation.
--   - public.bulletins_paie recalcule heures_effectuees à la volée depuis
--     vue_heures_realisees à chaque génération de bulletin — il n'existe
--     aucune notion d'heures VALIDÉES stables aujourd'hui. C'est
--     exactement le vide que TIMESHEET-01 comble via
--     timesheet_approvals.approved_minutes, sans toucher bulletins_paie
--     ni vue_heures_realisees dans ce sprint (frontière paie, section 23).
--   - src/lib/school/establishmentAccess.ts définit un type
--     EstablishmentCapability (attendance:manage, payroll:manage, ...)
--     mais requireEstablishmentAccess() collabore STRICTEMENT sur
--     owner_id aujourd'hui ("PRO-03.1 conserve strictement la frontière
--     owner actuelle... tant que la matrice d'autorisation n'est pas
--     validée"). Il n'existe donc PAS encore de rôle directeur/censeur/RH
--     réellement différencié : gater l'approbation sur le propriétaire
--     n'est pas un raccourci arbitraire, c'est la frontière d'autorité
--     réelle et déjà validée de l'application entière aujourd'hui. Les
--     policies ci-dessous nomment explicitement "owner" pour rester
--     honnêtes sur ce point, et passent par la même capability
--     attendance:manage côté application pour hériter automatiquement
--     d'une matrice de rôles élargie le jour où elle sera validée.
-- ============================================================================


-- ============================================================================
-- 1. INVARIANT DB — enseignants devient une cible de FK composite.
-- ============================================================================
-- Nécessaire pour que chaque nouvelle table portant à la fois
-- enseignant_id et establishment_id puisse garantir, au niveau base de
-- données (leçon MOBILE-01.3, jamais uniquement RLS/API), que ces deux
-- valeurs se réfèrent bien au même établissement. enseignants.id est déjà
-- unique (PK) ; cette contrainte composite supplémentaire ne peut jamais
-- échouer sur des données existantes.
alter table public.enseignants
  add constraint enseignants_id_etablissement_unique unique (id, etablissement_id);


-- ============================================================================
-- 2. EXTENSION DE pointages — self-service mobile, additive uniquement.
-- ============================================================================
alter table public.pointages
  alter column photo_path drop not null;

alter table public.pointages
  add column if not exists source text not null default 'kiosque'
    check (source in ('kiosque', 'mobile_self_service'));

-- Horodatage côté appareil, distinct de `horodatage` (déjà réception
-- serveur par construction : le kiosque comme le futur RPC mobile
-- calculent tous deux `now()` côté serveur, jamais une valeur fournie par
-- le client). Nullable : sans objet pour les pointages kiosque existants,
-- et non garanti même pour un pointage mobile en ligne (l'appareil peut
-- ne rien fournir) — seul `horodatage` fait autorité pour le calcul des
-- heures.
alter table public.pointages
  add column if not exists device_occurred_at timestamptz;

-- Garantie DB que la paire (enseignant_id, establishment_id) d'un
-- pointage est toujours cohérente, indépendamment de RLS/RPC — même
-- raisonnement que students en MOBILE-01.3.
alter table public.pointages
  drop constraint if exists pointages_enseignant_id_fkey;
alter table public.pointages
  add constraint pointages_enseignant_etablissement_fkey
  foreign key (enseignant_id, etablissement_id)
  references public.enseignants (id, etablissement_id)
  on delete cascade;

create index if not exists idx_pointages_enseignant_source_horodatage
  on public.pointages (enseignant_id, source, horodatage);

-- Lecture directe (jamais d'écriture directe : le check-in/checkout
-- mobile passe exclusivement par sync_apply_staff_punch ci-dessous, même
-- philosophie que sync_apply_attendance_mark — aucune confiance dans un
-- enseignant_id fourni par le navigateur). Un enseignant ne voit jamais
-- les pointages kiosque d'un collègue ni les siens hors self-service.
drop policy if exists "pointages_teacher_self_read" on public.pointages;
create policy "pointages_teacher_self_read" on public.pointages
  for select
  using (
    source = 'mobile_self_service'
    and enseignant_id in (select id from public.enseignants where user_id = auth.uid())
  );


-- ============================================================================
-- 3. CHECK-IN / CHECK-OUT — RPC unique, idempotent, jamais de confiance
--    dans l'identité fournie par le client (mission §28, leçon OFFLINE-01
--    + MOBILE-01.3).
-- ============================================================================
-- Réutilise le ledger sync_mutations existant (offline_sync_foundation)
-- pour le replay-safety, exactement comme sync_apply_absence_create et
-- sync_apply_attendance_mark — aucun second mécanisme d'idempotence
-- inventé. p_device_occurred_at est une донnée contextuelle uniquement :
-- `horodatage` (calculé ici, jamais fourni par le client) reste la seule
-- source d'autorité pour tout calcul d'heures.
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
begin
  if v_caller is null then
    raise exception 'Non authentifié';
  end if;

  if p_type not in ('arrivee', 'depart') then
    return query select 'rejected'::text, null::uuid, 'Type de pointage invalide'::text, null::text;
    return;
  end if;

  -- Idempotence / replay.
  select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id for update;
  if v_existing.mutation_id is not null then
    if v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
      return query select 'rejected'::text, null::uuid, 'Accès refusé'::text, null::text;
      return;
    end if;
    return query select v_existing.status, v_existing.entity_id, v_existing.error, null::text;
    return;
  end if;

  -- Identité enseignant résolue côté serveur, jamais fournie par le
  -- client — défense en profondeur au-delà de RLS.
  select id into v_teacher_id from public.enseignants
    where user_id = v_caller and etablissement_id = p_establishment_id
    limit 1;

  if v_teacher_id is null then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Accès refusé pour cet établissement');
    return query select 'rejected'::text, null::uuid, 'Accès refusé pour cet établissement'::text, null::text;
    return;
  end if;

  -- Séquencement : le dernier pointage self-service du jour, tous types
  -- confondus, pour cet enseignant dans cet établissement.
  select * into v_last_open from public.pointages
    where enseignant_id = v_teacher_id
      and etablissement_id = p_establishment_id
      and source = 'mobile_self_service'
      and horodatage::date = v_now::date
    order by horodatage desc
    limit 1;

  if p_type = 'arrivee' and v_last_open.id is not null and v_last_open.type = 'arrivee' then
    -- Double check-in actif : rejeté explicitement plutôt que de laisser
    -- la DB accepter un état impossible (mission §11).
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Une journée est déjà en cours — terminez-la avant d''en commencer une nouvelle');
    return query select 'rejected'::text, null::uuid, 'Une journée est déjà en cours — terminez-la avant d''en commencer une nouvelle'::text, null::text;
    return;
  end if;

  if p_type = 'depart' and (v_last_open.id is null or v_last_open.type != 'arrivee') then
    -- Checkout sans checkin actif : rejeté explicitement (mission §11).
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Aucune journée en cours à terminer');
    return query select 'rejected'::text, null::uuid, 'Aucune journée en cours à terminer'::text, null::text;
    return;
  end if;

  if p_type = 'depart' and v_now < v_last_open.horodatage then
    -- Durée négative : impossible, rejeté (mission §15).
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'staff_punch', 'create', p_establishment_id, v_caller, null, 'rejected', 'Horodatage incohérent');
    return query select 'rejected'::text, null::uuid, 'Horodatage incohérent'::text, null::text;
    return;
  end if;

  -- Anomalies signalées mais non bloquantes (mission §15) : horodatage
  -- appareil anormalement dans le futur (>10 min de dérive tolérée), ou
  -- shift excessivement long (>12h) à la clôture.
  if p_device_occurred_at is not null and p_device_occurred_at > v_now + interval '10 minutes' then
    v_anomaly := 'offline_timestamp_review';
  elsif p_type = 'depart' and v_now - v_last_open.horodatage > interval '12 hours' then
    v_anomaly := 'schedule_variance';
  end if;

  begin
    insert into public.pointages (etablissement_id, enseignant_id, type, source, horodatage, device_occurred_at, photo_path)
    values (p_establishment_id, v_teacher_id, p_type, 'mobile_self_service', v_now, p_device_occurred_at, null)
    returning id into v_new_id;

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

revoke execute on function public.sync_apply_staff_punch(uuid, uuid, text, timestamptz) from public, anon, service_role;
grant execute on function public.sync_apply_staff_punch(uuid, uuid, text, timestamptz) to authenticated;


-- ============================================================================
-- 4. CORRECTIONS — l'historique brut (pointages) reste immuable ; toute
--    divergence passe par une demande explicite, auditable (mission §19).
-- ============================================================================
create table public.timesheet_corrections (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  enseignant_id     uuid not null,
  -- Pointage brut concerné, si la correction porte sur une ligne
  -- existante (ex. corriger une heure) — NULL pour "j'ai oublié de
  -- pointer" (aucune ligne n'existe encore).
  pointage_id       uuid references public.pointages(id) on delete set null,
  correction_type   text not null check (correction_type in ('missing_check_in', 'missing_check_out', 'adjust_time')),
  target_date       date not null,
  proposed_type     text check (proposed_type in ('arrivee', 'depart')),
  proposed_time     timestamptz not null,
  reason            text not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by      uuid not null references auth.users(id),
  requested_at      timestamptz not null default now(),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  constraint timesheet_corrections_enseignant_etablissement_fkey
    foreign key (enseignant_id, establishment_id)
    references public.enseignants (id, etablissement_id)
    on delete cascade
);

create index if not exists idx_timesheet_corrections_enseignant on public.timesheet_corrections(enseignant_id, target_date);
create index if not exists idx_timesheet_corrections_establishment_status on public.timesheet_corrections(establishment_id, status);

alter table public.timesheet_corrections enable row level security;

-- L'enseignant crée et lit ses propres demandes, jamais celles d'un
-- collègue ; ne peut jamais s'auto-approuver (aucune policy UPDATE pour
-- ce rôle).
drop policy if exists "timesheet_corrections_teacher_own" on public.timesheet_corrections;
create policy "timesheet_corrections_teacher_own" on public.timesheet_corrections
  for select
  using (enseignant_id in (select id from public.enseignants where user_id = auth.uid()));

drop policy if exists "timesheet_corrections_teacher_create" on public.timesheet_corrections;
create policy "timesheet_corrections_teacher_create" on public.timesheet_corrections
  for insert
  with check (
    requested_by = auth.uid()
    and enseignant_id in (select id from public.enseignants where user_id = auth.uid())
    and status = 'pending'
  );

-- Le propriétaire (frontière d'autorité réelle actuelle — voir l'audit en
-- tête de fichier) gère les corrections de son établissement, y compris
-- la revue (approve/reject).
drop policy if exists "timesheet_corrections_owner_manage" on public.timesheet_corrections;
create policy "timesheet_corrections_owner_manage" on public.timesheet_corrections
  for all
  using (exists (select 1 from public.establishments e where e.id = timesheet_corrections.establishment_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.establishments e where e.id = timesheet_corrections.establishment_id and e.owner_id = auth.uid()));


-- ============================================================================
-- 5. HEURES VALIDÉES — source canonique pour la future paie (mission
--    §22/§23). Immuable une fois créée : une nouvelle approbation pour la
--    même période remplace logiquement la précédente via
--    supersedes_approval_id, sans jamais réécrire ni supprimer l'ancienne
--    ligne (audit trail intégral, mission §21, sans table d'audit
--    générique séparée — la ligne elle-même est l'audit).
-- ============================================================================
create table public.timesheet_approvals (
  id                    uuid primary key default gen_random_uuid(),
  establishment_id      uuid not null references public.establishments(id) on delete cascade,
  enseignant_id         uuid not null,
  period_start          date not null,
  period_end            date not null,
  approved_minutes      integer not null check (approved_minutes >= 0),
  status                text not null default 'approved' check (status in ('approved', 'disputed')),
  approved_by           uuid not null references auth.users(id),
  approved_at           timestamptz not null default now(),
  note                  text,
  supersedes_approval_id uuid references public.timesheet_approvals(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint timesheet_approvals_enseignant_etablissement_fkey
    foreign key (enseignant_id, establishment_id)
    references public.enseignants (id, etablissement_id)
    on delete cascade,
  constraint timesheet_approvals_period_valid check (period_end >= period_start)
);

-- Une seule approbation ACTIVE (non-remplacée) par (enseignant, période) :
-- appliqué par l'application (jamais deux lignes actives simultanées pour
-- la même période), pas une contrainte UNIQUE stricte, pour permettre la
-- ré-approbation via supersedes_approval_id sans jamais supprimer
-- l'historique.
create index if not exists idx_timesheet_approvals_enseignant_period on public.timesheet_approvals(enseignant_id, period_start, period_end);
create index if not exists idx_timesheet_approvals_establishment on public.timesheet_approvals(establishment_id, period_start);

alter table public.timesheet_approvals enable row level security;

drop policy if exists "timesheet_approvals_teacher_read_own" on public.timesheet_approvals;
create policy "timesheet_approvals_teacher_read_own" on public.timesheet_approvals
  for select
  using (enseignant_id in (select id from public.enseignants where user_id = auth.uid()));

-- Immuable : seule une INSERT est permise pour le propriétaire, jamais
-- d'UPDATE/DELETE — une correction post-approbation crée une nouvelle
-- ligne référençant l'ancienne.
drop policy if exists "timesheet_approvals_owner_create_read" on public.timesheet_approvals;
create policy "timesheet_approvals_owner_create_read" on public.timesheet_approvals
  for select
  using (exists (select 1 from public.establishments e where e.id = timesheet_approvals.establishment_id and e.owner_id = auth.uid()));

drop policy if exists "timesheet_approvals_owner_insert" on public.timesheet_approvals;
create policy "timesheet_approvals_owner_insert" on public.timesheet_approvals
  for insert
  with check (
    approved_by = auth.uid()
    and exists (select 1 from public.establishments e where e.id = timesheet_approvals.establishment_id and e.owner_id = auth.uid())
  );


-- ============================================================================
-- FIN — aucune donnée existante supprimée ou modifiée, aucune migration
-- antérieure altérée rétroactivement, aucun second modèle Teacher créé,
-- aucun couplage forcé vers staff_members/absences, moteur offline
-- (syncEngine/syncIdentity/outbox) jamais touché.
-- ============================================================================
