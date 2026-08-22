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

---

## 10. MULTI-REGISTRY FOUNDATION — SPRINT REGISTRY-MULTI-A (2026-08-19)

Ce sprint transforme la recommandation §9.1 en artefacts concrets — schéma
préparé (non exécuté), module de matching partagé, dry-run de backfill,
tests. Voir aussi `docs/03_DATA_REGISTRY/MULTI_REGISTRY_CONTRACT.md` pour
le contrat détaillé destiné aux futurs collecteurs.

### 10.1 Audit du modèle actuel (§4 de la spec — 12 questions)

1. **Où les identifiants officiels sont-ils stockés ?** `establishments.official_id`
   (text, migration 0018, colonne UNIQUE) et `establishment_import_staging.official_identifier`
   (text, migration 0006). Deux colonnes séparées, une par table, jamais synchronisées automatiquement.
2. **Combien d'identifiants un établissement peut-il représenter aujourd'hui ?**
   **Un seul.** `official_id` est une colonne scalaire. Prouvé insuffisant en
   pratique par SPRINT R.3.2 : 161 établissements ont une corroboration
   officielle réelle (cartescolaire.cm/MINESEC) qui n'a nulle part où vivre
   structurellement — reléguée en texte libre dans `source_reference`.
3. **Quels endroits supposent "1 établissement = 1 official_id" ?**
   Tout script `promote-*.ts` qui écrit `official_id: d.row.official_identifier`
   dans son payload d'INSERT (5 scripts). Le Review Center
   (`src/app/dashboard/admin/registre/page.tsx`) affiche un seul champ
   "Matricule" par ligne. Aucune dépendance côté Search V2 ou claim flow
   (voir points 8-10).
4. **Quels scripts utilisent official_id comme clé de déduplication ?**
   Tous les scripts `promote-*.ts` (priorité 1 dans leur logique de matching,
   cohérent avec `DEDUPLICATION_RULES.md` §1) + `backfill-minesec-official-ids.ts`
   + `audit-batch-002-matricules.ts` + `match-batch-001.ts`/`match-batch-002.ts`.
   29 fichiers au total référencent `official_id`/`official_identifier`
   (`grep -rl` sur `scripts/school-registry/`).
5. **Quels index UNIQUE dépendent de cette hypothèse ?**
   `uq_establishments_source_ministry_official_id` — index UNIQUE PARTIEL sur
   `(source_ministry, official_id) WHERE official_id IS NOT NULL` (migration
   0018). Déjà namespacé par ministère (pas un UNIQUE(official_id) global) —
   bonne pratique déjà en place, mais la colonne scalaire sous-jacente reste
   la vraie limite (point 2), pas cet index.
6. **Composants cassés par une migration multi-ID naïve ?** Aucun composant
   applicatif ne lit `official_id` en dehors du Review Center (point 3) — une
   migration additive (nouvelle table, `official_id` intact) ne casse rien.
   Une migration qui SUPPRIMERAIT `official_id` casserait le Review Center et
   tous les scripts de promotion existants — **non envisagée**, voir §10.2.
7. **official_id est-il exposé publiquement ?** NON — absent de
   `src/lib/search/types.ts` (`SchoolSearchResult`), absent de
   `/api/recherche`, absent des colonnes sélectionnées par `/ecole/[id]`.
8. **Utilisé dans les claims ?** NON — `src/app/api/claims/route.ts` ne
   référence ni `official_id` ni `official_identifier`.
