-- ============================================================================
-- SYNC-03 REPOSITORY RECONCILIATION — GIT RENUMBERING ONLY.
--
-- Historically executed in production under filename 0024_hero_mode.sql
-- (branch feat/pro-school-organization). Renumbered to 0027_hero_mode.sql during
-- repository reconciliation with origin/main, whose own registry track
-- independently occupied numbers 0021-0025 (establishment_registry_
-- identifiers, transport_source_ministry_enum, registry_column_
-- protection, school_page_sections, storage_multi_school_hardening — see
-- reports/release/release-integration-a-conflict-resolution.csv on
-- origin/main for that side's own equivalent reconciliation).
--
-- DO NOT interpret this rename as pending DDL for the existing production
-- database. The SQL body below is byte-for-byte unchanged from 0024_hero_mode.sql;
-- nothing here needs to be (re)executed. This header is documentation
-- only, added purely to prevent a future reader from mistaking an
-- already-applied migration for pending work.
-- ============================================================================

-- ============================================================================
-- 0024_hero_mode.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte.
-- SPRINT CMS-C.1 — HERO MODE PERSISTENCE.
--
-- Persiste le choix d'affichage du hero (carrousel / image unique / aucun
-- média), jusqu'ici un état React local perdu au rechargement
-- (src/app/dashboard/ecole/etablissement/page.tsx). Colonne additive
-- uniquement, aucune table créée, aucune donnée métier modifiée.
--
-- BACKWARD COMPATIBILITY (mission §8, exigence dure) : la valeur par
-- défaut 'carousel' pour toutes les lignes existantes ne change AUCUN
-- rendu public existant. SchoolHeroCarousel (src/components/school/
-- SchoolHeroCarousel.tsx) n'affiche flèches/points que si
-- `visible.length > 1` et retombe sur un simple dégradé si 0 — donc une
-- école avec 0, 1 ou plusieurs photos affiche exactement le même hero
-- aujourd'hui qu'avant cette migration, tant que son propriétaire ne
-- choisit pas explicitement "image unique" ou "aucun média" (voir
-- src/lib/school/heroMode.ts, résolution partagée CMS + rendu public).
-- ============================================================================

alter table public.establishments
  add column if not exists hero_mode text
  not null default 'carousel'
  check (hero_mode in ('carousel', 'image', 'none'));

-- ============================================================================
-- FIN — 1 colonne additive avec valeur par défaut, aucune table supprimée,
-- aucun champ retiré, aucun backfill, aucune donnée de registre touchée,
-- owner_id/organization_id/forfait/subscription_plan inchangés.
-- ============================================================================
