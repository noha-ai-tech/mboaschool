-- ============================================================================
-- SYNC-03 REPOSITORY RECONCILIATION — GIT RENUMBERING ONLY.
--
-- Historically executed in production under filename 0027_fees_infrastructure_uniqueness.sql
-- (branch feat/pro-school-organization). Renumbered to 0030_fees_infrastructure_uniqueness.sql during
-- repository reconciliation with origin/main, whose own registry track
-- independently occupied numbers 0021-0025 (establishment_registry_
-- identifiers, transport_source_ministry_enum, registry_column_
-- protection, school_page_sections, storage_multi_school_hardening — see
-- reports/release/release-integration-a-conflict-resolution.csv on
-- origin/main for that side's own equivalent reconciliation).
--
-- DO NOT interpret this rename as pending DDL for the existing production
-- database. The SQL body below is byte-for-byte unchanged from 0027_fees_infrastructure_uniqueness.sql;
-- nothing here needs to be (re)executed. This header is documentation
-- only, added purely to prevent a future reader from mistaking an
-- already-applied migration for pending work.
-- ============================================================================

-- ============================================================================
-- 0027_fees_infrastructure_uniqueness.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte.
-- SPRINT CMS-F.5A.2 — FINAL 0027 HARDENING.
--
-- Décision architecte (CMS-F.5A.2) : le modèle de données est
-- "UNE ligne fees appartient à EXACTEMENT UN établissement" (idem
-- infrastructures) — une ligne sans establishment_id est invalide. Cette
-- migration impose donc NOT NULL **et** UNIQUE sur establishment_id pour
-- les deux tables, pas seulement UNIQUE (revu depuis la version
-- CMS-F.5A.1 de ce fichier, qui n'ajoutait que UNIQUE et documentait la
-- nullabilité comme hors scope — l'architecte a tranché : elle est
-- maintenant dans le scope).
--
-- Nécessaire pour que le futur publish_school_page() (CMS-F.5, PAS ENCORE
-- CRÉÉE) puisse écrire fees/infrastructures avec
-- INSERT ... ON CONFLICT (establishment_id) DO UPDATE au lieu du repli
-- historique (UPDATE, puis INSERT seulement si aucune ligne trouvée).
--
-- Vérifications effectuées avant d'écrire cette version (rôle service,
-- lecture globale — la RLS normale restreint chaque propriétaire à ses
-- propres établissements, insuffisante pour un audit global) et
-- reconfirmées par l'architecte (CMS-F.5A.2) :
--   - fees            : 6 lignes au total, 0 ligne establishment_id NULL,
--                       0 groupe de doublons (establishment_id non-null).
--   - infrastructures : 6 lignes au total, 0 ligne establishment_id NULL,
--                       0 groupe de doublons.
--   - Aucune contrainte UNIQUE n'existe déjà sur establishment_id pour ces
--     deux tables, ni sous les noms ci-dessous ni sous un autre nom.
--
-- SÉCURITÉ D'EXÉCUTION (§1/§4) : cette migration ne répare et ne supprime
-- JAMAIS de donnée. Si l'état de la production a changé entre cet audit
-- et l'exécution réelle de cette migration (une ligne establishment_id
-- NULL ou un doublon serait apparu entre-temps), les gardes ci-dessous
-- FONT ÉCHOUER la migration explicitement (raise exception) plutôt que de
-- corriger silencieusement quoi que ce soit. Aucun UPDATE, aucun DELETE,
-- aucun INSERT, aucun backfill nulle part dans ce fichier.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fees — gardes défensives puis NOT NULL puis UNIQUE.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fees where establishment_id is null) then
    raise exception 'Migration 0027 abandonnée : public.fees contient au moins une ligne establishment_id IS NULL — réparation manuelle requise avant NOT NULL (aucune donnée modifiée par cette migration).';
  end if;

  if exists (
    select establishment_id
    from public.fees
    where establishment_id is not null
    group by establishment_id
    having count(*) > 1
  ) then
    raise exception 'Migration 0027 abandonnée : public.fees contient des establishment_id dupliqués — réparation manuelle requise avant UNIQUE (aucune donnée modifiée par cette migration).';
  end if;
end
$$;

alter table public.fees
  alter column establishment_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fees_establishment_id_key'
      and conrelid = 'public.fees'::regclass
  ) then
    alter table public.fees
      add constraint fees_establishment_id_key
      unique (establishment_id);
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. infrastructures — même traitement, mêmes gardes.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.infrastructures where establishment_id is null) then
    raise exception 'Migration 0027 abandonnée : public.infrastructures contient au moins une ligne establishment_id IS NULL — réparation manuelle requise avant NOT NULL (aucune donnée modifiée par cette migration).';
  end if;

  if exists (
    select establishment_id
    from public.infrastructures
    where establishment_id is not null
    group by establishment_id
    having count(*) > 1
  ) then
    raise exception 'Migration 0027 abandonnée : public.infrastructures contient des establishment_id dupliqués — réparation manuelle requise avant UNIQUE (aucune donnée modifiée par cette migration).';
  end if;
end
$$;

alter table public.infrastructures
  alter column establishment_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'infrastructures_establishment_id_key'
      and conrelid = 'public.infrastructures'::regclass
  ) then
    alter table public.infrastructures
      add constraint infrastructures_establishment_id_key
      unique (establishment_id);
  end if;
end
$$;

-- ============================================================================
-- FIN — NOT NULL + UNIQUE(establishment_id) sur fees et infrastructures.
-- Aucune ligne existante modifiée, aucune suppression, aucun backfill : les
-- gardes en tête de chaque section font échouer la migration explicitement
-- si les données actuelles ne respectent pas déjà l'invariant, plutôt que
-- de les corriger silencieusement. Idempotente pour un re-run après un
-- premier succès (ALTER ... SET NOT NULL sur une colonne déjà NOT NULL est
-- un no-op ; les contraintes UNIQUE sont ajoutées via DO $$ + vérification
-- pg_constraint, même idiome que 0026 pour school_images_status_check).
-- Débloque l'usage de ON CONFLICT (establishment_id) pour ces deux tables
-- dans le futur publish_school_page() (CMS-F.5) — RPC déjà revue et
-- approuvée sous réserve de cette migration (CMS-F.5A.1), non modifiée ici.
-- ============================================================================
