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

---

## V1 launch closure

SPRINT R.4, 2026-08-19. Opérateur : jean-merlain. Clôture produit du
chantier MINESEC + Major Cities V1 pour permettre l'ouverture de
REGISTRY-MULTI-A (MINESUP/MINEFOP/MINSANTE/Transport). Décision produit
approuvée en amont de ce sprint (voir prompt SPRINT R.4) :

```
MINESEC V1:        CLOSED FOR V1
MINESEC V1.2:       DEFERRED
Major Cities V1:    CLOSED WITH DEFERRED REVIEW
Cartescolaire:      OFFICIAL CORROBORATION / FUTURE EXTENSION SOURCE
```

**DEFERRED ≠ REJECTED.** Rien n'a été supprimé, rien n'a été forcé pour
atteindre artificiellement 100 % de couverture. Les populations ci-dessous
restent en base, en attente d'une décision humaine future, exactement dans
l'état où R.3/R.3.1/R.3.2 les ont laissées.

### Major Cities V1 — état à la clôture

Population initiale du pilote Douala/Yaoundé/Kumba/Bertoua : 310 candidats
(`establishment_import_staging.source_ministry = 'OTHER'`).

| Statut | Lignes |
|---|---|
| **Promus en production** (SPRINT R.3.2, corroboration officielle cartescolaire.cm/MINESEC — 1 OFFICIAL_EXACT + 160 OFFICIAL_STRONG) | 161 |
| **Différés — duplicate review** (90 originaux SPRINT R.3 + 42 trouvés pendant la revalidation R.3.1) | 132 |
| **Différés — official corroborated review** (signal cartescolaire présent mais ambigu/conflit géographique, jamais auto-promu) | 10 |
| **Différés — source review / non corroboré** (aucun signal cartescolaire trouvé) | 6 |
| **Différés — already live** (doublon confirmé d'un établissement déjà en production) | 1 |
| **Total différé (`status = 'ready'`, aucune action)** | **149** |
| **Total batch** | **310** |

Snapshot figé : `reports/registry/major-cities-v1-deferred-review.json` —
un enregistrement par candidat différé (staging_id, nom, ville, région,
statut courant, classe de revue, raison, source de découverte,
correspondance cartescolaire éventuelle, signal de doublon, action future
recommandée). Aucun matricule cartescolaire n'a été copié dans
`official_id` pour ces 149 lignes — elles ne sont pas promues.

### MINESEC V1.2 — backlog figé, non importé

SPRINT MINESEC V1.1 a produit un dataset cartescolaire.cm complet
(5307 matricules uniques, portail officiel MINESEC), classifié à titre
préparatoire :

| Classification | Lignes |
|---|---|
| MINESEC_V1_ALREADY_KNOWN (déjà dans MINESEC V1 par correspondance de nom) | 413 |
| MINESEC_NEW_OFFICIAL (matricule officiel non présent dans MINESEC V1) | 1640 |
| MINESEC_CATEGORY_EXTENSION (ESTP/ENI/cours du soir — hors périmètre ESG de V1) | 913 |
| REVIEW_REQUIRED (correspondance fuzzy, ambiguë) | 2341 |
| **Total cartescolaire** | **5307** |

**IMPORTANT** : ces catégories décrivent une classification préparatoire,
**pas** une liste d'établissements autorisés à entrer en production. Aucune
de ces 5307 lignes n'a été importée en staging pendant R.4 (ni pendant
aucun sprint précédent). Le dataset reste conservé tel quel pour un futur
sprint **MINESEC V1.2 — Controlled Completeness Import**, non planifié à ce
jour :

- `data/registry/normalized/cartescolaire-v1/cartescolaire-national-v1.json`
- `data/registry/raw/cartescolaire-v1/` (snapshot brut + SHA256)
- `reports/registry/cartescolaire-vs-minesec-v1.csv`
- `reports/registry/cartescolaire-by-region.csv`
- `reports/registry/cartescolaire-by-type.csv`
- `reports/registry/cartescolaire-major-cities-corroboration.csv`
- `reports/registry/cartescolaire-future-classification-snapshot.json`

### Règle d'identité multi-registre (découverte via cartescolaire)

MINESEC V1.1 a démontré que MINESEC opère (au moins) deux espaces de
matricules structurellement incompatibles — le format ESG à 17 caractères
de MINESEC V1 (`5EM1GSFD112245109`) et le format cartescolaire (préfixe
région à 2 lettres ou préfixe numérique non décodé, ex. `AD08270B01`,
`10030001`) — sans recouvrement direct d'identifiant, uniquement une
corroboration par nom/géographie.

**Conséquence pour l'architecture** : ne plus supposer que
`establishments.official_id` est un identifiant universel à colonne
unique. Un même établissement peut légitimement posséder plusieurs
identifiants officiels provenant de plusieurs registres/systèmes distincts
(MINESEC ESG, cartescolaire, et potentiellement MINESUP/MINEFOP/MINSANTE/
Transport à l'avenir, chacun avec son propre schéma d'identifiant).

Recommandation (AUDIT SEULEMENT — voir §7 ci-dessous et
`docs/03_DATA_REGISTRY/NATIONAL_REGISTRY_ARCHITECTURE.md` pour le détail) :
évaluer un modèle `establishment_registry_identifiers` (une ligne par
identifiant, pas une colonne par registre) avant l'ouverture de
REGISTRY-MULTI-A. **Aucune migration créée ni exécutée pour cette
recommandation** — décision architecture à valider par l'équipe avant
MINESUP.

### Prêt pour REGISTRY-MULTI-A

Le registre actuel (2151 établissements live, 149 candidats Major Cities
différés documentés et non bloquants, backlog cartescolaire préservé) est
considéré suffisamment consolidé pour ouvrir REGISTRY-MULTI-A
(MINESUP/MINEFOP/MINSANTE/Transport) — décision produit, pas une affirmation
que tout est résolu. Les 149 différés et le backlog cartescolaire restent
des chantiers ouverts pour une décision humaine future, sans bloquer le
lancement des nouveaux ministères.
