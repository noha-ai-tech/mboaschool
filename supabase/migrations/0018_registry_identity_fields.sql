-- ============================================================================
-- 0018_registry_identity_fields.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Fait partie de SPRINT P.2A (réparation de dette technique — registre
-- national). Ne pas exécuter dans Supabase SQL Editor sans validation
-- explicite d'Eddy et de l'architecte.
--
-- Objectif : donner à `establishments` des champs structurés pour tracer la
-- provenance d'un établissement importé depuis une source externe (registre
-- ministériel). Corrige la cause racine de la dette Sprint O, où le
-- matricule MINESEC des 673 établissements du Batch 002 a été collé en texte
-- libre dans `description` faute de colonne dédiée (voir
-- reports/registry/batch-002-matricule-audit.csv — 673/673 extraits et
-- validés contre data/registry/master/minesec-master-v1.json, backfill
-- préparé séparément dans scripts/school-registry/backfill-minesec-official-ids.ts).
--
-- Audit préalable (SPRINT P.2A §2) : AUCUN champ équivalent n'existe sur
-- `establishments` (39 colonnes réelles vérifiées en direct via l'API REST)
-- pour official_id / source_ministry / source_reference / source_url /
-- source_updated_at / registry_import_batch.
--
-- ADDITIF UNIQUEMENT :
--  - Toutes les colonnes sont nullable. Aucune contrainte NOT NULL imposée
--    aux 721 lignes existantes.
--  - Aucun DROP, aucun renommage, aucune colonne existante modifiée.
--  - Réutilise le type `registry_source_ministry` déjà créé par la
--    migration 0006 (ne pas dupliquer la taxonomie ministère).
-- ============================================================================

alter table public.establishments
  add column if not exists official_id text,
  add column if not exists source_ministry registry_source_ministry,
  add column if not exists source_reference text,
  add column if not exists source_url text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists registry_import_batch text;

comment on column public.establishments.official_id is
  'Identifiant officiel côté ministère source (ex. matricule MINESEC). Jamais inventé — null si inconnu.';
comment on column public.establishments.source_ministry is
  'Ministère source si l''établissement provient du registre national. Null pour les fiches créées avant le registre (origine non tracée) ou dont la provenance n''est pas confirmée — voir SPRINT P.2A §19 : ne jamais remplir rétroactivement sans preuve.';
comment on column public.establishments.registry_import_batch is
  'Identifiant du batch d''import (ex. "minesec-batch-002-2026-08-16"), pour tracer quelle collecte a créé/mis à jour la ligne.';

-- ── Contrainte d'unicité ─────────────────────────────────────────────────────
-- UNIQUE(official_id) seul serait incorrect : plusieurs ministères pourraient
-- théoriquement émettre le même identifiant dans des espaces de nommage
-- différents. La contrainte porte donc sur la paire (source_ministry,
-- official_id), et seulement quand official_id n'est pas null — un index
-- unique partiel, pas une contrainte UNIQUE classique (qui ignorerait déjà
-- les NULL en Postgres, mais un index partiel documente l'intention
-- explicitement et reste plus léger : il n'indexe que les lignes concernées).

create unique index if not exists uq_establishments_source_ministry_official_id
  on public.establishments (source_ministry, official_id)
  where official_id is not null;

-- ── Index de recherche ───────────────────────────────────────────────────────
-- L'index d'unicité ci-dessus sert déjà les lookups (source_ministry,
-- official_id) — pas d'index supplémentaire redondant nécessaire pour ça.
--
-- Un index sur un "normalized_name" a été envisagé (SPRINT P.2A §5) mais
-- `establishments` n'a pas de colonne normalized_name (contrairement à
-- `establishment_import_staging`, qui en a une) — en ajouter une sortirait
-- du périmètre "champs d'identité registre" de cette migration. Reporté à
-- une migration dédiée au dédoublonnage si un besoin réel se confirme.

-- ============================================================================
-- FIN — additive uniquement. Ne touche à aucune ligne existante de
-- `establishments` (toutes les nouvelles colonnes restent null tant que le
-- backfill n'a pas été exécuté séparément, avec validation explicite).
-- ============================================================================
