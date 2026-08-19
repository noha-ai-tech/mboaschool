# National Registry Architecture — Écoles237

Fondation de l'import national des établissements scolaires camerounais depuis des sources officielles
(mission DATA-REGISTRY-01). Ce document décrit l'architecture livrée dans cette mission — pas une cible future
non construite.

**Note sur le fichier de référence** : la mission mentionnait un fichier architectural
`ECOLES237_NATIONAL_REGISTRY_SCHEMA.sql` comme point de départ. **Ce fichier n'existe pas dans ce dépôt** —
recherche exhaustive effectuée, aucune trace. Le schéma ci-dessous a donc été conçu directement à partir des
spécifications textuelles de la mission (tables, classification canonique, principes de traçabilité), pas adapté
d'un fichier préexistant. Si un tel fichier existe ailleurs (transmis par l'architecte séparément), il devra être
comparé à `supabase/migrations/0006_national_registry_staging.sql` avant toute exécution.

---

## 1. Principe absolu de traçabilité

> Ne jamais créer une école sans pouvoir identifier sa provenance.

Chaque ligne de `establishment_import_staging` porte, sans exception :

- `source_ministry` (enum, jamais nul)
- `source_url` (jamais nul)
- `source_year` (nullable — pas toujours connu, mais le champ existe)
- `official_identifier` (nullable — pas toujours disponible)
- `raw_data` (jsonb, **données originales intactes avant toute normalisation**)

Aucun champ normalisé (`education_family`, `ownership`, `region`, ...) n'existe sans que `raw_data` permette de
retrouver exactement ce qui a été lu à la source.

## 2. Vue d'ensemble du flux

```
Source ministérielle (ex. MINESEC)
        │  fetch (poli : délai, retries, User-Agent identifiable)
        ▼
RawSourceRecord[]              (scripts/school-registry/types.ts)
        │  normalizeRecord()   (lib/normalize.ts — fonction pure, sans I/O)
        ▼
NormalizedStagingRecord[]      (champs canoniques calculés + fingerprint)
        │  deduplicateBatch()  (lib/dedup.ts — dédoublonnage intra-batch)
        ▼
Rapport de qualité + fichier de staging (dry-run local dans cette mission)
        │  [ÉTAPE NON CONSTRUITE — hors périmètre de cette mission]
        ▼
INSERT INTO establishment_import_staging   (nécessite la migration 0006, non exécutée)
        │  [ÉTAPE NON CONSTRUITE — décision humaine requise, hors périmètre]
        ▼
Promotion manuelle vers `establishments`
```

Seules les deux premières flèches (fetch → normalisation → dédoublonnage) sont implémentées et testées dans
cette mission. Les étapes suivantes (écriture réelle en base de staging, promotion vers `establishments`) sont
volontairement non construites — voir `IMPORT_RUNBOOK.md` pour la procédure prévue.

## 3. Schéma de staging (migration préparée, non exécutée)

Fichier : `supabase/migrations/0006_national_registry_staging.sql`

- `establishment_data_sources` — une ligne par exécution d'import (un "batch"), pas une ligne par ministère.
  Permet de savoir quand une source a été consultée et combien d'enregistrements en sont sortis.
- `establishment_import_staging` — une ligne par établissement importé, avant toute promotion. Contient à la
  fois les champs canoniques et `raw_data` intact.

RLS activée sur les deux tables, restreinte à `platform_admin` — aucune donnée de staging n'est publique par
défaut, cohérent avec le fait qu'elle n'a subi aucune revue humaine.

Détail complet des colonnes : voir le fichier de migration lui-même (commenté) et `FIELD_MAPPING.md`.

## 4. Classification canonique

Trois axes de classification, indépendants de `main_category`/`sub_category` existants d'Écoles237 (qui restent
inchangés — cette mission ne modifie aucune donnée produit) :

- `education_family` — 11 valeurs, alignées sur les ministères de tutelle plutôt que sur la structure commerciale
  actuelle d'Écoles237. Voir `FIELD_MAPPING.md` §3 pour la logique de classification et ses limites.
