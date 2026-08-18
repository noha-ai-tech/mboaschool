# Écoles237 — Registry Extraction Safety Policy

Référence obligatoire pour tout futur import du registre national Écoles237 — MINESEC (déjà en
production), Major Cities (SPRINT R.2), et tout ministère futur (MINESUP, MINEFOP, MINSANTE,
Transport, MINEDUB). Créé à l'issue de SPRINT R.2-SAFETY (2026-08-18), commit de référence
`9a2d28e`.

## Principe fondamental

> **Code déterministe pour collecter. IA pour comprendre.**

Un extracteur ne "pense" jamais qu'une page est complète — il le PROUVE avec un compte (DOM,
pagination, compteur source, fichier). Aucune étape du pipeline ci-dessous ne doit disparaître
silencieusement.

```
SOURCE
↓
RAW SNAPSHOT
↓
SOURCE INSPECTION
↓
DETERMINISTIC EXTRACTION
↓
COMPLETENESS GATE
↓
STRUCTURAL VALIDATION
↓
NORMALIZATION
↓
IDENTITY VALIDATION
↓
DEDUPLICATION
↓
AI ASSISTANCE IF NEEDED
↓
STAGING
↓
HUMAN REVIEW
↓
APPROVAL
↓
PROMOTION
↓
AUDIT
```

## Incident R.2 Yaoundé — origine du framework

Pendant SPRINT R.2, une première lecture d'une source Yaoundé assistée par un résumé IA (WebFetch)
a rapporté environ 10 établissements. Une extraction HTML déterministe du même contenu brut
(regex sur le DOM texte, comptage vérifiable) en a trouvé 231 — voir le test de non-régression
`§52` dans `scripts/school-registry/lib/extraction/__tests__/extraction.test.ts`, qui rejoue cet
écart sur le fichier source réel conservé
(`data/registry/raw/major-cities-secondary-completeness-v1/osidimbea-yaounde-prives-laics.html`).

Le problème n'était pas "l'IA en général" — c'était l'utilisation d'un résumé comme mécanisme
d'extraction exhaustive d'une liste structurée. L'IA n'a aucun moyen de prouver qu'elle a vu
toutes les lignes d'une page ; un parseur déterministe avec équation de complétude, si.
Conséquence : création de ce framework.

## Politique IA

**IA autorisée pour** : classification, ambiguïté, mapping de catégories, analyse de localités,
suggestions de doublons, compréhension de structures HTML difficiles, assistance au développement
d'un parser, traitement documentaire complexe (ex. PDF non structuré).

**IA interdite comme source primaire pour** : comptage exhaustif, extraction exhaustive d'une
liste structurée, pagination, détermination du nombre total de lignes, génération d'`official_id`,
reconstruction de lignes manquantes, décision de complétude, fusion automatique de doublons.

```
AI PRIMARY EXHAUSTIVE EXTRACTION = FORBIDDEN
```