9. **Utilisé dans Search V2 ?** NON — confirmé par audit direct de
   `src/app/api/recherche/route.ts` et `queryBuilder.ts` (`SEARCHABLE_COLUMNS`
   n'inclut pas `official_id`).
10. **Utilisé dans les URLs ?** NON — les routes utilisent `establishments.id`
    (uuid), jamais `official_id` (`/ecole/[id]`, `/revendiquer/[id]`).
11. **Utilisé comme FK ailleurs ?** NON — aucune contrainte FK sur cette
    colonne dans le schéma actuel (vérifié : `official_id` n'apparaît que sur
    `establishments`, pas référencé depuis une autre table).
12. **Peut-on ajouter un modèle multi-ID sans supprimer le champ historique ?**
    OUI — c'est exactement ce que fait la migration préparée §10.2 : table
    séparée, `official_id` intact, zéro dépendance applicative cassée
    (points 7-11).

**Conclusion de l'audit** : `official_id` est une colonne à faible risque de
migration (peu de dépendances, bien isolée) mais structurellement
insuffisante (colonne scalaire = un seul identifiant). La voie la plus sûre
est additive, jamais une réécriture destructrice.

### 10.2 Modèle cible — préparé, non exécuté

`supabase/migrations/0021_establishment_registry_identifiers.sql` —
**PRÉPARÉE MAIS NON EXÉCUTÉE**, comme toute migration de ce projet avant
validation explicite. Table `establishment_registry_identifiers` : un
enregistrement par identifiant, `UNIQUE(registry, identifier)`, `authority`/
`registry` en texte libre (pas un enum fermé — extensibilité sans migration
répétée), RLS `platform_admin`-only (aucun besoin public confirmé, point 7
ci-dessus). Détail complet et justification champ-par-champ dans le fichier
de migration lui-même.

Namespaces authority/registry centralisés dans
`scripts/school-registry/lib/registryAuthority.ts` — réutilise l'enum
Postgres existant `registry_source_ministry` comme source de vérité pour
les autorités déjà connues, ajoute `MINTRANSPORT` comme **constante interne
stable uniquement** (absente de l'enum Postgres tant qu'aucune migration
`ALTER TYPE` n'est faite — non faite ici, aucune collecte Transport prévue
avant son propre audit).

### 10.3 Stratégie de compatibilité `official_id` (§7 de la spec)

```
PHASE 1 (ce sprint)   — official_id intact. Table establishment_registry_identifiers
                         préparée (migration 0021, NON exécutée).
PHASE 2 (futur)       — backfill réel des 1935 official_id MINESEC_ESG valides
                         (voir dry-run §10.4) + décision produit sur les 161
                         corroborations cartescolaire actuellement en texte libre.
PHASE 3 (futur)       — les nouveaux collecteurs (MINESUP etc.) écrivent
                         directement dans le modèle multi-ID dès leur promotion.
PHASE 4 (futur)       — code métier (Review Center notamment) lit
                         progressivement la nouvelle table en plus de/à la
                         place de official_id.
PHASE 5 (non planifiée) — dépréciation éventuelle de official_id, seulement
                         si PHASE 4 démontre que plus aucun code n'en dépend.
```

Aucune de ces phases n'est exécutée dans ce sprint au-delà de la
préparation PHASE 1. **MINESEC V1 continue de fonctionner sans modification
visible** — `official_id` n'est touché nulle part.

### 10.4 Backfill dry-run (§8 de la spec)

Script : `scripts/school-registry/backfill-registry-identifiers-dry-run.ts`
— LECTURE SEULE, aucune écriture (la table cible n'existe pas encore en
production). Rapport :
`reports/registry/registry-identifiers-backfill-dry-run.json`.

| Mesure | Valeur |
|---|---|
| Établissements avec official_id | 1938 |
| ...produiraient un identifiant registry (MINESEC_ESG, longueur conforme) | 1935 |
| source_ministry MINESEC | 1938 |
| source_ministry OTHER | 161 |
| Impossibles à classifier automatiquement | 0 |
| Valeurs invalides (longueur inattendue) | 3 |
| Collisions (registry, identifier) | 0 |
| Identifiants dupliqués (texte, tous registres confondus) | 0 |
| Identifiants qui seraient insérés (simulation, MINESEC_ESG + MINESEC_CARTESCOLAIRE) | 2096 |

Les 3 "valeurs invalides" (`CES de LINDOI`, `CES de NINONG`, `CES Bilingue
de NTENAKO` — longueurs 18/16/16 au lieu de 17) sont un constat réel sur les
données de production, pas une invention — trouvés en corrigeant une
première version du script qui utilisait une regex de motif de caractères
trop stricte (voir commentaire dans le script : le segment médian des
identifiants MINESEC_ESG a 3 variantes légitimes — `1GSF`/`1GSB`/`1GSA`,
1191/383/361 occurrences — qu'une regex figée aurait classées à tort comme
invalides).

Scénario double-identifiant (§9 de la spec, cartescolaire + MINESEC pour un
même établissement) : testé structurellement via fixture locale
(`lib/matching/__tests__/matching.test.ts` §23.H), pas contre des données de
production réelles — aucun des 161 établissements Major Cities n'a
d'identifiant MINESEC_ESG connu par ailleurs (zéro recouvrement direct,
SPRINT MINESEC V1.1), donc le cas réel "un même établissement avec ses deux
identifiants simultanément" n'existe pas encore dans les données actuelles.

### 10.5 Matching engine partagé

`scripts/school-registry/lib/matching/` (`engine.ts`, `types.ts`,
`__tests__/matching.test.ts`, 19 tests) — voir
`MULTI_REGISTRY_CONTRACT.md` §5-6 pour le détail. Règle permanente : FUZZY
MATCH != IDENTITY PROOF, aucun niveau autre qu'EXACT_IDENTIFIER/
EXACT_IDENTITY n'autorise `safeForAutoLink = true`, et ce champ vaut
`false` pour TOUS les niveaux dans l'implémentation actuelle (aucune fusion
automatique nulle part, y compris pour un identifiant exact — signal
"déjà existant", jamais une autorisation de fusion silencieuse de deux
fiches distinctes).

