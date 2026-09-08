-- ============================================================================
-- SYNC-03 REPOSITORY RECONCILIATION — GIT RENUMBERING ONLY.
--
-- Historically executed in production under filename 0025_admissions_config.sql
-- (branch feat/pro-school-organization). Renumbered to 0028_admissions_config.sql during
-- repository reconciliation with origin/main, whose own registry track
-- independently occupied numbers 0021-0025 (establishment_registry_
-- identifiers, transport_source_ministry_enum, registry_column_
-- protection, school_page_sections, storage_multi_school_hardening — see
-- reports/release/release-integration-a-conflict-resolution.csv on
-- origin/main for that side's own equivalent reconciliation).
--
-- DO NOT interpret this rename as pending DDL for the existing production
-- database. The SQL body below is byte-for-byte unchanged from 0025_admissions_config.sql;
-- nothing here needs to be (re)executed. This header is documentation
-- only, added purely to prevent a future reader from mistaking an
-- already-applied migration for pending work.
-- ============================================================================

-- ============================================================================
-- 0025_admissions_config.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte.
-- SPRINT CMS-D.1 — PUBLIC ADMISSIONS CONFIG.
--
-- Configuration Admissions PUBLIQUE (ouvert/fermé, niveaux proposés,
-- conditions, documents requis, période, informations complémentaires),
-- strictement distincte de `public.applications` (dossiers individuels
-- privés — enfant, parent, notes internes, statut). Cette migration ne
-- touche ni ne lit `applications` d'aucune façon.
--
-- Additive uniquement : nouvelle table, aucune donnée existante modifiée.
-- Lazy configuration (mission §5) : aucun backfill pour les ~2240 écoles —
-- 0 ligne = comportement public actuel inchangé (voir mission §6, appliqué
-- côté application dans ParentTab, pas ici).
-- ============================================================================

create table if not exists public.admissions_config (
  id                 uuid primary key default gen_random_uuid(),
  establishment_id   uuid not null unique references public.establishments(id) on delete cascade,
  is_open            boolean not null default true,
  levels             text[] not null default '{}',
  conditions         text,
  required_documents text[] not null default '{}',
  period_start       date,
  period_end         date,
  additional_info    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint admissions_config_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

-- ----------------------------------------------------------------------------
-- updated_at — même idiome que 0021 (touch_school_page_sections_updated_at),
-- idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ----------------------------------------------------------------------------
create or replace function public.touch_admissions_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admissions_config_touch_updated_at on public.admissions_config;
create trigger admissions_config_touch_updated_at
  before update on public.admissions_config
  for each row execute procedure public.touch_admissions_config_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — lecture publique, écriture réservée au propriétaire réel de
-- l'établissement. Réutilise public.is_own_establishment(uuid) (0023,
-- déjà multi-écoles-safe : exists(...owner_id=auth.uid()), pas de
-- current_establishment_id()). Si 0023 n'est pas encore exécutée au moment
-- où cette migration est appliquée, is_own_establishment() n'existera pas
-- non plus — cette migration DOIT être appliquée après 0023, jamais avant.
-- ----------------------------------------------------------------------------
alter table public.admissions_config enable row level security;

drop policy if exists "admissions_config_public_read" on public.admissions_config;
create policy "admissions_config_public_read" on public.admissions_config
  for select
  using (true);

drop policy if exists "admissions_config_owner_write" on public.admissions_config;
create policy "admissions_config_owner_write" on public.admissions_config
  for all
  using (public.is_own_establishment(establishment_id))
  with check (public.is_own_establishment(establishment_id));

-- ----------------------------------------------------------------------------
-- Grants explicites (mission §4) — la RLS reste seule responsable de
-- l'autorisation ligne par ligne ; les grants ne font qu'établir le
-- plafond d'opérations autorisées par rôle Postgres.
-- ----------------------------------------------------------------------------
revoke all on public.admissions_config from anon, authenticated;
grant select on public.admissions_config to anon, authenticated;
grant insert, update, delete on public.admissions_config to authenticated;

-- ============================================================================
-- FIN — table additive, vide par défaut, aucune donnée existante modifiée,
-- aucune lecture ni écriture de `applications`.
-- ============================================================================
