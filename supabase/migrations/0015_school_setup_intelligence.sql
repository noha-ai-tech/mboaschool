-- ============================================================================
-- 0015_school_setup_intelligence.sql
--
-- PREPAREE MAIS NON EXECUTEE.
-- Sprint L - School Setup Intelligence V1. Ne pas executer dans Supabase SQL
-- Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Objectif : staging pour l'import intelligent de configuration d'etablissement
-- (classes, enseignants, matieres, salles, emploi du temps, indices de paie).
-- Calque sur le pattern deja valide de 0006_national_registry_staging.sql :
-- capture brute (raw_data jsonb) + statut de revue + promotion explicite vers
-- les tables reelles. AUCUNE table metier nouvelle - ce module alimente
-- uniquement classes/matieres/salles/enseignants/emplois_du_temps/staff_members
-- deja existants, via le meme chemin d'ecriture que les formulaires manuels.
--
-- Isolation : toutes les tables sont scopees par current_establishment_id()
-- (fonction deja live, utilisee par matieres/salles/emplois_du_temps) - jamais
-- par un role platform_admin comme le registre national (0006), puisque c'est
-- le directeur de l'etablissement qui possede et confirme ses propres imports.
--
-- AUCUNE SUPPRESSION - toutes les operations sont additives et idempotentes.
-- ============================================================================


-- ============================================================================
-- 1. STATUTS
-- ============================================================================

create type school_setup_import_status as enum (
  'uploaded', 'extracting', 'review_required', 'ready',
  'committing', 'completed', 'failed', 'cancelled'
);

create type school_setup_import_mode as enum ('structured', 'intelligent', 'manual');

create type school_setup_file_status as enum ('uploaded', 'parsed', 'failed');

create type school_setup_parse_method as enum ('deterministic', 'ai');

-- Un type par famille d'entite reelle que ce module peut proposer - correspond
-- 1:1 aux tables reelles qu'il alimente (jamais de table AI* parallele).
create type school_setup_entity_type as enum (
  'teacher', 'staff', 'class', 'subject', 'room',
  'assignment', 'timetable_slot', 'payroll_hint'
);

create type school_setup_draft_status as enum ('proposed', 'confirmed', 'rejected', 'merged');

create type school_setup_issue_type as enum (
  'duplicate_teacher', 'duplicate_class', 'duplicate_subject', 'duplicate_room',
  'name_ambiguity', 'schedule_conflict_teacher', 'schedule_conflict_room',
  'schedule_conflict_class', 'low_confidence', 'payroll_confirmation',
  'parse_error', 'other'
);

create type school_setup_issue_severity as enum ('blocking', 'warning', 'info');


