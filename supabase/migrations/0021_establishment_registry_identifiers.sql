-- ============================================================================
-- 0021_establishment_registry_identifiers.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- SPRINT REGISTRY-MULTI-A — ne pas exécuter dans Supabase SQL Editor sans
-- validation explicite de Jean Merlain, Eddy et de l'architecte. Aucune
-- écriture production dans ce sprint ; ce fichier documente une
-- recommandation prête à être appliquée si/quand elle est approuvée.
--
-- CONTEXTE (audit §4 de ce sprint) : `establishments.official_id` (colonne
-- unique, migration 0018) suppose implicitement qu'un établissement a AU
-- PLUS un identifiant officiel. Ce postulat est déjà faux dans les données
-- réelles : SPRINT R.3.2 a promu 161 établissements avec une corroboration
-- officielle cartescolaire.cm/MINESEC réelle, mais `official_id` est resté
-- NULL pour tous — faute de colonne capable de représenter DEUX espaces
-- d'identifiants MINESEC incompatibles (17 caractères "GSFD" pour MINESEC
-- V1 vs préfixe alpha/digit pour cartescolaire, zéro recouvrement direct,
-- voir SPRINT MINESEC V1.1). Le matricule cartescolaire vit aujourd'hui en
-- texte libre dans `source_reference` — traçable mais pas structuré,
-- interrogeable, ni garanti unique.
--
-- OBJECTIF : permettre à un établissement de porter PLUSIEURS identifiants,
-- chacun rattaché à un registre précis (pas seulement une autorité/ministère
-- — MINESEC seul opère déjà deux registres incompatibles), avec une
-- contrainte d'unicité PAR REGISTRE, jamais globale.
--
-- ADDITIF / NON DESTRUCTIF :
--  - `establishments.official_id` n'est ni supprimé, ni renommé, ni
--    modifié. Reste la source de vérité pour tout code existant tant
--    qu'aucune migration de lecture n'est décidée séparément (PHASE 4/5 de
--    la stratégie documentée dans NATIONAL_REGISTRY_ARCHITECTURE.md §9).
--  - Aucune ligne existante d'`establishments` n'est touchée.
--  - Table entièrement nouvelle, vide à la création — un backfill éventuel
--    est un script séparé, avec sa propre validation humaine (voir
--    scripts/school-registry/backfill-registry-identifiers-dry-run.ts,
--    dry-run uniquement dans ce sprint).
-- ============================================================================

create table if not exists public.establishment_registry_identifiers (
  id                  uuid primary key default gen_random_uuid(),
  establishment_id    uuid not null references public.establishments(id) on delete cascade,

  -- Institution émettrice (ex. 'MINESEC', 'MINESUP') — texte libre plutôt
  -- que l'enum `registry_source_ministry` existant : cette table doit
  -- pouvoir accueillir une autorité future (ex. le Ministère des
  -- Transports) SANS attendre une migration ALTER TYPE séparée sur l'enum
  -- utilisé par establishments/establishment_import_staging. Les deux
  -- restent volontairement découplés.
  authority           text not null,

  -- Registre PRÉCIS au sein de l'autorité (ex. 'MINESEC_ESG' vs
  -- 'MINESEC_CARTESCOLAIRE') — voir
  -- scripts/school-registry/lib/registryAuthority.ts pour les valeurs
  -- actuellement connues. Volontairement `text` ouvert, pas un enum fermé
  -- (§6 de la spec : ne pas inventer les noms des futurs registres avant
  -- leur audit).
  registry             text not null,

  identifier            text not null,

  -- Format observé de l'identifiant dans ce registre (ex.
  -- 'ESG_17CHAR', 'CARTESCOLAIRE_ALPHA_PREFIX', 'CARTESCOLAIRE_DIGIT_PREFIX')
  -- — documentaire, jamais utilisé pour valider/rejeter une valeur.
  identifier_type        text,

  source_url             text,
  -- Note de corroboration/contexte en texte libre — même rôle que
  -- establishments.source_reference, à l'échelle d'un identifiant plutôt
  -- que de l'établissement entier.
  source_reference        text,

  -- 'UNVERIFIED' | 'CORROBORATED' | 'CONFIRMED' — concept DISTINCT de
  -- l'enum existant `establishment_verification_status` (migration 0008),
  -- qui concerne la revendication/vérification d'une fiche par son
  -- propriétaire, pas la fiabilité d'un identifiant de registre externe.
  -- Texte volontairement, pas un enum fermé tant que les vraies valeurs
  -- utiles n'ont pas été confirmées par l'usage réel (cohérent avec
  -- l'approche `registry`/`authority` ci-dessus).
  verification_status      text not null default 'UNVERIFIED',

  -- Marque l'identifiant à afficher en priorité si plusieurs existent pour
  -- le même établissement — au plus un `is_primary = true` par
  -- établissement, contrainte applicative (voir index partiel ci-dessous),
  -- jamais devinée automatiquement par cette migration.
  is_primary               boolean not null default false,

  first_seen_at             timestamptz not null default now(),
  last_verified_at           timestamptz,
  created_at                  timestamptz not null default now(),

  -- Extensibilité sans migration répétée pour chaque nouveau registre —
  -- ex. sous-schéma cartescolaire (ALPHA_PREFIX/DIGIT_PREFIX), confiance de
  -- décodage géographique. Jamais un substitut aux colonnes structurées
  -- ci-dessus pour ce qui est déjà connu et interrogeable.
  metadata                     jsonb
);