Le statut d'une extraction ne dépend jamais d'une opinion IA — voir le test `§60`
("L'IA ne peut jamais outrepasser le verdict déterministe") : un statut IA optimiste ("looks
complete") fourni à `evaluateCompleteness` ne change rien si les comptes déterministes échouent,
parce que la fonction ne lit tout simplement pas ce champ pour calculer le statut.

## Équation de complétude

Si la source annonce explicitement `N` lignes (`expectedRowsSource: SOURCE_EXPLICIT_COUNTER`,
`API_TOTAL`, `PAGINATION_TIMES_ROWS` ou `FILE_COMPUTABLE`) :

```
EXPECTED SOURCE ROWS
=
VALID EXTRACTED + EXPLICITLY REJECTED + EXPLICIT DUPLICATES + EXPLAINED NON-DATA ROWS
```

doit tomber juste. Une règle comme `98% = PASS` est **interdite** comme règle universelle — voir
test `§15` (99/100 = 99% reste `INCOMPLETE_EXTRACTION`, jamais un arrondi silencieux vers PASS).

### PASS_WITH_EXPLAINED_EXCLUSIONS

Acceptable uniquement si chaque ligne absente du dataset final est explicitement identifiée et
catégorisée (`HEADER_FOOTER`, `DUPLICATE_EXACT`, `REJECTED_INVALID`, `OTHER`) avec un compte exact.
Aucune disparition silencieuse.

### EXPECTED_COUNT_UNKNOWN

Si la source n'annonce aucun total, `evaluateCompleteness` refuse par défaut
(`MANUAL_REVIEW_REQUIRED`, jamais un PASS silencieux — test `§18`). Un PASS n'est possible que si
l'appelant fournit une preuve explicite d'épuisement (`unknownCountExplicitlyComplete`), par
exemple :

- pagination épuisée (aucune page suivante, curseur stable) ;
- toutes les sections/rubriques attendues trouvées dans les titres du DOM (méthode utilisée pour
  les 4 sources memoire\*0.jimdofree.com — voir plus bas, ex. "les 6 arrondissements de Douala
  sont tous présents dans les titres de section") ;
- table unique entièrement parcourue, sans pagination détectée.

## Sécurité de pagination

Statuts bloquants dédiés, testés en `§56-57` :

```
PAGINATION_GAP     — trou dans la séquence de pages récupérées
PAGINATION_LOOP    — page identique à une page précédente (empreinte de contenu répétée)
MISSING_PAGE
UNEXPECTED_EMPTY_PAGE
NETWORK_FAILURE    — jamais interprété comme "0 résultat", voir §39
SOURCE_STRUCTURE_CHANGED
```

Un problème de pagination bloque l'import automatique (`safeForStaging: false`).

## HTTP 200 n'est pas un succès

Une réponse `HTTP 200` peut contenir une page de maintenance, un captcha, un écran de login, une
erreur HTML ou un contenu incomplet. `checkSourceStructure()` vérifie la présence de marqueurs
attendus (`requiredMarkers`) et l'absence de marqueurs interdits (`forbiddenMarkers`) avant toute
extraction — testé en `§58-59`.

## Raw snapshots

Toute source importante conserve, via `writeSourceSnapshot()`
(`scripts/school-registry/lib/extraction/sourceSnapshot.ts`), sous
`data/registry/raw/<batchId>/` :

```
source_url
fetched_at
content_sha256
source_type
parser_version
operator
```

Le raw source n'est jamais silencieusement remplacé — chaque nouvelle collecte écrit un nouveau
fichier `.meta.json` daté avec son propre hash.

## Hashing

Chaîne d'audit, SHA256 uniquement (`scripts/school-registry/lib/extraction/hashing.ts`) —
volontairement pas de mécanisme plus complexe (blockchain, système externe) :

```
RAW HASH
↓
EXTRACTION MANIFEST
↓
NORMALIZED DATASET HASH
↓
STAGING BATCH
↓
APPROVAL CHECKSUM
↓
PROMOTION REPORT
```

## Raw vs normalized vs display

Trois concepts distincts, jamais confondus :

```
RAW DATA         — tel que collecté, y compris fautes de frappe de la source
NORMALIZED DATA  — clé de comparaison/matching (accents/casse retirés)
DISPLAY DATA     — nom canonique public
```

Exemple concret rencontré pendant la ré-extraction : la source memoirelittoral0.jimdofree.com
orthographie un établissement "Lycée Bilingue de Nylon-**Braazzaville**" (double A, faute de
frappe dans le HTML source), alors que la ligne staging existante porte "Nylon-Brazzaville"
(orthographe corrigée). La valeur brute n'est jamais perdue au profit d'une correction silencieuse
— voir `reports/registry/extraction/major-cities-public-secondary-reextraction-v1.json`.

## Ordre obligatoire : extraction avant déduplication

```
EXTRACT → ACCOUNT → VALIDATE COMPLETENESS → NORMALIZE → DEDUP
```

Jamais `EXTRACT → DEDUP → COUNT` — dédupliquer avant d'avoir validé la complétude peut masquer une
extraction incomplète (une ligne manquante ressemble à une ligne dédupliquée).

## Source quality ≠ extraction quality

Deux dimensions séparées. Une source peut être :

```
EXTRACTION = PASS
SOURCE QUALITY = TIER 3
```

Cela ne signifie **pas** qu'elle est promouvable. Distinguer explicitement : extraction
completeness, source quality (TIER 1/2/3/DISCOVERY ONLY — voir `SOURCE_CATALOG.md`), identity
quality, location quality, match quality. Tier 3 / Discovery ne suffit jamais seul à une
promotion automatique.

## OCR

Uniquement pour scan/image/PDF non textuel. Marquer `OCR_USED = YES` sur le résultat
d'extraction. Un `official_id` issu uniquement d'OCR nécessite une validation plus stricte qu'un
`official_id` lu directement dans un flux texte/HTML.

## Rate limiting et retries

`scripts/school-registry/lib/politeFetch.ts` : délai entre requêtes (1500ms par défaut), retries
bornés avec backoff exponentiel (3 tentatives par défaut), timeout généreux (30s — sites
gouvernementaux camerounais parfois lents). Un échec réseau après épuisement des retries lève une
exception — jamais un tableau vide silencieux (voir "no silent error" ci-dessous). Pas
d'infrastructure de concurrence/throttling plus lourde tant qu'elle n'est pas nécessaire.

## No silent error

Un échec réseau ne doit jamais devenir silencieusement `0 établissement trouvé`. Audit du code
existant (SPRINT R.2-SAFETY-CLOSE) : aucun pattern `catch { return [] }` ou équivalent trouvé dans
`scripts/school-registry/` — `politeFetchText()` lève après épuisement des retries,
`PaginationTracker` propage les erreurs réseau, les scripts de promotion arrêtent le process
(`process.exit(1)`) sur `RegistryWriteRefused`. Ce constat est à revérifier à chaque nouvel
extracteur de ministère.

## Zero results

0 résultat n'est valide que si la source ou la requête le confirme explicitement (ex. ville sans
aucun établissement recensé sur une source qui liste explicitement "aucun résultat"). Sinon :
`ZERO_RESULTS_UNVERIFIED` — ne jamais interpréter silencieusement une page vide/erreur comme une
absence réelle de données.

## Data minimization

Collecter uniquement les données nécessaires sur les établissements eux-mêmes. Ne jamais collecter
élèves, parents, enseignants individuels ou toute autre donnée personnelle sensible — hors
périmètre de ce registre.

## Parser versioning

Chaque extracteur important porte une version identifiable dans son `ExtractionResult.parserVersion`
(ex. `major-cities-html@1`, ou le nom du script comme `reextract-major-cities-public-secondary-v1`
utilisé pour la ré-extraction Douala/Yaoundé). Pas de registre de versions centralisé/complexe —
une chaîne de caractères stable par extracteur suffit.

## Futurs ministères

Ce framework (`scripts/school-registry/lib/extraction/`) est **obligatoire** pour tout futur
import : MINESUP, MINEFOP, MINSANTE, Ministère des Transports, futur MINEDUB, ou toute autre
source nationale. Il est interdit de recréer un pipeline d'extraction parallèle par ministère —
réutiliser `evaluateCompleteness`, `checkSourceStructure`, `writeSourceSnapshot`,
`extractTableFirstColumn`/`extractSelectOptions`/`segmentByHeading`, ou étendre ce module si un
nouveau type de source structurée l'exige (voir "Leçons de la ré-extraction" ci-dessous pour deux
extensions déjà nécessaires en pratique).