- `ownership` — `public` / `private` / `community` / `other`. Confiance faible dans cette version (aucune source
  vérifiée ne l'expose de façon fiable à 100 %) — voir `FIELD_MAPPING.md`.
- `subsystem` — `francophone` / `anglophone` / `bilingual` / `not_applicable` / `unknown`. Seul axe à confiance
  haute pour MINESEC (mapping direct depuis la source).

Ces trois axes cohabitent avec `establishments.main_category`/`ownership_type` déjà existants — aucune décision
n'a été prise ici sur la façon dont ils se rejoindront lors d'une future promotion (question pour le fondateur,
voir `IMPORT_RUNBOOK.md`).

## 5. Localisation

Sept concepts distincts demandés par la mission — `region`, `department`, `arrondissement`, `commune`,
`locality`, `city`, `quarter` — mappés sur les cinq colonnes de localisation déjà présentes dans `establishments`
(`region`, `department`, `arrondissement`, `city`, `neighborhood`/`quartier`) plus deux concepts nouveaux
(`commune`, `locality`) qui n'ont pas d'équivalent direct dans le schéma produit actuel.

**Aucune valeur n'est inventée quand la source ne la fournit pas.** Pour MINESEC spécifiquement, région/
département/arrondissement ne sont pas disponibles par ligne (voir `FIELD_MAPPING.md` §2) — ces champs restent
`null` dans le staging plutôt que déduits par une correspondance non validée.

## 6. Dédoublonnage

Voir `DEDUPLICATION_RULES.md` pour le détail complet. Résumé : matricule officiel prioritaire, sinon nom
normalisé + géographie ; aucune suppression automatique ; les cas ambigus vont en statut `duplicate_review`.

## 7. Architecture des adaptateurs

```
scripts/school-registry/
  types.ts                    # Contrat commun (RawSourceRecord, SourceAdapter, enums)
  lib/
    normalize.ts               # Normalisation + classification canonique (fonctions pures)
    dedup.ts                    # Dédoublonnage intra-batch (fonction pure)
    politeFetch.ts                # Fetch réseau avec délai/retries/User-Agent
  sources/
    minesec.ts                    # Fonctionnel — voir SOURCE_CATALOG.md
    minedub.ts, minesup.ts,        # Stubs — lèvent une erreur explicite,
    minefop.ts, minsante.ts,        # aucune implémentation simulée
    minader.ts, minepia.ts,
    minfof.ts
  fixtures/
    minesec-sample.html              # Fixture de test (3 lignes réelles + lignes synthétiques marquées)
  output/                              # Sorties du dry-run (gitignored via node_modules non, mais voir note)
  run-import.ts                         # CLI de test
  package.json, tsconfig.json              # Toolchain isolée — n'affecte pas les dépendances de l'app principale
```

Chaque adaptateur retourne le même format canonique (`RawSourceRecord[]`) quel que soit le ministère source —
`normalizeRecord()` et `deduplicateBatch()` sont écrits une seule fois et fonctionnent pour toute source
respectant ce contrat.

**Isolation délibérée** : `scripts/school-registry/` a son propre `package.json` et son propre `node_modules`,
séparé de celui de l'application Next.js. Installer les dépendances de ce package (`cheerio`, `tsx`) n'a modifié
ni `package.json` ni `package-lock.json` de l'application principale.

## 8. Ce que cette mission NE construit PAS

Conformément à la consigne "ne rien importer massivement" :

- Aucune écriture réelle dans Supabase (ni `establishment_import_staging`, ni `establishments`)
- Aucun crawl complet d'aucune source (MINESEC testé sur une fixture de 8 lignes, pas les ~1960 enregistrements réels estimés)
- Aucune promotion staging → establishments (logique non écrite)
- Aucune interface d'administration pour revoir les doublons `duplicate_review`

---

## 9. Mise à jour réalité — SPRINT R.4 (2026-08-19)

Les sections 1-8 ci-dessus décrivent l'architecture **telle que livrée par
la mission DATA-REGISTRY-01 initiale** — figées, non réécrites. Depuis,
plusieurs sprints (N à R.3.2) ont réellement construit ce que la section 8
listait comme non fait : écritures Supabase réelles, crawl complet MINESEC
(1942 lignes), promotion staging → establishments (1938 MINESEC + 161
Major Cities live à ce jour), garde-fou de production
(`scripts/school-registry/lib/productionGuard.ts`), et le framework
d'extraction déterministe complet
(`docs/03_DATA_REGISTRY/REGISTRY_EXTRACTION_SAFETY.md`,
`scripts/school-registry/lib/extraction/`). Ne pas se fier à la section 8
pour l'état actuel — elle documente un point de départ historique.

### 9.1 Audit multi-identifiant (SPRINT R.4 §7 — AUDIT SEULEMENT, aucune migration)

**Constat** (SPRINT MINESEC V1.1) : MINESEC opère au moins deux espaces de
matricules structurellement incompatibles pour ce qui semble être la même
population d'établissements — le format ESG à 17 caractères de MINESEC V1
et le format cartescolaire.cm (préfixe régional à 2 lettres ou préfixe
numérique non décodé). Zéro recouvrement direct d'identifiant entre les
deux ; la seule corroboration possible passe par nom + géographie.

**Implication architecturale** : `establishments.official_id` (colonne
unique, `text`) suppose implicitement qu'un établissement a AU PLUS un
identifiant officiel, provenant d'AU PLUS un registre. Ce postulat est déjà
faux pour les établissements Major Cities corroborés (SPRINT R.3.2) — ils
n'ont volontairement PAS d'`official_id` (l'identifiant cartescolaire vit
dans `source_reference`, en texte libre, faute de colonne dédiée) alors
qu'ils possèdent bien un identifiant officiel réel dans un registre réel.

Avant MINESUP/MINEFOP/MINSANTE/Transport — chacun avec vraisemblablement
son propre schéma de matricule, indépendant de MINESEC — ce postulat va se
heurter au même problème à plus grande échelle : un établissement supérieur
pourrait avoir un identifiant MINESUP ET un identifiant MINESANTE (école de
santé rattachée à une université), un centre de formation professionnelle
pourrait relever à la fois de MINEFOP et du Ministère des Transports.

**Recommandation** (à valider par l'équipe/l'architecte avant MINESUP, pas
décidée par ce sprint) : un modèle relationnel séparé plutôt qu'une
extension de colonnes sur `establishments` :

```
establishment_registry_identifiers
  id                  uuid primary key
  establishment_id    uuid references establishments(id)
  authority           text        -- ex. 'MINESEC', 'MINESUP', 'cartescolaire.cm'
  registry            text        -- ex. 'ESG_V1', 'MINESEC_CARTESCOLAIRE'
  identifier           text        -- la valeur brute du matricule/identifiant
  identifier_type      text        -- ex. 'DIGIT_PREFIX_17', 'ALPHA_PREFIX_2LETTER'
  source_url            text
  verified_at            timestamptz
  unique (registry, identifier)  -- unicité PAR registre, jamais globale
```

Avantages par rapport à l'ajout de colonnes `official_id_minesup`,
`official_id_minesante`, etc. : nombre de registres non plafonné à l'avance,
`unique(registry, identifier)` empêche un doublon interne à un registre
sans jamais supposer que deux registres partagent un espace d'identifiants,
et l'historique de vérification (`verified_at`) devient possible par
identifiant plutôt que par établissement entier.

**Aucune migration n'a été créée ni exécutée pour cette recommandation** —
décision d'architecture qui dépasse le périmètre d'un sprint d'audit.

### 9.2 Réutilisabilité du framework pour REGISTRY-MULTI-A (SPRINT R.4 §8)

Le pipeline déjà construit et éprouvé sur MINESEC + Major Cities + audit
cartescolaire reste, à évaluer composant par composant, directement
réutilisable pour MINESUP/MINEFOP/MINSANTE/Transport :

| Étape | Composant existant | Réutilisable tel quel |
|---|---|---|
| Raw source + SHA256 | `lib/extraction/sourceSnapshot.ts` | OUI |
| fetched_at / parser_version | `lib/extraction/types.ts` (contrat `ExtractionResult`) | OUI |
| Completeness verdict | `lib/extraction/completeness.ts` | OUI |
| Source authority (Tier 1-3) | Politique documentée (`REGISTRY_EXTRACTION_SAFETY.md`), pas de code dédié | OUI (politique), à appliquer par ministère |
| Normalized candidate | `lib/normalize.ts` + adaptateurs par ministère | PARTIEL — chaque ministère a son propre parseur HTML (déjà anticipé : `sources/minesup.ts` etc. existent en stub) |
| Matching (official_id / identity / fuzzy) | Logique dupliquée par script de promotion (`promote-*.ts`) | À FACTORISER — actuellement recopiée par sprint, candidate à extraction en module partagé avant MINESUP |
| Staging | `establishment_import_staging` (table unique, `source_ministry` distingue déjà) | OUI |
| Human review + approval snapshot | Convention de fichiers `reports/registry/*-approval.json` + checksum déterministe | OUI |
| Controlled promotion | `lib/productionGuard.ts` (`assertRegistryProductionWriteAllowed`) | OUI, générique par ministère/batch |
| Audit trail | `*-promotion-summary.json` + `*-created-ids.json` | OUI |

Aucun besoin de dupliquer quatre pipelines incompatibles. Le seul point non
encore factorisé est le MATCHING (chaque script de promotion recalcule sa
propre logique de correspondance) — recommandé comme nettoyage avant
MINESUP plutôt qu'une nouvelle copie du même code, mais non bloquant pour
démarrer.
