# MINESEC National Registry V1 — Status (CLOSED)

SPRINT R.1, 2026-08-18. Opérateur : jean-merlain. Ce document fige l'état
du registre MINESEC V1 au moment de sa clôture. Toute évolution future
(nouvelle collecte, nouveau lot de promotion, correction de qualité)
devient V1.1 ou un nouveau batch — jamais une modification silencieuse de
ce document ou des snapshots `minesec-national-v1*.json`.

## Source

- **Ministère** : MINESEC (Enseignement Secondaire)
- **Portail** : « Registre National des Établissements — carte scolaire
  numérique », table ESG (Enseignement Secondaire Général),
  `https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr`
- **Périmètre couvert** : ESG uniquement (secondaire général). Les
  répertoires ESTP (technique) et ENI (écoles normales), présents sur la
  même page sous d'autres tables Fabrik, restent hors périmètre —
  reportés à un batch ultérieur si nécessaire.
- **Méthode de collecte** : scraping poli (User-Agent identifié, délais
  entre requêtes) du formulaire de filtre serveur par région, en direct
  (aucune fixture) — voir `scripts/school-registry/sources/minesec.ts` et
  `lib/politeFetch.ts` / `lib/fabrikFilterFetch.ts`.

## Dates de collecte

| Batch | Régions | Date | Sprint |
|---|---|---|---|
| 001 | Centre, Littoral | 2026-08-15/16 | N |
| 002 | Ouest, Adamaoua, Nord, Extrême-Nord | 2026-08-15/16 | O |
| 003 | Sud, Est, Nord-Ouest, Sud-Ouest | 2026-08-18 | Q |

## 10 régions — couverture

Les 10 régions administratives canoniques sont toutes représentées dans le
registre (staging + live) :

Adamaoua, Centre, Est, Extrême-Nord, Littoral, Nord, Nord-Ouest, Ouest,
Sud, Sud-Ouest.

Régions canoniques et normalisation de casse : `src/lib/cameroonRegions.ts`
(`CANONICAL_REGIONS`, `normalizeRegionCasing`).

## Totaux

| Mesure | Valeur |
|---|---|
| Total MINESEC unique (staging) | 1942 |
| Total MINESEC live (`establishments.source_ministry = 'MINESEC'`) | 1938 |
| Établissements totaux (toutes sources) | 1986 |
| Promus (staging `status = 'promoted'`) | 1265 |
| Doublons confirmés (`duplicate_exact`) | 674 |
| Doublons non résolus (`duplicate_review`) | 2 |
| Restant en revue (`ready`) | 1 |

## Couverture matricule officiel (official_id)

**1941/1942** (99,9 %). L'unique ligne sans matricule (CES de DANG-PATOU,
région Est, `official_identifier: null`) a un champ `matricule` vide
**directement dans le HTML brut de la source officielle** — confirmé par
deux lectures indépendantes en direct du site MINESEC (SPRINT R et SPRINT
R.1). Ce n'est pas une erreur de parsing. Aucun matricule n'a été ni ne
sera généré artificiellement. Décision : `BLOCKED_ID_REVIEW` (règle
d'éligibilité du registre : matricule obligatoire pour toute promotion).

## Doublons restants (duplicate_review = 2, non bloquants)

- **Lycée Général Leclerc** (Centre) et **Lycée Bilingue de Yaoundé**
  (Centre) : nom quasi identique + région + catégorie concordants avec une
  fiche live existante, mais **aucune localité disponible d'aucun côté**
  pour corroborer (candidate live n'a que `city = Yaoundé`, ville de plus
  de 2M d'habitants). Politique constante du projet depuis SPRINT P.2C : le
  nom seul n'est jamais une preuve suffisante. Aucune nouvelle donnée ce
  sprint ne permet de trancher — restent `duplicate_review`, décision
  volontairement non forcée. Ne bloquent pas la clôture nationale.

## Limitations de localisation (location quality)

| Statut localité | Lignes |
|---|---|
| VALID | 1647 |
| MISSING | 216 |
| CLEARLY_INVALID | 45 |
| NEEDS_REVIEW | 28 |
| POSSIBLE_REAL_LOCALITY | 6 |

**Politique appliquée (SPRINT R.1 §11)** : une localité manquante ou
suspecte n'invalide jamais l'identité d'un établissement dont le matricule,
le nom, la région et la catégorie sont fiables. `city`/`locality` restent
`NULL` plutôt que de contenir une valeur fabriquée ("Oui", "1", "2e degré"
ne deviennent jamais des localités publiques). 44 candidats ont ainsi été
promus avec une localité `NULL`, `MISSING`, `CLEARLY_INVALID` ou
`NEEDS_REVIEW` — leur identité étant par ailleurs entièrement fiable (voir
`reports/registry/locality-review-reclassification.csv`).

## Normalisation de recherche

`official_name` en base reste **exactement** la valeur de la source — la
donnée n'a jamais été réécrite pour ajouter des accents. La recherche
publique (`/recherche`) compense côté moteur uniquement :
`src/lib/search/normalizeSearchText.ts` — insensible aux accents/casse,
recherche mot-par-mot (ET logique, pas de recherche par phrase entière),
et un alias technique minimal `lycee ↔ lyce` (la source MINESEC tronque
systématiquement "Lycée" en "Lyce" dans le HTML brut — confirmé par
inspection directe, pas une supposition).

## Enrichissement futur (hors V1)

- `department` / `arrondissement` : non résolus à l'échelle des 1942
  lignes (nécessiterait des requêtes supplémentaires par établissement —
  reporté, voir SPRINT R §37).
- Photos : aucune collecte, aucun scraping externe — fallback Écoles237
  standard.
- Les 2 `duplicate_review` et la ligne `BLOCKED_ID_REVIEW` restent ouverts
  pour une revue humaine future, sans bloquer l'usage du registre.
- Une future correction de qualité de données (ex. `department`/
  `arrondissement`, réconciliation approfondie) doit être un nouveau batch
  documenté (V1.1), jamais une modification silencieuse des fichiers
  `minesec-national-v1*.json` de ce document.

## Prochaine étape

Ce document ferme le chantier MINESEC. La prochaine source à envisager
(hors périmètre de ce document) : MINEDUB — non commencée.