## État vérifié : audit rétrospectif des 307/310 lignes pilote

`scripts/school-registry/retrospective-audit-r2-pilot.ts` (lecture seule) a audité les lignes
staging du pilote Douala/Yaoundé (`source_ministry='OTHER'`) écrites avant l'existence de ce
framework — 310 lignes au moment de l'exécution (estimé à 307 lors du cadrage initial du sprint).
Résultat, conservé dans
`reports/registry/extraction/r2-pilot-307-retrospective-audit.json` :

| Ville | Total | EXTRACTION_SAFE | EXTRACTION_UNCERTAIN |
|---|---|---|---|
| Douala | 55 | 23 | 32 |
| Yaoundé | 252 | 207 | 45 |
| Autres villes (Kumba, Bertoua) | 3 | 0 | 3 |
| **Total** | **310** | **230** | **80** |

`EXTRACTION_SAFE` signifie "méthode de collecte vérifiable" (parseur déterministe ou dropdown
`<select>` reconstitué), **pas** "source officielle" — les 310 lignes restent TOUTES Tier 3
(source quality ≠ extraction quality, voir plus haut), donc aucune n'est `CLEAN_APPROVABLE` quelle
que soit la méthode d'extraction.

Aucune des 310 lignes n'a été modifiée, supprimée ou promue par cet audit.

## Ré-extraction déterministe des 80 lignes EXTRACTION_UNCERTAIN

`scripts/school-registry/reextract-major-cities-public-secondary.ts` a re-collecté, de façon
déterministe, les 4 sources "liste" derrière 75 des 80 lignes EXTRACTION_UNCERTAIN — résultat dans
`reports/registry/extraction/major-cities-public-secondary-reextraction-v1.json` :

| Source | Ré-extrait | Staging existant | Statut complétude |
|---|---|---|---|
| Douala publics (memoirelittoral) | 38 | 30 | `PASS` |
| Yaoundé publics (mfoundi-publics) | 39 | 33 | `PASS` |
| Lycée Technique Charles Atangana | 1 | 1 | `PASS` |
| Yaoundé catholiques (mfoundi-catholiques) | 19 | 11 | `PASS` |

