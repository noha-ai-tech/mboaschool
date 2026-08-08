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
