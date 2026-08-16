-- ============================================================================
-- 0016_geographic_hierarchy.sql
--
-- EXÉCUTÉE EN PRODUCTION (constaté SPRINT P.1, 2026-08-16 — tables
-- `geo_regions`/`geo_departments`/`geo_arrondissements` et colonnes
-- `region_id`/`department_id`/`arrondissement_id` sur `establishments`
-- toutes présentes ; tables de référence vides, aucun seed inséré, aucun
-- établissement rattaché). Ce commentaire indiquait auparavant "non
-- exécutée" : obsolète, corrigé après audit. Voir
-- docs/03_DATA_REGISTRY/PRODUCTION_MIGRATION_STATE.md.
-- Fait partie de SPRINT M — Partie B (registre national des établissements).
-- Voir le rapport "SPRINT M — SIDEBAR + NATIONAL REGISTRY" pour le contexte complet.
--
-- Objectif : introduire une hiérarchie géographique NORMALISÉE (Région →
-- Département → Arrondissement) fondée sur la nomenclature officielle
-- utilisée par le MINESEC (source la plus structurée trouvée à ce jour —
-- voir carte scolaire numérique, cartescolaire.cm/minesec).
--
-- ADDITIF UNIQUEMENT :
--  - `establishments` et `establishment_import_staging` gardent leurs
--    colonnes texte libres (region/department/arrondissement/city/...)
--    INCHANGÉES. Rien n'est supprimé, rien n'est rendu obligatoire.
--  - Les nouvelles colonnes *_id sont nullable et n'écrivent aucune donnée
--    existante. Le rattachement des 48 établissements réels actuels aux
--    nouvelles tables est un acte séparé, manuel ou semi-manuel, hors
--    périmètre de cette migration (comme la promotion staging ->
--    establishments dans 0006).
-- ============================================================================

-- ── Tables de référence ──────────────────────────────────────────────────────

create table if not exists public.geo_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,             -- ex. "Centre", "Littoral" — nomenclature officielle,
                                          -- jamais "province" (terme obsolète, voir consigne produit)
  created_at timestamptz not null default now()
);

create table if not exists public.geo_departments (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.geo_regions(id) on delete restrict,
  name text not null,                    -- ex. "Wouri", "Mfoundi"
  created_at timestamptz not null default now(),
  unique (region_id, name)
);

create table if not exists public.geo_arrondissements (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.geo_departments(id) on delete restrict,
  name text not null,                    -- ex. "Douala 5e", "Yaoundé 3e"
  created_at timestamptz not null default now(),
  unique (department_id, name)
);

create index if not exists idx_geo_departments_region on public.geo_departments (region_id);
create index if not exists idx_geo_arrondissements_department on public.geo_arrondissements (department_id);

-- ── Rattachement additif (nullable) ──────────────────────────────────────────
-- Aucune contrainte not null : les colonnes texte existantes restent la
-- source de vérité tant que le rattachement n'a pas été fait/validé ligne
-- par ligne. Une ligne peut avoir le texte libre rempli et les *_id vides.

alter table public.establishments
  add column if not exists region_id uuid references public.geo_regions(id),
  add column if not exists department_id uuid references public.geo_departments(id),
  add column if not exists arrondissement_id uuid references public.geo_arrondissements(id);

alter table public.establishment_import_staging
  add column if not exists region_id uuid references public.geo_regions(id),
  add column if not exists department_id uuid references public.geo_departments(id),
  add column if not exists arrondissement_id uuid references public.geo_arrondissements(id);

create index if not exists idx_establishments_region_id on public.establishments (region_id);
create index if not exists idx_establishments_department_id on public.establishments (department_id);

-- ── RLS — lecture publique (référentiel, pas de donnée sensible) ────────────
-- Écriture réservée platform_admin, cohérent avec le reste du registre.

alter table public.geo_regions enable row level security;
alter table public.geo_departments enable row level security;
alter table public.geo_arrondissements enable row level security;

create policy "geo_regions public read" on public.geo_regions for select using (true);
create policy "geo_departments public read" on public.geo_departments for select using (true);
create policy "geo_arrondissements public read" on public.geo_arrondissements for select using (true);

create policy "platform_admin manages geo_regions" on public.geo_regions
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin updates geo_regions" on public.geo_regions
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin deletes geo_regions" on public.geo_regions
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));

create policy "platform_admin manages geo_departments" on public.geo_departments
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin updates geo_departments" on public.geo_departments
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin deletes geo_departments" on public.geo_departments
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));

create policy "platform_admin manages geo_arrondissements" on public.geo_arrondissements
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin updates geo_arrondissements" on public.geo_arrondissements
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
create policy "platform_admin deletes geo_arrondissements" on public.geo_arrondissements
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));

-- ============================================================================
-- FIN — cette migration ne remplit aucune table (les 10 régions / ~58
-- départements / ~360 arrondissements du Cameroun ne sont PAS insérés ici :
-- un seed séparé, sourcé et vérifié, est nécessaire — hors périmètre).
-- Elle ne touche à aucune ligne existante de `establishments`.
-- ============================================================================