### 10.6 Review Center — lisibilité future

Audit (§19 de la spec) : `src/app/dashboard/admin/registre/page.tsx` affiche
aujourd'hui un seul champ "Matricule" (`official_identifier`, staging
uniquement — pas de vue sur `establishments.official_id` ni sur une future
table multi-ID). Pour afficher authority/registry/identifiants
multiples/discovery vs corroboration à terme, il faudrait une requête
supplémentaire vers `establishment_registry_identifiers` (une fois créée) —
**non fait dans ce sprint** (refonte UI hors périmètre, §19 : "ne pas
détourner ce sprint vers un projet UI"). Le modèle de données (§10.2) est
compatible avec cet affichage futur sans migration destructrice
supplémentaire.

### 10.7 Search V2 — dépendances auditées, aucune régression

`/api/recherche` ne sélectionne ni ne filtre sur `official_id` (confirmé
§10.1 point 9). Le modèle multi-ID n'introduit aucune dépendance nouvelle
côté recherche publique — les identifiants de registre restent
`platform_admin`-only (§10.2, RLS). Suite de tests existante (49 tests
extraction+search) rejouée sans modification ce sprint, voir rapport final.

## 11. ADDENDUM — SPRINT REGISTRY-NATIONAL-A (2026-08-22)

Addendum uniquement — rien ci-dessus n'est réécrit. READ-ONLY vis-à-vis de
la base (aucun INSERT/UPDATE/DELETE), voir
`reports/registry/registry-national-a-summary.json` pour la synthèse
complète et `reports/registry/registry-national-a-*.{json,csv}` pour tous
les rapports détaillés.

### 11.1 Correction de dérive documentaire — migrations 0018/0021

Les en-têtes de `supabase/migrations/0018_registry_identity_fields.sql` et
`0021_establishment_registry_identifiers.sql` affirment toujours
« PRÉPARÉE MAIS NON EXÉCUTÉE ». **Vérifié en direct ce sprint (requêtes
Supabase réelles, pas une supposition)** : les deux migrations SONT
exécutées en production — `establishments.official_id/source_ministry/
source_reference/source_url` existent et sont peuplés (2196/2249 lignes ont
`source_ministry` non nul), et `establishment_registry_identifiers` existe
et contient 2242 lignes. Les commentaires de ces deux fichiers sont
obsolètes et ne doivent plus être considérés comme l'état courant — un futur
sprint devrait les corriger formellement (hors périmètre ici, READ-ONLY).

### 11.2 Modèle de confiance à 3 dimensions généralisé au national

`scripts/school-registry/lib/nationalRegistry/publicationPolicy.ts` généralise
`transportTier3TrustModel.ts` (conservé inchangé) à un classement national à
10 catégories (§8 A-J du brief) via `evaluateNationalPublicationReadiness()`
— fonction pure, aucune écriture. Invariant testé (28 tests,
`lib/nationalRegistry/__tests__/publicationPolicy.test.ts`) : `PUBLISHED !=
OFFICIALLY_VERIFIED`, et un candidat Tier-3-only ne peut structurellement
jamais atteindre `CREATE_OFFICIALLY_VERIFIED`.

### 11.3 Univers national consolidé (résultat de ce sprint)

131 candidats nationaux consolidés (MINESUP + MINEFOP + MINSANTE +
MINTRANSPORT) : 97 déjà live, 29 nouveaux candidats staging non promus, 5
différés (Transport, `MISSING_SOURCE_URL`). 0 candidat MINEFOP (discovery
uniquement, confirmé). 3 candidats `CREATE_PUBLISHABLE_UNVERIFIED` (tous
Tier-3 Transport), 0 `CREATE_OFFICIALLY_VERIFIED`. Détail complet :
`reports/registry/registry-national-a-publication-manifest.csv`.

### 11.4 Blocage sémantique UI identifié (Decision B)

Audit §24 : le badge public « Vérifié » (`SchoolHeroCarousel.tsx`,
`SchoolCard.tsx`, page `/revendiquer/[id]`) est piloté uniquement par
`establishments.is_verified`, un booléen générique totalement déconnecté du
modèle à 3 dimensions — et l'action admin `POST
/api/admin/ecoles/[id]/verifier` peut le mettre à `true` sur n'importe quel
établissement sans référence à `official_id`/`source_ministry`. Aucune
incohérence dans les DONNÉES actuelles (0/97 établissements ministériels
live n'ont `is_verified=true`), mais rien dans le code n'empêche une future
confusion une fois des candidats `CREATE_PUBLISHABLE_UNVERIFIED` publiés.
**REGISTRY-NATIONAL-B ne doit pas démarrer avant un sprint
REGISTRY-NATIONAL-A.1 dédié à cette clarification sémantique.** Détail :
`reports/registry/registry-national-a-ui-semantics.json`.

### 11.5 MINSANTE-I — écart de consolidation documenté, pas comblé

L'extraction nationale MINSANTE-I (167 établissements, 8/10 filières SAFE)
n'existe que sous forme d'agrégats statistiques versionnés — aucun fichier
durable listant les 167 établissements nominativement n'a été retrouvé.
Ce sprint ne les a donc PAS consolidés comme candidats individuels (aurait
été une fabrication à partir d'agrégats). Un futur sprint devra d'abord
persister la liste nominative avant toute consolidation nationale de ces
167 établissements. Le blocage documentaire Imagerie Médicale
(`QUARANTINED_NUMBERING_ABSENT`, MINSANTE-I.2) reste préservé tel quel.

---

## 12. ADDENDUM — SPRINT REGISTRY-NATIONAL-A.1 (Public Trust Semantics Hardening)

Corrige le blocage identifié en §11.4 ci-dessus. Détail complet de la
sémantique canonique : `docs/03_DATA_REGISTRY/PUBLIC_TRUST_SEMANTICS.md`.

### 12.1 Résumé du correctif

- Résolveur central pur `resolveEstablishmentTrustState()` (nouveau module
  `src/lib/trust/resolveEstablishmentTrustState.ts`), 27 tests unitaires,
  couvrant la matrice A-O du brief §18 + les 5 fixtures de régression du
  manifest national §14.
- `establishments.is_verified` **reste inchangé côté DB** (Option A du brief
  §5 — aucune migration). Réinterprété côté code/UI comme
  `platform_verification` (`PLATFORM_VERIFIED`/`NOT_PLATFORM_VERIFIED`),
  jamais comme une preuve ministérielle.
- `official_verification` est calculé séparément — `OFFICIALLY_VERIFIED`
  exige une preuve au niveau `establishment_registry_identifiers.
  verification_status` (`CORROBORATED`/`CONFIRMED`), jamais déduite de
  `is_verified`/`is_claimed`/`owner_id`. **Vérifié en direct sur la
  production (2026-08-22) : 0/2242 identifiants de registre ont ce statut
  aujourd'hui — donc `OFFICIALLY_VERIFIED` ne peut être atteint par AUCUN
  établissement vivant à ce jour.** C'est le comportement sûr attendu.
- Tous les badges publics affichant auparavant le simple mot « Vérifié » (12
  emplacements UI, voir `reports/registry/registry-national-a1-public-ui-map.csv`)
  affichent désormais « Vérifié par Écoles237 ».
- L'action admin `POST /api/admin/ecoles/[id]/verifier` (bouton « Vérifier »)
  a été auditée : elle ne fait que `is_verified=true`, aucune vérification
  ministérielle. Renommée « Marquer vérifié par Écoles237 » partout dans
  l'UI admin — la route API elle-même est inchangée (aucune régression
  fonctionnelle, uniquement un renommage de libellé).
- Parcours de revendication (`/api/claims`, `/api/admin/claims/[id]/approve`)
  audité : un owner ne peut ni définir `official_verification`, ni fabriquer
  un identifiant de registre, ni définir `source_ministry` — le endpoint de
  soumission n'accepte tout simplement pas ces champs en entrée (whitelist
  serveur stricte). Voir `reports/registry/registry-national-a1-claim-field-policy.json`.
- **Aucun changement de wire format** sur `/api/recherche` (Search V2) — la
  correction porte sur le RENDU (libellés), pas sur le contrat réseau, pour
  respecter §13 (pas de payload supplémentaire inutile).
- **`PRODUCTION WRITES = 0`** — établissements/staging/registry identifiers
  confirmés inchangés avant/après (2249/2378/2242, delta 0/0/0).

### 12.2 Ce qui N'A PAS changé (hors périmètre volontaire)

- Aucune promotion des 3 candidats `CREATE_PUBLISHABLE_UNVERIFIED`.
- Aucun CMS construit.
- Aucune migration exécutée (aucune n'était nécessaire — `MIGRATION_DECISION
  = NO_MIGRATION_REQUIRED`).
- Le nom de plan commercial « Vérifiée » (`dashboard/admin/abonnements`) n'a
  pas été renommé — collision de nomenclature avec le concept de confiance
  signalée mais hors périmètre (décision produit commerciale distincte).