comment on table public.establishment_registry_identifiers is
  'SPRINT REGISTRY-MULTI-A — un établissement peut posséder plusieurs identifiants officiels provenant de plusieurs registres institutionnels distincts. Ne remplace pas establishments.official_id (conservé, non modifié) — voir NATIONAL_REGISTRY_ARCHITECTURE.md §9 pour la stratégie de migration progressive.';
comment on column public.establishment_registry_identifiers.registry is
  'Registre précis, PAS seulement l''autorité/ministère — une autorité peut opérer plusieurs registres incompatibles (ex. MINESEC_ESG vs MINESEC_CARTESCOLAIRE, prouvé SPRINT MINESEC V1.1, zéro recouvrement direct d''identifiant entre les deux).';

-- ── Contrainte d'unicité structurante ────────────────────────────────────
-- L'unicité se pense AU NIVEAU DU REGISTRE, jamais globalement : deux
-- registres différents peuvent légitimement émettre la même chaîne de
-- caractères sans que cela désigne le même établissement (§5/§13 de la
-- spec — coïncidence de namespace, pas un signal d'identité).
--
-- SPRINT MINESUP-B.1 (2026-08-19) — `identifier_type` AJOUTÉ à la
-- contrainte après preuve réelle sur un échantillon de 74 fiches IPES :
-- plusieurs institutions (ex. Institut Supérieur de Génie Civil (ISGeC),
-- British Higher Institute of Science and Technology (BHIST), Access
-- Higher Institute of Professional Studies) utilisent LA MÊME référence
-- d'arrêté texte pour "Arrêtés portant création" ET "Autorisation
-- d'ouverture" — deux actes juridiques distincts, donc deux lignes
-- distinctes voulues (identifier_type='CREATION_ORDER' vs
-- 'OPENING_AUTHORIZATION') pour le même établissement. Une contrainte
-- `UNIQUE(registry, identifier)` seule aurait rejeté la seconde ligne
-- comme un doublon alors qu'elle représente une donnée légitime et
-- différente. Voir reports/registry/minesup-b1-identifier-analysis.json
-- pour les cas réels observés. Migration toujours PRÉPARÉE, NON EXÉCUTÉE
-- — ce changement est sûr car aucune donnée n'a encore été écrite dans
-- cette table.
-- CAVEAT connu et accepté : `identifier_type` reste nullable (ligne 64).
-- Postgres ne considère jamais deux NULL comme égaux dans un index unique
-- — une future ligne avec `identifier_type = null` ne serait PAS protégée
-- contre un doublon `(registry, identifier)` par cet index. Dans les
-- données déjà envisagées (MINESEC_ESG, MINESUP_IPES) `identifier_type`
-- est systématiquement renseigné en pratique, donc ce n'est pas bloquant
-- aujourd'hui — mais tout futur registre qui laisserait ce champ null
-- devra s'appuyer sur la détection applicative
-- (`lib/matching/engine.ts::findIdentifierCollisions`), pas sur cet index
-- seul, pour ses garanties d'unicité.
create unique index if not exists uq_registry_identifiers_registry_type_identifier
  on public.establishment_registry_identifiers (registry, identifier_type, identifier);

-- Au plus un identifiant "primaire" par établissement — appliqué par index
-- partiel plutôt qu'un trigger, plus simple et suffisant ici.
create unique index if not exists uq_registry_identifiers_one_primary_per_establishment
  on public.establishment_registry_identifiers (establishment_id)
  where is_primary;

-- Lookup direct par établissement — requête la plus fréquente attendue
-- (afficher tous les identifiants connus d'une fiche).
create index if not exists idx_registry_identifiers_establishment
  on public.establishment_registry_identifiers (establishment_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Server-only par défaut — même principe que establishment_import_staging
-- (migration 0006) : un identifiant administratif n'est pas exposé
-- publiquement uniquement parce qu'il existe (§22 de la spec, principe de
-- minimisation). Aucun besoin produit confirmé aujourd'hui pour une lecture
-- publique — Search V2 (`/api/recherche`) ne dépend d'aucun identifiant
-- officiel (audité §4/§20 de ce sprint, confirmé par grep : le seul point du
-- code applicatif qui lit official_id/official_identifier aujourd'hui est
-- le Review Center admin, `src/app/dashboard/admin/registre/page.tsx`).
-- Revoir ce choix séparément si un besoin produit réel émerge (ex. afficher
-- un badge "matricule vérifié" public sur /ecole/[id]).
alter table public.establishment_registry_identifiers enable row level security;

create policy "platform_admin can read registry identifiers" on public.establishment_registry_identifiers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'platform_admin'
    )
  );

-- Aucune policy insert/update/delete pour les rôles applicatifs — les
-- écritures passent exclusivement par service_role (scripts de
-- backfill/promotion contrôlée), jamais depuis le navigateur.

-- ============================================================================
-- FIN — additive uniquement. `establishments.official_id` reste la source
-- de vérité pour tout code existant tant qu'aucune migration de LECTURE
-- séparée n'est décidée. Rollback : `drop table if exists
-- public.establishment_registry_identifiers;` (aucune dépendance entrante,
-- FK en ON DELETE CASCADE depuis cette table uniquement, jamais l'inverse).
-- ============================================================================
