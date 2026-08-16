-- ============================================================================
-- 0006_national_registry_staging.sql
--
-- EXÉCUTÉE EN PRODUCTION (constaté SPRINT P.1, 2026-08-16 — les tables
-- `establishment_data_sources` et `establishment_import_staging` existent
-- et sont interrogeables ; toutes deux vides à ce jour, aucune ligne
-- écrite). Ce commentaire indiquait auparavant "non exécutée" : obsolète,
-- corrigé après audit. Voir docs/03_DATA_REGISTRY/PRODUCTION_MIGRATION_STATE.md.
-- Fait partie de la mission DATA-REGISTRY-01 (fondation du répertoire national).
-- Voir docs/03_DATA_REGISTRY/IMPORT_RUNBOOK.md pour la procédure d'exécution du staging lui-même.
--
-- Objectif : fournir un espace de staging pour les établissements importés
-- depuis des sources ministérielles officielles (MINESEC, MINEDUB, MINESUP,
-- MINEFOP, MINSANTE, MINADER, MINEPIA, MINFOF, ...), SANS jamais écrire
-- directement dans `establishments`. La promotion staging -> establishments
-- est un acte séparé, manuel ou semi-manuel, hors périmètre de cette migration.
-- ============================================================================

-- ── Types énumérés ───────────────────────────────────────────────────────────

create type registry_source_ministry as enum (
  'MINEDUB', 'MINESEC', 'MINESUP', 'MINEFOP', 'MINSANTE',
  'MINADER', 'MINEPIA', 'MINFOF', 'OTHER'
);

-- Classification canonique Écoles237 — voir docs/03_DATA_REGISTRY/FIELD_MAPPING.md
-- pour la justification de chaque valeur et son origine ministérielle probable.
create type registry_education_family as enum (
  'basic',                        -- maternelle + primaire (MINEDUB)
  'secondary_general',             -- secondaire général (MINESEC)
  'secondary_technical',            -- secondaire technique/professionnel (MINESEC)
  'teacher_training',                -- écoles normales d'instituteurs (MINEDUB/MINESEC)
  'higher_education',                 -- universités, grandes écoles (MINESUP)
  'vocational_training',                -- formation professionnelle courte (MINEFOP)
  'health_training',                     -- écoles de santé (MINSANTE)
  'agricultural_training',                 -- formation agricole (MINADER)
  'livestock_fisheries_training',            -- élevage/pêche (MINEPIA)
  'forestry_wildlife_training',                -- forêts/faune (MINFOF)
  'other'
);

create type registry_ownership as enum ('public', 'private', 'community', 'other');

create type registry_subsystem as enum (
  'francophone', 'anglophone', 'bilingual', 'not_applicable', 'unknown'
);

create type registry_staging_status as enum (
  'pending',            -- importé brut, pas encore normalisé
  'normalized',         -- champs canoniques calculés
  'duplicate_exact',    -- doublon certain (matricule identique ou fingerprint exact)
  'duplicate_review',   -- doublon potentiel, ambigu — jamais supprimé automatiquement
  'ready',              -- normalisé, pas de doublon détecté, prêt pour revue humaine
  'rejected',           -- rejeté (donnée invalide, source interdite, etc.)
  'promoted'            -- promu manuellement vers establishments (hors périmètre de cette migration)
);

-- ── Table des sources ────────────────────────────────────────────────────────
-- Une ligne par exécution d'import (un "batch"), pas une ligne par ministère.

create table if not exists public.establishment_data_sources (
  id uuid primary key default gen_random_uuid(),
  ministry registry_source_ministry not null,
  source_name text not null,           -- ex. "Répertoire des Établissements ESG"
  source_url text not null,            -- URL exacte de la page/API consultée
  source_year integer,                 -- année de publication de la source, si connue
  fetched_at timestamptz not null default now(),
  records_fetched integer not null default 0,
  notes text,                          -- ex. limitations connues, méthode d'extraction
  created_at timestamptz not null default now()
);

-- ── Table de staging ─────────────────────────────────────────────────────────

create table if not exists public.establishment_import_staging (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.establishment_data_sources(id) on delete cascade,

  -- Provenance — PRINCIPE ABSOLU : jamais nul, jamais un établissement sans
  -- pouvoir remonter à sa source exacte.
  source_ministry registry_source_ministry not null,
  source_url text not null,
  source_year integer,
  official_identifier text,            -- matricule MINESEC, ou identifiant équivalent
                                        -- d'un autre ministère (nom générique volontaire :
                                        -- chaque ministère a sa propre terminologie)
  raw_data jsonb not null,             -- ligne source intacte, avant toute normalisation

  -- Champs canoniques Écoles237 (calculés à partir de raw_data)
  name_raw text not null,
  name_normalized text not null,
  education_family registry_education_family,
  ownership registry_ownership,
  subsystem registry_subsystem not null default 'unknown',
  region text,
  department text,
  arrondissement text,
  commune text,
  locality text,
  city text,
  quarter text,

  -- Dédoublonnage — voir docs/03_DATA_REGISTRY/DEDUPLICATION_RULES.md
  fingerprint text not null,
  duplicate_of_staging_id uuid references public.establishment_import_staging(id),
  duplicate_of_establishment_id uuid references public.establishments(id),

  -- Statut et traçabilité de la promotion
  status registry_staging_status not null default 'pending',
  rejection_reason text,
  promoted_establishment_id uuid references public.establishments(id),
  promoted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staging_fingerprint on public.establishment_import_staging (fingerprint);
create index if not exists idx_staging_status on public.establishment_import_staging (status);
create index if not exists idx_staging_identifier on public.establishment_import_staging (official_identifier);
create index if not exists idx_staging_source on public.establishment_import_staging (data_source_id);
create index if not exists idx_staging_name_normalized on public.establishment_import_staging (name_normalized);

-- ── RLS — aucune donnée de staging n'est publique ────────────────────────────

alter table public.establishment_data_sources enable row level security;
alter table public.establishment_import_staging enable row level security;

create policy "platform_admin manages data sources" on public.establishment_data_sources
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

create policy "platform_admin manages import staging" on public.establishment_import_staging
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

-- ============================================================================
-- FIN — cette migration ne touche pas à `establishments` et n'y insère rien.
-- ============================================================================