Les 5 lignes restantes (2 InovEdu — Douala, 3 ecolesaucameroun.com — Kumba x2 + Bertoua x1) sont
des fiches détail mono-établissement (`SINGLE_RECORD_SOURCE`, voir plus bas) — hors périmètre de
cette ré-extraction basée sur `htmlExtractor.ts`.

Cette ré-extraction reste lecture seule côté Supabase : elle établit une référence vérifiée pour un
futur import de complément, elle ne modifie, ne supprime ni ne promeut aucune ligne staging
existante. `PASS extraction` ne signifie pas `CLEAN_APPROVABLE` — la classification qualité de
source des 80 lignes reste inchangée.

### Sources mono-établissement (`SINGLE_RECORD_SOURCE`)

Les 5 fiches détail (InovEdu x2, ecolesaucameroun.com x3) portent la classification :

```
SINGLE_RECORD_SOURCE
LIST_COMPLETENESS_RULE = NOT_APPLICABLE
```

Une fiche détail décrivant un seul établissement n'a pas d'équation de complétude de liste — le
risque n'est pas un sous-comptage, c'est une erreur d'identité sur cette fiche unique. Elles
restent soumises aux règles habituelles : source quality, identity, matching, review. Aucune
promotion automatique.

### Leçons de la ré-extraction — deux extensions apportées au framework

En validant `htmlExtractor.ts` contre des pages réelles (au-delà des fixtures de test initiales),
deux limites ont été trouvées et corrigées :

1. **Colonnes multiples** — `extractTableFirstColumn` scannait à l'origine tous les `<td>` d'un
   fragment sans distinguer les lignes (`<tr>`), ce qui laissait fuiter les colonnes "Type"
   (`Général`, `Technique`, `Normal`, `Mixte`) comme si c'étaient des noms d'établissement dès
   qu'elles dépassaient `minCellLength`. Corrigé : extraction par ligne, une seule cellule ciblée
   par `<tr>`.
2. **Ordre de colonne non uniforme** — la page `mfoundi-catholiques` place le nom en colonne 2
   ("Type d'enseignement | **Nom de l'établissement** | Localisation | Date"), contrairement aux
   autres pages où il est en colonne 1. Ajout du paramètre `nameColumnIndex` — l'appelant doit
   vérifier la ligne d'en-tête réelle avant de le fixer, jamais le supposer par analogie avec une
   autre page du même site.
3. **En-têtes non uniformes entre sections d'une même page** — sur `mfoundi-publics`, 6 des 7
   sections arrondissement disent "Etablissement"/"Établissement", une dit "Nom de
   l'Etablissement" — ajouté aux deux variantes dans `ignoreCellText` de l'appelant.
4. **Faute de frappe dans un titre de section** — le titre de la section Douala VI est
   "**Arronndissement** de Douala 6ème" (double n) dans le HTML source, pas "Arrondissement".
   Un `headingMatch` trop strict (`/Arrondissement/`) aurait silencieusement exclu toute la
   section (12 établissements). Détecté par le garde-fou fail-closed du framework lui-même
   (la preuve d'épuisement "6/6 arrondissements trouvés" échouait) avant toute promotion possible
   — corrigé en élargissant le motif (`/Douala\s*\d/`), jamais en assouplissant la vérification de
   complétude.

Ces quatre cas confirment la valeur du framework : chacun aurait produit une extraction
silencieusement incomplète ou polluée avec l'ancienne approche par résumé IA, et chacun a été
détecté par une vérification déterministe avant tout import staging.

## Extraction gate — obligatoire avant staging

Aucun batch ne peut atteindre `establishment_import_staging` si :

- le manifest d'extraction (`ExtractionResult`) est absent ;
- `extraction_status` n'est pas `PASS` ou `PASS_WITH_EXPLAINED_EXCLUSIONS` ;
- le parser n'est pas identifié (`parserVersion` vide) ;
- la source brute n'est pas traçable quand c'est pertinent (pas de snapshot pour une source
  HTML/liste) ;
- la complétude n'est pas démontrée (`safeForStaging: false`).

Voir `requireExtractionSafe()` dans `completeness.ts` — lève une exception plutôt qu'un "best
effort" silencieux. Intégré au runbook de production, voir `IMPORT_RUNBOOK.md`.

## Suite de tests de référence

`npx tsx --test scripts/school-registry/lib/extraction/__tests__/extraction.test.ts` — 19 tests,
19 PASS au moment de la clôture de ce sprint (SPRINT R.2-SAFETY-CLOSE). Toute modification du
framework doit conserver ces tests verts, en particulier `§52` (régression Yaoundé, ~231 lignes)
et `§60` (l'IA ne peut jamais outrepasser le verdict déterministe).