-- ============================================================================
-- 2. IMPORTS (un lot = une session d'import)
-- ============================================================================

create table if not exists public.school_setup_imports (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  mode              school_setup_import_mode not null,
  status            school_setup_import_status not null default 'uploaded',
  target_annee_scolaire_id uuid references public.annees_scolaires(id) on delete set null,
  started_by        uuid references auth.users(id) on delete set null,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_school_setup_imports_etablissement
  on public.school_setup_imports (etablissement_id, created_at desc);

alter table public.school_setup_imports enable row level security;

create policy "Directeur gere ses imports" on public.school_setup_imports
  for all using (etablissement_id = public.current_establishment_id())
  with check (etablissement_id = public.current_establishment_id());


-- ============================================================================
-- 3. FICHIERS (un fichier uploade dans un lot)
-- ============================================================================
-- Stockage reel dans un nouveau bucket "school-setup-imports" (meme pattern
-- que staff-documents : path = {import_id}/{timestamp}-{filename}). Aucune
-- cle service-role exposee au navigateur - upload cote client avec la session
-- du directeur, comme les 4 buckets existants.

create table if not exists public.school_setup_files (
  id                uuid primary key default gen_random_uuid(),
  import_id         uuid not null references public.school_setup_imports(id) on delete cascade,
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  storage_path      text not null,
  original_filename text not null,
  mime_type         text,
  size_bytes         integer,
  doc_type          text, -- 'emploi_du_temps'|'personnel'|'enseignants'|'classes'|'matieres'|'salles'|'paie'|'autre'|null (auto-detecte)
  status            school_setup_file_status not null default 'uploaded',
  parse_method      school_setup_parse_method,
  parse_error       text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_school_setup_files_import on public.school_setup_files (import_id);

alter table public.school_setup_files enable row level security;

create policy "Directeur gere ses fichiers d'import" on public.school_setup_files
  for all using (etablissement_id = public.current_establishment_id())
  with check (etablissement_id = public.current_establishment_id());


-- ============================================================================
-- 4. DRAFTS (une ligne = une entite candidate, jamais ecrite dans les tables reelles)
-- ============================================================================
-- `data` porte les champs normalises (forme proche de la table reelle visee),
-- `raw_data` conserve la source brute pour tracabilite (regle "provenance").
-- matched_existing_id : si le systeme pense que ce brouillon correspond a une
-- ligne deja reelle (ex. enseignant deja dans `enseignants`) - jamais fusionne
-- automatiquement, seulement suggere (regle 11 : l'IA ne fusionne jamais un
-- cas ambigu sans confirmation).

create table if not exists public.school_setup_drafts (
  id                  uuid primary key default gen_random_uuid(),
  import_id           uuid not null references public.school_setup_imports(id) on delete cascade,
  etablissement_id    uuid not null references public.establishments(id) on delete cascade,
  entity_type         school_setup_entity_type not null,
  data                jsonb not null default '{}'::jsonb,
  raw_data            jsonb,
  source_file_id      uuid references public.school_setup_files(id) on delete set null,
  source_page         integer,
  confidence          numeric(3,2), -- 0.00 - 1.00
  status              school_setup_draft_status not null default 'proposed',
  matched_existing_id uuid, -- id dans la table reelle correspondante (enseignants/classes/matieres/salles), jamais un FK typé puisque la cible varie selon entity_type
  duplicate_of_draft_id uuid references public.school_setup_drafts(id) on delete set null,
  promoted_id         uuid, -- rempli au moment du commit final, id reel cree
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_school_setup_drafts_import on public.school_setup_drafts (import_id, entity_type);
create index if not exists idx_school_setup_drafts_etablissement on public.school_setup_drafts (etablissement_id);

alter table public.school_setup_drafts enable row level security;

create policy "Directeur gere ses brouillons d'import" on public.school_setup_drafts
  for all using (etablissement_id = public.current_establishment_id())
  with check (etablissement_id = public.current_establishment_id());


-- ============================================================================
-- 5. ISSUES (conflits, ambiguites, doublons a trancher)
-- ============================================================================

create table if not exists public.school_setup_issues (
  id                uuid primary key default gen_random_uuid(),
  import_id         uuid not null references public.school_setup_imports(id) on delete cascade,
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  issue_type        school_setup_issue_type not null,
  severity          school_setup_issue_severity not null default 'warning',
  related_draft_ids uuid[] not null default '{}',
  description       text not null,
  resolved          boolean not null default false,
  resolution        text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_school_setup_issues_import on public.school_setup_issues (import_id, resolved);

alter table public.school_setup_issues enable row level security;

create policy "Directeur gere les issues de ses imports" on public.school_setup_issues
  for all using (etablissement_id = public.current_establishment_id())
  with check (etablissement_id = public.current_establishment_id());


-- ============================================================================
-- 6. AI USAGE (suivi de cout, des la V1 - regle 40)
-- ============================================================================

create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  import_id         uuid references public.school_setup_imports(id) on delete set null,
  provider          text not null,
  model             text not null,
  input_units       integer not null default 0,
  output_units      integer not null default 0,
  estimated_cost_fcfa numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_usage_etablissement on public.ai_usage (etablissement_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "Directeur lit le cout IA de son etablissement" on public.ai_usage
  for select using (etablissement_id = public.current_establishment_id());

-- Pas de policy insert/update pour le client : l'ecriture se fait uniquement
-- cote serveur (route API avec le client authentifie du directeur, jamais un
-- role service - la route agit "au nom de" l'etablissement courant).
create policy "Systeme peut enregistrer le cout IA" on public.ai_usage
  for insert with check (etablissement_id = public.current_establishment_id());


-- ============================================================================
-- FIN - aucune table metier modifiee, aucune donnee reelle touchee. Toutes les
-- operations sont additives et idempotentes (create if not exists partout).
-- ============================================================================
