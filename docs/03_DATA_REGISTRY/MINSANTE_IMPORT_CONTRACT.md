# MINSANTE Import Contract

SPRINT MINSANTE-A, 2026-08-20. Opérateur : jean-merlain. Contrat de
collecte pour un futur MINSANTE-B — **PAS exécuté ce sprint**, DISCOVERY
uniquement. S'appuie sur `MULTI_REGISTRY_CONTRACT.md`,
`REGISTRY_EXTRACTION_SAFETY.md` et sur les sources documentées dans
`MINSANTE_SOURCE_CATALOG.md`. Contrairement à MINEFOP-A (source
totalement bloquée, contrat presque entièrement `UNKNOWN`), ce contrat
peut renseigner la plupart des sections avec un niveau de confiance
correct grâce à la Source A (Liste des Écoles Agréées MINSANTE 2025) —
mais AUCUNE section n'autorise une collecte réelle sans un futur sprint
dédié à l'extraction déterministe.

## 1. Authority / Registry

```
authority = MINSANTE   (déjà dans l'enum registry_source_ministry, migration 0006 — CONFIRMÉ en lecture directe ce sprint, aucune migration requise)
registry  = MINSANTE_ECOLES_AGREEES   (PROPOSÉ, pas encore utilisé nulle part dans le code ni la base — nom dérivé directement du titre officiel du document Source A : "LISTE DES ECOLES DE FORMATION DES PERSONNELS MEDICO-SANITAIRES AGREES DU MINSANTE". Le champ `registry` de `establishment_registry_identifiers` est TEXT libre (pas un enum fermé) — aucune migration requise pour utiliser cette valeur le jour où une vraie collecte a lieu. AUCUNE écriture faite ce sprint.)
```

Contrairement à MINEFOP-A où aucun nom de registre n'a été proposé faute
de structure observée, ce sprint dispose d'une source réelle avec un
titre officiel explicite — proposer un nom devient raisonnable, mais
reste une PROPOSITION documentaire, pas une valeur figée en code.

## 2. Entity Model

```
Une LIGNE de la Source A = un nom d'établissement sous un couple (RÉGION, FILIERE).
UNE ÉCOLE PEUT APPARAÎTRE PLUSIEURS FOIS dans le document (une fois par filière qu'elle propose) —
confirmé directement (ex. "INSTITUT PANAFRICAIN DE PSYCHOMOTRICITE..." apparaît sous sa propre
filière ; plusieurs grandes écoles de Yaoundé/Douala apparaissent sous Analyses Médicales ET
Infirmiers). Le modèle Écoles237 (une ligne = un établissement) reste VALIDE, mais un futur
extracteur DOIT dédoublonner par nom+région AVANT tout staging — sinon un même établissement
génèrerait jusqu'à 10 lignes staging distinctes (une par filière), ce qui casserait à la fois le
compte et le matching. Ceci est un GAP RÉEL IDENTIFIÉ ce sprint (pas hypothétique comme en
MINEFOP-A) : le futur pipeline devra traiter la FILIÈRE comme un ATTRIBUT de l'établissement
(liste de filières proposées), jamais comme une clé de duplication de fiche.
```

**Can current establishments model represent MINSANTE : OUI, avec un
dédoublonnage explicite école×filière→école en amont du staging.**
`raw_data` (jsonb, déjà présent côté staging) peut absorber la liste des
filières proposées sans migration.

## 3. Official Identifier Strategy

```
IDENTIFIER NAME (établissements PUBLICS) : numéro de DÉCRET PRÉSIDENTIEL de création — Article 3
  du Décret n°80/198 du 9 juin 1980 (Source C) : "Les établissements et centres de formation des
  personnels sanitaires créés par décret du Président de la République, sont placés sous
  l'autorité du Ministre chargé de la Santé publique." AUCUN exemple réel de ce numéro n'a été
  observé ce sprint (le Décret 80/198 est le texte-cadre, pas un exemple de décret de création
  individuel) — format INCONNU en pratique, à confirmer sur un échantillon réel avant de coder un
  `identifier_type`.
IDENTIFIER NAME (établissements PRIVÉS) : probablement un arrêté ministériel d'autorisation de
  création + un arrêté distinct d'ouverture (par analogie avec la procédure "Formation Sanitaire
  privée" trouvée en Source D — MAIS cette procédure précise concerne les structures de SOINS,
  PAS les écoles ; l'existence d'une procédure équivalente et distincte pour les ÉCOLES privées est
  PROBABLE (cohérente avec le principe général du Décret 80/198) mais NON CONFIRMÉE par un document
  spécifique aux écoles trouvé ce sprint. Piste explicite pour MINSANTE-B : chercher "arrêté portant
  autorisation d'ouverture" + nom d'une école privée précise de la Source A, par analogie avec la
  méthode qui a fonctionné pour retrouver le pattern d'identifiant MINEFOP en MINEFOP-A.1.
FORMAT :               INCONNU dans les deux cas — AUCUN identifiant individuel observé dans la
  Source A elle-même (elle ne liste que des noms, pas de matricule/numéro d'arrêté).
UNIQUENESS :            INCONNU.
STABLE OVER TIME :      Probable pour le numéro d'acte lui-même (acte administratif daté), mais le
  statut "agréé" associé peut changer d'une édition à l'autre du document Source A (l'édition 2025
  peut différer de futures éditions — pas de preuve de stabilité inter-édition observée, un seul
  millésime consulté ce sprint).
```

**Décision : aucun `identifier_type` figé ce sprint** — même prudence
que MINEFOP-A/MINESUP-A avant observation d'un échantillon réel
d'identifiant. Le modèle `establishment_registry_identifiers`
(`authority`/`registry`/`identifier`/`identifier_type` nullable) reste
structurellement compatible pour accueillir ces deux types d'actes
(`CREATION_ORDER` public vs privé) séparément le jour où ils sont
observés, sur le même schéma qui a déjà servi pour MINESUP-B.1
(`CREATION_ORDER` / `OPENING_AUTHORIZATION` distincts sur la même
institution).

## 4. Category Mapping — MINSANTE TAXONOMY GAP ANALYSIS

```
registry_education_family : 'health_training' — DÉJÀ PRÉSENT dans l'enum (scripts/school-registry/types.ts, ligne 24 ; migration 0006), CONFIRMÉ ce sprint par lecture directe du code. AUCUNE migration requise.
main_category (établissements, produit)      : 'autres' — sous-catégorie "Santé" DÉJÀ PRÉSENTE dans src/lib/categories.ts (ligne 48). AUCUNE migration requise pour un mapping minimal.
```

| Type source (vocabulaire officiel Décret 80/198 + Source A) | `education_family` | `main_category`/`sub_category` produit | Migration needed? |
|---|---|---|---|
| École d'infirmiers (Cycle B) | `health_training` | `autres` / "Santé" | NON |
| École d'infirmiers adjoints / agents techniques médico-sanitaires (Cycle C) | `health_training` | `autres` / "Santé" | NON |
| Centre de formation d'aides-soignants (Cycle D) | `health_training` | `autres` / "Santé" | NON |
| École de sages-femmes/maïeuticiens | `health_training` | `autres` / "Santé" | NON |
| Institut/École supérieure des sciences de la santé (filières type Analyses Médicales, Imagerie Médicale...) | `health_training` | `autres` / "Santé" (ou `superieur` selon niveau réel — GAP, voir ci-dessous) | À TRANCHER |

**GAP RÉEL IDENTIFIÉ (contrairement à MINEFOP-A qui n'en trouvait
aucun)** : plusieurs noms de la Source A portent explicitement "INSTITUT
SUPÉRIEUR" (ex. "INSTITUT SUPERIEUR DES SCIENCES DE LA SANTE ABBOU DE
NGAOUNDERE", "INSTITUT SUPERIEUR DE TECHNOLOGIE APPLIQUEE DE GESTION
(ISTAG) DE YAOUNDE" apparaissant sous une filière santé) — ces
établissements ressemblent structurellement aux entrées `main_category
= 'superieur'` déjà en production (ex. "Institut Supérieur du Personnel
Médico-Sanitaire (ISPM)", trouvé en base avec `main_category=
'superieur'`, PAS `'autres'`/"Santé"). **Il existe donc une ambiguïté de
mapping non résolue** : certaines écoles agréées MINSANTE relèvent
probablement de `main_category='superieur'` plutôt que `'autres'`/"Santé"
selon leur niveau réel — à trancher au cas par cas lors d'un futur
MINSANTE-B, PAS par une règle automatique sur la seule présence du mot
"Institut Supérieur" dans le nom (risque de faux négatif/positif
symétrique à celui documenté §23).

**Conclusion : MIGRATION REQUIRED BEFORE PILOT = NON** au niveau schéma
(les deux familles/catégories existent déjà) — mais une **règle de
mapping main_category/sub_category plus fine que MINEFOP** devra être
écrite avant tout pilote réel, car MINSANTE contient un mélange
secondaire/supérieur que MINEFOP (`autres` uniforme) n'avait pas.

## 5. Geography Mapping

```
Source A fournit RÉGION explicitement pour chaque ligne (10/10 régions confirmées présentes).
VILLE/LOCALITÉ : présente dans le NOM de l'établissement lui-même ("... DE YAOUNDE", "... DE
  NGAOUNDERE") pour la quasi-totalité des entrées observées, PAS dans un champ structuré séparé —
  un futur extracteur devra PARSER la ville depuis la fin du nom (motif "DE <VILLE>" observé de
  façon quasi systématique), avec le risque connu de ce type de parsing (villes composées,
  quartiers vs villes, ex. "DE MBOUO BANDJOUN", "D'EBOLMEDZOM-NKOABANG" — noms composés/quartiers
  qui ne sont pas des villes officielles au sens de cameroonRegions.ts, à traiter au cas par cas,
  NULL acceptable plutôt qu'une déduction incertaine).
Département/arrondissement : ABSENTS de la Source A — NULL acceptable par défaut (§17 : ne jamais
  inventer).
Réutiliser normalizeRegionCasing()/cameroonRegions.ts existants sans modification — les 10 noms de
  région observés dans la Source A (ADAMAOUA, CENTRE, EST, EXTREME-NORD/EXTREME NORD [orthographe
  incohérente observée — avec et sans tiret selon la page], LITTORAL, NORD, NORD-OUEST, OUEST, SUD,
  SUD-OUEST) sont cohérents avec le référentiel déjà utilisé par MINESEC/MINESUP/Major Cities,
  MODULO la normalisation habituelle de la casse et du tiret déjà gérée par normalizeRegionCasing().
```

## 6. Completeness Proof Strategy

```
COMPLETENESS_PROOF = EXPECTED_COUNT_UNKNOWN pour la Source A (voir catalogue §COMPLETENESS) — pas
de total explicite dans le document lui-même. Preuve d'exhaustivité disponible SEULEMENT au niveau
structurel faible : "10/10 filières officielles avec en-tête FILIERE: présentes, 11/11 pages du PDF
lues intégralement" — signal raisonnable, PAS une preuve stricte au sens `REGISTRY_EXTRACTION_
SAFETY.md` (qui exige un compteur source explicite ou une preuve d'épuisement de pagination/table).
Le chiffre "69 écoles (MINSANTE 2010)" (Source G du catalogue) NE DOIT JAMAIS servir d'expected_count
actuel : 16 ans d'écart, source secondaire (OMS/AFRO citant MINSANTE, pas MINSANTE directement), et
la Source A (2025) suggère déjà un ordre de grandeur nettement supérieur (~100-150 établissements
uniques estimés grossièrement, PAS un chiffre final).
Toute future collecte MINSANTE devra soit (a) trouver un total explicite ailleurs sur le portail
examen-national-special-minsante.cm ou minsante.cm (non trouvé ce sprint), soit (b) accepter un
statut `MANUAL_REVIEW_REQUIRED`/`PASS_WITH_EXPLAINED_EXCLUSIONS` documenté page par page (11 pages,
comptage déterministe ligne par ligne comme fait ce sprint) plutôt qu'un PASS silencieux.
```

## 7. Raw Snapshot Strategy

```
source_url        = URL exacte du PDF Source A (et de chaque PDF filière de la Source B si jamais utilisée pour corroboration, jamais pour extraction candidat)
fetched_at         = horodatage de la requête
content_type       = application/pdf — donc un extracteur PDF est nécessaire, PAS seulement HTML comme MINESEC/MINESUP (MINEFOP-A avait déjà anticipé ce besoin sans jamais l'exécuter ; MINSANTE-A est le premier sprint à confirmer concrètement que `pdftotext -layout` fonctionne correctement sur ce type de document gouvernemental camerounais — texte natif, pas de scan)
SHA256             = writeSourceSnapshot() existant, réutilisable tel quel (SHA256 déjà calculé ce sprint pour la Source A, voir catalogue)
parser_version      = à définir lors de l'écriture d'un futur collecteur PDF réel (nouveau : `scripts/school-registry/lib/extraction/` n'a aujourd'hui que des utilitaires HTML — extractTableFirstColumn/extractSelectOptions/segmentByHeading — un utilitaire équivalent pour texte PDF segmenté par en-têtes RÉGION/FILIERE serait un développement réel nécessaire avant MINSANTE-B, PAS juste une adaptation)
expected_count      = UNKNOWN (§6)
completeness_status  = MANUAL_REVIEW_REQUIRED par défaut
```

## 8. PII / Data Minimization Policy — SPÉCIFIQUE MINSANTE, RISQUE RÉEL CONFIRMÉ (pas hypothétique)

```
Contrairement à MINEFOP/MINESUP où le risque PII était surtout théorique, ce sprint a DIRECTEMENT
observé des centaines de couples (matricule de concours, nom complet de candidat) dans la Source B
(résultats de concours par filière). AUCUNE valeur candidat n'a été extraite, copiée dans un
fichier, ni committée — seuls les en-têtes institutionnels (nom d'école, région) ont été lus et
notés dans le catalogue. Le PDF source (igeo2020.pdf, téléchargé pour inspection technique) a été
supprimé de l'environnement de session temporaire, jamais copié dans le dépôt.
RÈGLE FERME POUR MINSANTE-B : si la Source B est un jour utilisée pour extraire des noms d'écoles
(corroboration géographique/filière), l'extracteur DOIT ignorer structurellement toute ligne
correspondant au motif "N° MATRICULE NOMS ET PRENOMS" et tout ce qui suit jusqu'au prochain en-tête
"Région:"/nom d'école — avec un test de non-régression dédié vérifiant qu'AUCUNE chaîne ressemblant
à un nom de candidat (regex approximative : ligne commençant par un nombre suivi d'un matricule
"20XXX-NNNN") n'atteint jamais `raw_data` ou tout autre champ persisté.
La Source A, elle, est structurellement SANS PII (confirmé par recherche de motifs) — c'est la
source à privilégier précisément pour cette raison en plus de sa qualité institutionnelle.
```

## 9. Staging Contract

`STAGING COMPATIBLE : YES` (même conclusion structurelle que
MINESEC/MINESUP/MINEFOP, revérifiée) :

- `education_family = 'health_training'` — déjà présent, aucune migration.
- `official_identifier` (staging, texte libre) — prêt à accueillir un futur numéro de décret/arrêté MINSANTE, format encore inconnu (§3).
- `raw_data` (jsonb) — peut absorber la liste des filières proposées par école (résolution du gap de dédoublonnage §2) sans migration de schéma.
- `region`/`city` — suffisants ; `city` nécessitera un parsing dédié depuis le nom (§5), pas un champ déjà structuré côté source.

**Gap réel à combler avant tout pilote (pas seulement théorique)** :
absence d'un utilitaire d'extraction PDF texte segmenté par en-têtes
répétés (Région > École, avec gestion du cas "une école apparaît sous
plusieurs filières") dans `scripts/school-registry/lib/extraction/` —
développement réel nécessaire, pas une simple réutilisation de
l'existant HTML.

## 10. Review Rules

Reprendre la matrice de déduplication inter-ministères
(`MULTI_REGISTRY_CONTRACT.md` §5). Risque de doublon confirmé réel avec
au moins 3 établissements déjà en production portant un vocabulaire
santé (`Institut Supérieur de Santé`, `Institut Supérieur du Personnel
Médico-Sanitaire (ISPM)`, `ST Jude's Higher Institute of Nursing and
Biomedical`) — testés ce sprint contre le moteur de matching partagé
avec des candidats synthétiques dérivés de vrais noms de la Source A
(§ Matching ci-dessous, aucune fusion automatique observée).
**Règle spécifique MINSANTE (§10 Source H du catalogue)** : un
établissement déjà lié à un registre MINESUP (`MINESUP_IPES`) ne doit
JAMAIS être considéré automatiquement comme équivalent à une entrée
MINSANTE — les deux autorités opèrent des régimes d'agrément distincts
et, selon la presse (Source H), potentiellement CONTRADICTOIRES pour
certaines filières santé proposées par des IPES sans agrément MINSANTE.
Toujours créer un `establishment_registry_identifiers` DISTINCT par
autorité sur la même fiche établissement si un lien réel est confirmé,
jamais fusionner les deux registres en un seul enregistrement.

## 11. Matching Rules — TEST RÉEL AVEC CANDIDATS SYNTHÉTIQUES (§20/§23)

Le moteur partagé (`scripts/school-registry/lib/matching/engine.ts`) a
été testé ce sprint avec 5 candidats **synthétiques** (noms réels tirés
de la Source A, aucune donnée candidat/PII utilisée) contre les 3
établissements santé actuellement en production (`Institut Supérieur de
Santé`, `Institut Supérieur du Personnel Médico-Sanitaire (ISPM)`, `ST
Jude's Higher Institute of Nursing and Biomedical`) :

| Candidat synthétique | Résultat | safeForAutoLink |
|---|---|---|
| "Institut Panafricain de Psychomotricité et Relaxation de Douala" | NO_MATCH | false |
| "Ecole des Sciences de la Santé de Ndikinimeki" | NO_MATCH | false |
| "Institut Supérieur des Sciences de la Santé de Zalom-Mfou" | NO_MATCH | false |
| "Institut Supérieur de Santé" (collision de nom exact délibérée) | EXACT_IDENTITY, géographie cohérente | false |
| "Centre de Formation des Sciences de la Santé de la Croix Rouge Camerounaise" | NO_MATCH | false |

**Aucun faux positif dangereux observé** sur cet échantillon (jamais de
fusion automatique, `safeForAutoLink` toujours `false` même sur la
collision de nom exact — cohérent avec la règle absolue FUZZY MATCH !=
IDENTITY PROOF). **Gap latent identifié mais NON DÉMONTRÉ comme
problème réel ce sprint** (contrairement à MINEFOP où le problème était
prouvé) : `FUZZY_STOPWORDS`
(`scripts/school-registry/lib/matching/engine.ts`) ne contient toujours
aucun vocabulaire santé générique ("santé", "sanitaire", "médico",
"formation", "centre") ni vocationnel (déjà noté MINEFOP-A, toujours
absent). Sur cet échantillon de 3 cibles live seulement, aucune
ambiguïté n'a été produite — mais le risque théorique reste identique à
celui documenté en MINEFOP-A : à réévaluer avec un échantillon plus
large de candidats réels lors d'un futur MINSANTE-B, avant de considérer
le volume de résultats `AMBIGUOUS`/`PROBABLE_MATCH` comme fiable à
l'échelle nationale. Non corrigé ce sprint (DISCOVERY read-only, pas un
sprint de code).

## 12. Future Promotion Prerequisites

Avant toute collecte MINSANTE réelle (hors périmètre de ce sprint) :

1. Développer un extracteur PDF texte déterministe pour la structure Région>Filière>École de la Source A, AVEC dédoublonnage école×filière→école (§2, §9) et un manifest de complétude conforme à `REGISTRY_EXTRACTION_SAFETY.md`.
2. Résoudre le gap de mapping `main_category`/`sub_category` "santé secondaire vs santé supérieure" (§4) — probablement au cas par cas, jamais par règle automatique sur le seul mot "Institut Supérieur".
3. Retrouver au moins un exemple réel d'identifiant officiel (décret présidentiel pour le public, arrêté pour le privé) pour proposer un `identifier_type` fondé (§3) — actuellement zéro exemple observé, contrairement au pattern d'agrément MINEFOP qui avait 5 exemples indépendants.
4. Écrire un test de non-régression PII dédié garantissant qu'aucune ligne candidat (Source B) n'atteint jamais un champ persisté, si la Source B est utilisée pour corroboration (§8).
5. Étendre `FUZZY_STOPWORDS` avec le vocabulaire santé générique si un échantillon réel plus large démontre le même problème que MINEFOP (§11) — pas préventif tant que non démontré.
6. Décider explicitement du nom final du `registry` (`MINSANTE_ECOLES_AGREEES` proposé ici, à confirmer) une fois un premier extracteur réel testé.
7. Tenter de retrouver un lien de navigation direct depuis minsante.cm vers examen-national-special-minsante.cm/la Source A, pour renforcer la classification TIER 1 sans réserve (actuellement TIER 1 proposé AVEC réserve de découvrabilité, voir catalogue).
8. Pilote limité à une seule région avant toute collecte nationale — même politique que tous les registres précédents.

## 13. MINSANTE V1 Acceptance Criteria

```
[x] Compatibilité schéma (education_family='health_training', main_category='autres'/"Santé") confirmée sans migration.
[x] Accès fonctionnel à une source MINSANTE primaire structurée — RÉSOLU ce sprint (Source A), contrairement à MINEFOP toujours bloqué.
[x] Au moins un échantillon réel de fiches MINSANTE observé (330 lignes école×filière, ~100-150 établissements uniques estimés) — RÉSOLU.
[ ] Format/unicité d'un identifiant officiel MINSANTE vérifié sur un échantillon représentatif — INCONNU, zéro exemple observé (contrairement au pattern MINEFOP qui avait 5 exemples).
[ ] Preuve d'exhaustivité stricte (compteur source explicite ou pagination épuisée) — actuellement signal structurel faible seulement (10/10 filières, 11/11 pages), pas un compteur explicite.
[ ] Extracteur PDF texte déterministe développé + testé (structure Région>Filière>École, dédoublonnage) — NON FAIT ce sprint (DISCOVERY seulement).
[ ] Gap de mapping santé secondaire/supérieure résolu — NON FAIT.
[ ] FUZZY_STOPWORDS réévalué sur échantillon réel plus large — NON FAIT, pas nécessaire tant que non démontré.
[ ] Nom de registre confirmé (`MINSANTE_ECOLES_AGREEES` proposé) — PROPOSÉ, pas confirmé par un usage réel.
[ ] PII exclue à 100% — politique appliquée et testée manuellement ce sprint (Source B), test automatisé dédié à écrire avant tout usage réel de la Source B.
[ ] Dry-run staging propre (0 écriture) avant toute collecte réelle — NON FAIT (pas nécessaire ce sprint, aucune extraction tentée).
[ ] Pilote limité à une seule région avant toute collecte nationale.
```

## MISE À JOUR SPRINT MINSANTE-A.1 (2026-08-20)

Toujours READ-ONLY — aucune écriture staging/establishments/registry
identifiers ce sprint, aucune promotion, aucune migration. Détail complet :
`reports/registry/minsante-a1-source-corroboration.json`,
`data/registry/normalized/minsante-a1-*.json`,
`reports/registry/minsante-a1-*.csv`.

### A.1.1 — Source authority

`SOURCE_AUTHORITY` mis à jour : **`PROBABLE_TIER_1`** (voir catalogue,
§MISE À JOUR ci-dessus, pour le détail des deux preuves indépendantes
nouvelles : sous-domaine DNS `concours.minsante.cm` + DECISION MINSANTE
"Reports de Scolarité 2023" listant 12/14 écoles-témoins identiques à la
Source A).

### A.1.2 — Contrat du parseur PDF (§12.1 de la version précédente, RÉSOLU)

```
Module :          scripts/school-registry/lib/extraction/pdfMinsanteA1.ts
parser_version :   minsante-a1-pdf-text@1
Input :            texte pdftotext -layout (data/registry/raw/minsante-a1/liste-ecoles-agrees-minsante-2025.txt)
Vocabulaire :       10 filières officielles connues (OFFICIAL_PROGRAMS) — toute filière hors de cette liste = FAIL-CLOSED (throw), jamais acceptée silencieusement
Détection région :  redémarrage de numérotation ("1.") = nouvelle région ; étiquette région (ligne autonome OU préfixe avant "N.") appariée 1:1 en ordre document. Désaccord de compte = STRUCTURE_ANOMALY pour cette filière, jamais une région devinée
Continuation :      lignes de nom d'école repliées sur 2 lignes rejointes (avec/sans tiret de fin de ligne)
FAIL-CLOSED réel :  throw si texte vide, page manquante dans la séquence déclarée, aucun en-tête FILIERE, filière inconnue, ou 0 ligne extraite au total. Jamais `catch { return [] }` (audit du fichier confirmé)
```

**Résultat réel sur le document 2025 (revérifié SHA256 identique)** :

| Filière | Statut | Lignes | Anomalie |
|---|---|---|---|
| Analyses Médicales | PARSED | 82 | — |
| Imagerie Médicale | STRUCTURE_ANOMALY | 0 (quarantaine) | 0 redémarrage détecté — filière rendue sans numérotation dans ce document, jamais vue par le grep MINSANTE-A |
| Infirmiers | PARSED | 121 | — |
| Kinésithérapie | STRUCTURE_ANOMALY | 0 (quarantaine) | 9 redémarrages vs 7 étiquettes région |
| Odontostomatologie | PARSED | 23 | — |
| Optique Réfraction | PARSED | 4 | — |
| Prothèse Dentaire | PARSED | 6 | — |
| Sages-femmes/Maïeuticiens | PARSED | 57 | — |
| Sciences Pharmaceutiques | STRUCTURE_ANOMALY | 0 (quarantaine) | 8 redémarrages vs 6 étiquettes région |
| Psychomotricité et Relaxation | STRUCTURE_ANOMALY | 0 (quarantaine) | 3 redémarrages vs 2 étiquettes région |
| **Total fiable** | **6/10 PARSED** | **293** | 4/10 filières exclues, comptées et catégorisées (jamais silencieuses) |

Verdict `evaluateCompleteness()` (framework partagé, inchangé) :
**`SOURCE_STRUCTURE_CHANGED`**, `safeForStaging: false` — cohérent et
attendu (§17 : aucune écriture staging ce sprint de toute façon). Ce statut
signifie : le SOUS-ENSEMBLE de 293 lignes/6 filières est extrait de façon
fiable et vérifiable, mais le DOCUMENT COMPLET n'est pas encore sûr pour un
staging automatique tant que les 4 filières en anomalie n'ont pas été
retraitées (piste probable pour MINSANTE-B : re-extraction depuis le PDF
natif avec une bibliothèque consciente des coordonnées de caractères plutôt
que `pdftotext -layout`, qui perd l'alignement colonne région/école sur ces
4 sections précises).

19 tests de non-régression : `lib/extraction/__tests__/pdfMinsanteA1.test.ts`
(19/19 PASS), couvrant l'extraction réelle, le PII, le fail-closed
(document vide, page manquante, filière inconnue, 0 ligne, désaccord
région) et la jointure de noms coupés sur 2 lignes.

### A.1.3 — Modèle école×filière → établissement unique (§8-9, RÉSOLU)

```
Module :  scripts/school-registry/lib/extraction/minsanteDedup.ts
```

Fusion automatique **UNIQUEMENT** sur `(région, exactIdentityKey(nom))` —
réutilise `exactIdentityKey` du moteur de matching partagé (accents/casse
retirés, mots de catégorie PRÉSERVÉS, jamais un fuzzy). Résultat sur les
293 lignes fiables : **169 établissements uniques**, 124 lignes fusionnées
par la règle exacte, **79/169 établissements multi-filières** (jusqu'à
plusieurs filières par école, conforme au modèle attendu §2).

Classification des paires restantes (jamais fusionnées automatiquement,
§9) : `EXACT_SAME_SCHOOL` (fusion), `LIKELY_SAME_SCHOOL` (11 paires
détectées — chevauchement de mots ≥80%, signalées pour revue humaine, PAS
fusionnées), `AMBIGUOUS` (203 paires — chevauchement partiel 34-79%, OU
même nom exact mais région différente, signalées, PAS résolues
automatiquement), `DISTINCT` (aucun rapport généré, cas majoritaire, pas de
bruit). 7 tests de non-régression :
`lib/extraction/__tests__/minsanteDedup.test.ts` (7/7 PASS).

Rapport de revue complet : `reports/registry/minsante-a1-dedup-review.csv`.

### A.1.4 — Matching sample (§14, TEST RÉEL — le gap latent §11 est maintenant CONFIRMÉ)

20 établissements uniques échantillonnés (2 par région, priorisés sur la
densité de vocabulaire santé générique — école/formation/santé/sanitaire/
centre/medical/personnel) testés en lecture seule contre les **2240**
établissements réels de production (`minsante-a1-matching-sample.ts`,
moteur `lib/matching/engine.ts` INCHANGÉ). Résultat :
**16 AMBIGUOUS, 4 PROBABLE_MATCH, 0 EXACT/STRONG, 0 NO_MATCH,
`safeForAutoLink` jamais `true`** (garantie de sécurité du moteur
confirmée intacte).

**Le gap `FUZZY_STOPWORDS` documenté comme "latent, non démontré" en
MINSANTE-A §11 est maintenant démontré réel sur données de production** :

- "CENTRE DE FORMATION DU PERSONNEL PARAMEDICAL (CFPP) DE YAOUNDE" (école
  santé) → `PROBABLE_MATCH` contre "**Centre de Formation en Couture et
  Mode de Yaoundé**" (école de couture, aucun rapport avec la santé) — 50%
  de chevauchement de mots purement dû à "Centre de Formation ... de
  Yaoundé".
- Deux candidats MINSANTE **différents** (régions Littoral et Ouest) →
  `PROBABLE_MATCH` contre la **même** cible unique "Institut Supérieur du
  Personnel Médico-Sanitaire (ISPM)" (région Centre) — géographie
  contradictoire dans les deux cas, chevauchement dû à "Personnel
  Médico-Sanitaire".
- "...FONDATION EVA POUR LA SANTE A L'EST" (région Est) → `PROBABLE_MATCH`
  contre "Institut Supérieur de Santé" (région Littoral) — géographie
  contradictoire.

Aucun de ces cas n'a produit `safeForAutoLink: true` (aucun risque de
fusion automatique erronée), mais le signal `PROBABLE_MATCH`/`AMBIGUOUS`
est bruité par le vocabulaire générique santé au point de produire des
suggestions cross-catégorie (santé vs couture) et cross-région. **Recommandation pour MINSANTE-B (non exécutée ce sprint, modification du
moteur partagé hors périmètre DISCOVERY)** : étendre `FUZZY_STOPWORDS`
(`lib/matching/engine.ts`) avec au minimum "santé", "sante", "sanitaire",
"medico", "personnel", "personnels", avant tout pilote réel — le §11
précédent listait ce risque comme théorique, il est désormais prouvé sur
20/20 candidats réels. Rapport complet :
`reports/registry/minsante-a1-matching-sample.csv`.

### A.1.5 — Pilote recommandé (§16, affiné)

Volume réel par région post-dédoublonnage (169 établissements uniques sur
les 6 filières fiables, compté directement sur
`minsante-a1-unique-schools.csv`) :

| Région | Établissements uniques (6 filières fiables) |
|---|---|
| Centre | 53 |
| Extrême-Nord | 22 |
| Ouest | 22 |
| Littoral | 17 |
| Est | 11 |
| Adamaoua | 10 |
| Nord | 9 |
| Nord-Ouest | 9 |
| Sud | 9 |
| Sud-Ouest | 7 |

Étant donné la fourchette cible de la spec (20-50 établissements uniques),
le risque de dédup/matching plus élevé que prévu (vocabulaire santé
générique confirmé bruyant, §A.1.4), et le fait que les 4 filières en
anomalie doivent être retraitées avant tout staging national :
**pilote recommandé = région Extrême-Nord OU Ouest (22 établissements
uniques chacune, au centre de la fourchette cible) sur les 6 filières
PARSED uniquement**, PAS Centre (53, au-dessus de la fourchette, et
concentration la plus forte de paires `AMBIGUOUS`/`LIKELY_SAME_SCHOOL`
attendue vu sa densité). Les 4 filières en anomalie structurelle restent
hors périmètre de tout pilote tant qu'elles n'ont pas été retraitées avec
un extracteur PDF plus robuste que `pdftotext -layout` pour ces sections
précises (piste : bibliothèque consciente des coordonnées de caractères,
ex. `pdfjs-dist` en mode texte positionné, pour reconstruire l'alignement
colonne région/école que `-layout` a perdu sur ces 4 sections).

### A.1.6 — PII

`PII persisted = 0`, revérifié ce sprint sur un nouveau document (DECISION
"Reports de Scolarité 2023") en plus de la Source B déjà auditée en
MINSANTE-A : fichier contenant ~20 occurrences du motif MATRICULE lu
uniquement pour compter le chevauchement de noms d'écoles, jamais copié,
supprimé de la session temporaire immédiatement après lecture. Test
automatisé dédié désormais en place :
`lib/extraction/__tests__/pdfMinsanteA1.test.ts` (`describe("PII")`)
vérifie qu'aucune ligne extraite ne correspond à un motif matricule/candidat
ni ne contient "MATRICULE"/"NOMS ET PRENOMS" — item ouvert §13
acceptance criteria (`[ ] test de non-régression PII dédié à écrire`)
maintenant **RÉSOLU**.

### A.1.7 — Acceptance criteria (§13) mis à jour

```
[x] Compatibilité schéma — inchangé, confirmé.
[x] Accès fonctionnel à une source MINSANTE primaire structurée — inchangé.
[x] Échantillon réel observé — affiné : 293 lignes fiables / 169 établissements uniques (6/10 filières), 4/10 filières en quarantaine documentée.
[ ] Format/unicité d'un identifiant officiel — toujours INCONNU, aucun exemple observé ce sprint non plus (hors périmètre corroboration).
[x] Preuve d'exhaustivité — affinée : structurelle et vérifiable pour 6/10 filières (redémarrages=étiquettes région), MANUAL_REVIEW_REQUIRED explicite pour les 4 autres (jamais un PASS forcé).
[x] Extracteur PDF texte déterministe développé + testé — RÉSOLU ce sprint (19 tests).
[ ] Gap de mapping santé secondaire/supérieure résolu — toujours NON FAIT (hors périmètre A.1).
[x] FUZZY_STOPWORDS réévalué sur échantillon réel — RÉSOLU : gap CONFIRMÉ réel (voir A.1.4), extension recommandée mais NON codée ce sprint (modification du moteur partagé hors périmètre DISCOVERY).
[ ] Nom de registre confirmé — toujours PROPOSÉ (`MINSANTE_ECOLES_AGREEES`), pas d'usage réel encore.
[x] PII exclue à 100% — test automatisé désormais en place (A.1.6).
[ ] Dry-run staging propre — toujours NON FAIT (aucune écriture ce sprint, cohérent avec le périmètre).
[ ] Pilote limité à une seule région — scope proposé (A.1.5), NON EXÉCUTÉ.
```

## 14. Décision — SOURCE PRIORITY PLAN

```
NEXT STEP DECISION : E — SECONDARY NOMINATIVE SOURCE FOUND, OFFICIAL CORROBORATION REQUIRED
  (voir justification complète dans le rapport final du sprint). La Source A est nominative,
  structurée, sans PII, et présente un faisceau d'indices d'authenticité MINSANTE fort — mais reste
  classée avec une réserve de découvrabilité (non liée depuis la navigation officielle actuelle de
  minsante.cm) qui empêche une classification TIER 1 sans réserve ce sprint. Elle constitue
  néanmuse la meilleure source jamais trouvée sur l'ensemble des sprints de registre national à ce
  jour (MINESEC/MINESUP/MINEFOP/MINSANTE) en termes de proximité avec un registre nominatif borné
  exploitable.
PILOT STRATEGY (proposée, NON EXÉCUTÉE) : voir §26 du rapport final — un pilote MONO-RÉGION
  (probablement Centre ou Littoral, les deux régions les mieux représentées dans la Source A) sur
  une seule filière (ex. "Infirmiers", la plus large avec institutions publiques ET privées
  clairement identifiables) serait la première étape recommandée d'un futur MINSANTE-B, APRÈS
  développement de l'extracteur PDF déterministe (§12.1).
```

## MISE À JOUR SPRINT MINSANTE-C (2026-08-20) — CATEGORY MODEL RESOLUTION + REVIEW CENTER COMPATIBILITY

Opérateur : jean-merlain. Portée : reclassification de métadonnées (additive)
sur les 22 lignes staging MINSANTE déjà écrites en MINSANTE-B (batch
`minsante-pilot-v1`, région Ouest) + correction du Review Center. **AUCUNE
nouvelle ligne staging, AUCUNE écriture `establishments`/
`establishment_registry_identifiers`, AUCUNE promotion, AUCUNE migration
exécutée.**

### C.1 — Modèle de catégorie retenu : MODEL A

`health_training` (`education_family`, inchangé) se traduit en
`main_category` selon la preuve disponible — **jamais** une règle
automatique sur le seul mot "Institut"/"École" :

```
SUPERIEUR_CONFIRMED -> main_category = 'superieur'
AUTRES_CONFIRMED    -> main_category = 'autres', sub_category = 'Santé'
CATEGORY_REVIEW     -> main_category = NULL (jamais promu tant que non résolu)
```

**Hiérarchie de preuve (déterministe, appliquée dans cet ordre)** :

1. `EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE` — le titre officiel MINSANTE
   contient un mot de niveau explicite (`supérieur(e)`/`universitaire`/
   `université`/`faculté`), auto-déclaré par l'établissement lui-même ->
   `SUPERIEUR_CONFIRMED`. Hérité identique de MINSANTE-B, aucune
   régression.
2. `OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE` — le titre officiel contient lui-
   même une désignation de cycle/diplôme reconnue et non-supérieure (ex.
   "Infirmier(s) Diplômé(s) d'État", diplôme de cycle B au sens du Décret
   80/198) -> `AUTRES_CONFIRMED`. Même standard de preuve que la règle 1
   (auto-déclaration dans le titre officiel), appliqué symétriquement côté
   "autres" — nouveau ce sprint.
3. Corroboration officielle externe **vérifiée directement ce sprint**
   (page institutionnelle officielle récupérée + citation d'un acte
   MINSANTE, identité confirmée par nom/région/commune) -> selon la preuve.
   2 candidats CATEGORY_REVIEW résolus ainsi (§C.3).
4. Aucune preuve suffisante -> `CATEGORY_REVIEW` (défaut). **Le but n'est
   jamais de maximiser `CLEAN_APPROVABLE`** — une population plus petite
   mais correcte est préférée à une catégorie devinée.

**Migration requise : NON.** Les deux valeurs (`superieur`/`autres`)
existent déjà dans `src/lib/categories.ts` (`superieur` : Université/Grande
école/Institut supérieur ; `autres` : sous-catégorie Santé) — aucune
modification de schéma ni de taxonomie produit.

### C.2 — Sub_category

Aucun nouveau `sub_category` créé. "Santé" (déjà présent sous `autres`
dans `src/lib/categories.ts`) suffit à représenter toute formation MINSANTE
non-supérieure. Les filières (Infirmiers, Analyses Médicales…) restent des
attributs (`raw_data.programs_normalized`), jamais une sous-catégorie par
programme (§15 du brief).

### C.3 — Recherche ciblée de corroboration (§9 du brief)

Pour les 9 candidats `CATEGORY_REVIEW` hérités de MINSANTE-B, une
recherche officielle ciblée a été menée (sources : pages institutionnelles
officielles récupérées directement, jamais un annuaire commercial utilisé
seul comme autorité finale). Résultat : **2/9 résolus avec preuve directe
vérifiée**, 7/9 restent `CATEGORY_REVIEW` faute de preuve suffisante
(traçabilité complète par candidat : `reports/registry/minsante-c-category-audit.csv`,
colonne `research_note`).

| Candidat | Décision | Preuve |
|---|---|---|
| Complexe Privé de Formation des Personnels Médico-Sanitaires "Fondation Tsopjio et Takoudjou" de Dschang | `AUTRES_CONFIRMED` | Page officielle (ftt-dschang.cm/a-propos) : création par DECISION N°0344/D/MINSANTE/SG/DRH du 28/04/2010 — acte MINSANTE-DRH (jamais un acte MINESUP d'enseignement supérieur), aucune mention "enseignement supérieur", positionné explicitement comme formation technique/vocationnelle. Corroboré indépendamment par kamerpower.com (même nom exact, même commune). |
| École Privée des Sciences de la Santé Meno de Bamena | `AUTRES_CONFIRMED` | Page officielle (epssmeno.com) : admission explicite "Niveau BEPC"/"Niveau BAC" (entrée pré-bac), filières "Aides soignants-généralistes"/"Techniciens principaux médico-sanitaires" — désignations techniques explicites, aucune mention "enseignement supérieur". |

Les 7 candidats non résolus (COFPSAROMA Baleng, Complexe Mbouo Bandjoun,
Complexe Mbouda, EPS Les Étoiles Bafoussam, École Privée de Formation du
Personnel de la Santé de Bafoussam, IFOPP Foumbot, Institut Tropical
"Moullec" Baleveng) ont chacun une note de recherche documentée (site
identifié mais récupération de page échouée en HTTP 403/DNS/SSL, identité
insuffisamment confirmée pour une piste trouvée sous un autre nom, ou
seulement le mot "Institut" trouvé sans mot de niveau explicite — jamais
suffisant seul, §4).

### C.4 — Frontière inter-ministérielle (§10-12)

Les 22 candidats ont été comparés au registre MINESUP (`establishment_registry_identifiers.authority='MINESUP'`,
`registry='MINESUP_IPES'`, 74 établissements liés) avec le moteur de
matching partagé **inchangé** (`scripts/school-registry/lib/matching/engine.ts`).
Seuil retenu pour cette vérification spécifique : `EXACT_IDENTIFIER`/
`EXACT_IDENTITY` -> `SAME_INSTITUTION_CROSS_MINISTRY` ; `STRONG_MATCH`
(chevauchement ≥66%) -> `AMBIGUOUS` (revue requise) ; en-dessous (y
compris `PROBABLE_MATCH`/`AMBIGUOUS` faible, souvent un simple nom de
ville partagé — "Bafoussam"/"Bafang" — sans rapport réel) -> `DISTINCT`,
publié en transparence dans le rapport (jamais une ligne cachée).

**Résultat : 22/22 `DISTINCT`, 0 `SAME_INSTITUTION_CROSS_MINISTRY`, 0
`AMBIGUOUS`.** Aucun des 22 candidats MINSANTE Ouest ne coïncide avec une
institution MINESUP existante. Rapport complet :
`reports/registry/minsante-c-cross-ministry-review.csv`. Aucune écriture
DB, aucun auto-merge — cohérent avec la règle absolue FUZZY MATCH != IDENTITY
PROOF.

### C.5 — États de revue normalisés (Review Center)

Nouvel adaptateur `registryReviewClassification()` (`src/lib/registryReview.ts`,
§19-20 du brief) — corrige le bug identifié en MINSANTE-B (`classify()` du
Review Center ne comprenait que `raw_data._matchAudit`/`_localityAudit`,
propres à MINESEC ; les lignes MINSANTE s'affichaient toutes comme
"Nouveaux candidats" génériques quel que soit leur vrai état). Design :
chaque ministère fournit un "reader" traduisant sa forme de `raw_data` en
signaux communs ; un seul résolveur partagé décide de l'état normalisé —
`CLEAN_APPROVABLE`/`DUPLICATE_REVIEW`/`CATEGORY_REVIEW`/`SOURCE_REVIEW`/
`IDENTITY_REVIEW`/`IDENTIFIER_COLLISION_REVIEW`/`CROSS_MINISTRY_REVIEW`/
`PROMOTED`/`OTHER_REVIEW`. Tout ministère sans reader dédié (MINESUP
aujourd'hui, tout futur ministère) retombe sur un filet générique basé
uniquement sur la colonne `status` — jamais un if-chain géant par
ministère. 18 tests de non-régression :
`src/lib/__tests__/registryReview.test.ts`.

### C.6 — Éligibilité à la promotion (rappel, §26 du brief — inchangé)

Un candidat MINSANTE ne devient `CLEAN_APPROVABLE` que si : source sûre
(`PROBABLE_TIER_1`, inchangé), PII sûre (0 persistée), identité
d'établissement sûre (aucun signal live/staging), catégorie résolue
(`SUPERIEUR_CONFIRMED`/`AUTRES_CONFIRMED`, jamais devinée),
`DUPLICATE_REVIEW` non déclenché, aucun risque de doublon inter-ministères.
**Aucun identifiant officiel requis** (toujours inconnu pour MINSANTE,
§3). `PROMOTION = NON` ce sprint, quel que soit le nombre de candidats
`CLEAN_APPROVABLE` — la promotion reste un sprint dédié futur
(MINSANTE-D).

### C.7 — Reclassification finale des 22 lignes pilote

```
AVANT (MINSANTE-B) : CLEAN_APPROVABLE=2, CATEGORY_REVIEW=9, DUPLICATE_REVIEW=11
APRÈS (MINSANTE-C) : CLEAN_APPROVABLE=4, CATEGORY_REVIEW=7, DUPLICATE_REVIEW=11, CROSS_MINISTRY_REVIEW=0, OTHER_REVIEW=0
```

**Règle stricte respectée (§17 du brief) : aucune des 11 lignes
`DUPLICATE_REVIEW` n'a été reclassifiée** malgré une catégorie désormais
mieux comprise pour 4 d'entre elles (2 `AUTRES_CONFIRMED` via la règle
`OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE` — "École des Infirmiers Diplômés
d'État" de Bafoussam/Foumban) — seule leur `category_decision` a été mise
à jour, leur `classification` reste `DUPLICATE_REVIEW`, prête à profiter
d'une éventuelle résolution de dédoublonnage lors d'un futur sprint.

Détail complet, ligne par ligne, depuis zéro (§16) :
`reports/registry/minsante-c-reclassification.csv`. Script :
`scripts/school-registry/minsante-c-reclassify.ts` (idempotent, revérifié
par exécution répétée — même tally, même checksum d'approbation).

Nouveau snapshot d'approbation : `reports/registry/minsante-c-pilot-approval.json`
(4 candidats, checksum `4bb2d39855d1aa04f53ab6540d120b236942aae42699e86e19d22bd87678e6cc`)
— l'ancien snapshot MINSANTE-B (2 candidats, checksum
`a9c38a42a060cb27651768ee1efa24a7905eb054c23d2e42e869fc2268abc2ad`)
reste inchangé sur disque, jamais écrasé.

## MISE À JOUR SPRINT MINSANTE-D (2026-08-20) — DUPLICATE REVIEW & APPROVAL POPULATION CONSOLIDATION (récapitulatif)

Opérateur : jean-merlain. Portée : résolution des 11 lignes staging
MINSANTE `DUPLICATE_REVIEW` héritées de MINSANTE-B (mêmes garanties —
additif, read-only sur `establishments`/`establishment_registry_identifiers`,
aucune promotion). Décisions de dédoublonnage documentées cas par cas
(`reports/registry/minsante-d-duplicate-review.csv`, script
`scripts/school-registry/minsante-d-reclassify.ts`) : **2 candidats
`CONFIRMED_SAME_ESTABLISHMENT`** (École des Métiers de la Santé de
Bamougoum — canonique `7517d1df…`, doublon non-canonique `276633af…`
conservé avec `duplicate_of_staging_id` renseigné, jamais supprimé
physiquement) et **9 `CONFIRMED_DISTINCT`**. Une fois le blocage de
doublon levé pour les 9 distincts + le canonique, la matrice de catégorie
MINSANTE-C (inchangée) a été réappliquée : 2 résolus `CLEAN_APPROVABLE`
(les deux "École des Infirmiers Diplômés d'État" de Bafoussam/Foumban,
règle `OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE`), 8 retombés
`CATEGORY_REVIEW` faute de preuve de catégorie. Population complète du
pilote après MINSANTE-D : **`CLEAN_APPROVABLE`=6, `CATEGORY_REVIEW`=15,
`DUPLICATE_REVIEW`=1** (le doublon non-canonique restant). Nouveau
snapshot : `reports/registry/minsante-d-pilot-approval.json` (6 candidats,
checksum `2d7d75e273777c50dd73ee4e1447a5613cbb0eb64db3d4bfc170eb4251529d1f`).

## MISE À JOUR SPRINT MINSANTE-E (2026-08-20) — CATEGORY REVIEW RESOLUTION + APPROVAL POPULATION CONSOLIDATION

Opérateur : jean-merlain. Portée : résolution ciblée, candidat par
candidat, des 15 lignes staging MINSANTE `CATEGORY_REVIEW` héritées de
MINSANTE-D (batch `minsante-pilot-v1`, région Ouest). **AUCUNE nouvelle
ligne staging, AUCUNE écriture `establishments`/
`establishment_registry_identifiers`, AUCUNE promotion, AUCUNE migration
exécutée** — mêmes garanties que MINSANTE-C/D. Script :
`scripts/school-registry/minsante-e-reclassify.ts` (idempotent, revérifié
par 3 exécutions réelles consécutives — mêmes tallies, même checksum
d'approbation à chaque passage).

### E.1 — Hiérarchie de preuve de catégorie finale (Model A, inchangé)

Aucune modification de la hiérarchie validée en MINSANTE-C — appliquée à
l'identique, jamais affaiblie :

```
1. EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE (supérieur/universitaire/université/faculté dans le titre officiel MINSANTE) -> SUPERIEUR_CONFIRMED
2. OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE ("Infirmiers Diplômés d'État" dans le titre officiel) -> AUTRES_CONFIRMED
3. Corroboration officielle externe VÉRIFIÉE DIRECTEMENT ce sprint (page institutionnelle officielle récupérée avec succès, identité confirmée par nom distinctif + ville) -> SUPERIEUR_CONFIRMED ou AUTRES_CONFIRMED selon la preuve
4. Aucune preuve suffisante -> CATEGORY_REVIEW (défaut, §13 : jamais une catégorie devinée par popularité, branding, ou apparence du nom — "Institut"/"École"/"Centre" seuls ne suffisent JAMAIS)
```

### E.2 — Signaux officiels de catégorie rencontrés ce sprint

Recherche ciblée candidat par candidat menée sur les 15 lignes
`CATEGORY_REVIEW` (sources Tier 1/2 uniquement comme autorité finale —
minsante.cm, pages institutionnelles officielles récupérées directement,
registre officiel MINESUP ; annuaires commerciaux/Facebook utilisés
seulement pour la découverte de piste, jamais comme preuve finale, §6) :

- **1/15 résolu avec preuve directe vérifiée** : "École Privée Fondation
  Tchuente de Bafoussam" -> `AUTRES_CONFIRMED`. Page officielle
  (`epfpsa-ft.org/Formation.php`, récupérée directement) : nom officiel
  complet "École Privée de Formation **Professionnelle** des Personnels
  Sanitaires Fondation Tchuente" — auto-désignation explicite "formation
  professionnelle" (jamais "enseignement supérieur"), deux cycles à
  niveau d'entrée secondaire/technique (Infirmiers D.E. dès le
  Baccalauréat, Aides-Soignants dès le BEPC). Identité confirmée par le
  patronage distinctif "Tchuente".
- **14/15 restent `CATEGORY_REVIEW`** — traçabilité complète par
  candidat dans `reports/registry/minsante-e-category-review.csv`
  (colonne `official_level_evidence`) : majorité des sites institutionnels
  probables identifiés mais **injoignables** ce sprint (erreurs SSL/DNS/
  timeout/403 reproductibles, y compris sur des domaines déjà documentés
  défaillants en MINSANTE-C ET sur de nouveaux domaines candidats), un
  document MINSANTE primaire confirmé à nouveau comme image scannée sans
  texte extractible, et pour "Institut des Sciences et Techniques
  Médico-Sanitaires (ISTMS) de Bafoussam" un cas de **frontière
  inter-ministérielle nuancé** (voir E.3) qui n'atteint pas le seuil de
  preuve malgré une proximité structurelle avec une institution MINESUP
  voisine.

### E.3 — Frontière inter-ministérielle (§7, §16 du brief)

Aucun candidat n'a été nouvellement classé `superieur` ce sprint — la
revalidation MINESUP obligatoire pour les nouveaux `superieur` (§16) n'a
donc rencontré aucun cas déclencheur. Néanmoins, une vérification
d'identité approfondie a été menée par prudence sur "Institut des
Sciences et Techniques Médico-Sanitaires de Bafoussam" (ISTMS) après
qu'une source secondaire l'ait décrit comme l'une des 5 écoles du
complexe "Institut Universitaire de la Pointe" (ex-"3i Santé"), aux côtés
de "Institut Supérieur des Sciences Appliquées à la Santé (INSSAS)".
Vérification directe sur le registre officiel MINESUP
(`minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/`) :
**seul INSSAS y figure comme IPES autorisé** (décret N°12/0664/MINESUP du
23/11/2012, promoteur KUE Richard) — **ISTMS n'y figure PAS comme entité
distincte autorisée**. Conformément à la règle §7 ("ne jamais classer un
établissement différent — même structurellement proche — comme
`superieur` simplement parce qu'un établissement MINESUP voisin partage
un nom de complexe"), ISTMS **n'a PAS été classé `superieur`** malgré la
proximité de marque : identité ISTMS≠INSSAS non confirmée (noms
officiels différents, actes de création cités sous des autorités
différentes — MINSANTE pour ISTMS d'après une source secondaire non
vérifiée directement, MINESUP pour INSSAS confirmé directement). Résultat
publié en transparence : `reports/registry/minsante-e-cross-ministry-review.csv`
(15/15 `DISTINCT` au sens du moteur de matching partagé, aucun
`SAME_INSTITUTION_CROSS_MINISTRY`, aucun `AMBIGUOUS`).

### E.4 — Politique du candidat non résolu (§13 du brief)

`STILL_CATEGORY_REVIEW` reste un état terminal légitime, jamais un échec
à corriger par relâchement de preuve. Les 14 candidats non résolus ce
sprint conservent leur `category_decision=CATEGORY_REVIEW` et leur
`classification=CATEGORY_REVIEW` — chacun avec une note de recherche
documentée (`RESEARCH_NOTES` dans `minsante-e-reclassify.ts`, reprise
dans le CSV) précisant la piste suivie et la raison précise de l'échec de
vérification (jamais un silence).

### E.5 — Règle de blocage doublon (§17 du brief)

La ligne `DUPLICATE_REVIEW` restante depuis MINSANTE-D
(`276633af-df10-4d1e-b91e-596c7a50ed34`, doublon non-canonique de
"École des Métiers de la Santé de Bamougoum") a vu sa `category_decision`
rafraîchie (`CATEGORY_REVIEW`, cohérente avec son canonique) mais sa
`classification` est restée **volontairement inchangée**
(`DUPLICATE_REVIEW`) — le blocage de doublon prime toujours sur la
résolution de catégorie, même informative, conformément à la règle
absolue déjà appliquée en MINSANTE-C/D.

### E.6 — Règle d'éligibilité à la promotion (rappel, inchangée)

Un candidat MINSANTE ne devient `CLEAN_APPROVABLE` que si : source sûre
(`PROBABLE_TIER_1`, inchangé — aucune nouvelle recherche d'autorité
large ce sprint, §25), PII sûre (0 persistée, revérifié), identité
d'établissement sûre (aucun signal live/staging), catégorie résolue
(`SUPERIEUR_CONFIRMED`/`AUTRES_CONFIRMED`, jamais devinée), aucun blocage
de doublon, aucun blocage frontière inter-ministérielle. **Aucun
identifiant officiel requis** (toujours inconnu pour MINSANTE, §3).
`PROMOTION = NON` ce sprint.

### E.7 — Reclassification finale des 22 lignes pilote

```
AVANT (MINSANTE-D) : CLEAN_APPROVABLE=6, CATEGORY_REVIEW=15, DUPLICATE_REVIEW=1
APRÈS (MINSANTE-E) : CLEAN_APPROVABLE=7, CATEGORY_REVIEW=14, DUPLICATE_REVIEW=1, CROSS_MINISTRY_REVIEW=0, OTHER_REVIEW=0
```

Détail complet, ligne par ligne : `reports/registry/minsante-e-reclassification.csv`,
`reports/registry/minsante-e-category-review.csv`,
`reports/registry/minsante-e-category-summary.json`,
`reports/registry/minsante-e-cross-ministry-review.csv`,
`reports/registry/minsante-e-run-summary.json`.

Nouveau snapshot d'approbation : `reports/registry/minsante-e-pilot-approval.json`
(7 candidats, checksum `43e6f55393823970a0332d1feed62f3ec84b1b7761fe0a288df4819a28aaf792`)
— l'ancien snapshot MINSANTE-D (6 candidats, checksum
`2d7d75e273777c50dd73ee4e1447a5613cbb0eb64db3d4bfc170eb4251529d1f`) reste
inchangé sur disque, jamais écrasé.

### E.8 — Validité de la taxonomie (§14 du brief)

`superieur`/`autres` restent sémantiquement suffisants pour l'intégralité
de la population pilote observée à ce jour (22/22 candidats). Aucun
candidat n'a révélé une catégorie officielle distincte qui ne rentrerait
dans aucune des deux valeurs — **aucun CATEGORY MODEL GAP identifié,
aucune migration proposée ni exécutée**.

### E.9 — Décision de seuil de promotion (§24 du brief)

`PROMOTION_PILOT_MEANINGFUL` : **NON**, pas encore, sur la base d'un
jugement motivé (pas un seuil de pourcentage automatique) :

- **Volume absolu** : 7 candidats `CLEAN_APPROVABLE` sur 22 (population
  pilote mono-région, mono-lot) reste un échantillon modeste pour valider
  un pipeline de promotion contrôlée de bout en bout — suffisant pour un
  DRY-RUN/PRE-FLIGHT technique, pas nécessairement pour juger de la
  représentativité nationale.
- **Représentativité** : les 7 candidats propres couvrent un mélange
  `autres`/`superieur` et plusieurs filières (Infirmiers, Analyses
  Médicales, Sages-femmes, Odontostomatologie) — représentativité
  qualitative correcte pour la région Ouest, mais aucune preuve de
  généralisation aux 9 autres régions.
- **Volume non résolu restant** : 14/22 (64%) restent `CATEGORY_REVIEW`
  — majorité de la population encore bloquée, principalement par
  l'injoignabilité technique de sites institutionnels plutôt que par une
  preuve négative — un futur sprint de recherche ciblée (relance des
  domaines injoignables, ou recherche d'actes MINSANTE alternatifs)
  pourrait réduire significativement ce volume avant un pilote de
  promotion.
- **Qualité de source** : `PROBABLE_TIER_1` inchangé pour la source
  primaire (Liste des Écoles Agréées MINSANTE 2025) ; la nouvelle preuve
  de catégorie (Tchuente) provient d'une page institutionnelle officielle
  récupérée directement — qualité suffisante pour ce candidat précis.
- **Sécurité production** : aucune preuve de risque de doublon
  supplémentaire ou de collision cross-ministry détectée sur les 15
  candidats revalidés — signal positif, mais sur un échantillon encore
  trop petit pour conclure à une sécurité de promotion nationale.

**Conclusion** : le volume `CLEAN_APPROVABLE` a progressé (6 -> 7) mais
la population non résolue reste majoritaire (14/22) pour des raisons
majoritairement techniques (injoignabilité de sites), pas des raisons de
preuve négative. Un `CONTROLLED_PROMOTION_PRE-FLIGHT` réel sur seulement
7 candidats serait prématuré comme validation de représentativité
nationale, mais reste **techniquement exécutable** comme DRY-RUN limité
si un futur sprint souhaite valider le pipeline lui-même plutôt que le
volume. Recommandation : un sprint de recherche ciblée supplémentaire
(retry des domaines injoignables avec des méthodes de récupération
alternatives, ou recherche de sources primaires alternatives pour les 14
candidats restants) avant tout pilote de promotion, OU accepter le volume
actuel et lancer un PRE-FLIGHT limité aux 7 candidats déjà propres en
excluant explicitement les 14 non résolus (option A du brief, à la
discrétion de l'architecte/Jean-Merlain/Eddy).

## MISE À JOUR SPRINT MINSANTE-F (2026-08-20) — CATEGORY EVIDENCE RECOVERY & PILOT CLOSURE

Opérateur : jean-merlain. Portée : dernière passe ciblée sur les 14 lignes
staging MINSANTE `CATEGORY_REVIEW` héritées de MINSANTE-E (batch
`minsante-pilot-v1`, région Ouest), avec une stratégie de **découverte de
sources alternatives** (routes A-K : nom exact, acronyme, nom+région,
nom+MINSANTE/MINESUP, nom+arrêté/décret, nom+"enseignement
supérieur"/"école de formation"/"institut supérieur", domaines
gouvernementaux) plutôt qu'un simple re-essai des URLs mortes déjà
documentées en MINSANTE-C/D/E. **AUCUNE nouvelle ligne staging, AUCUNE
écriture `establishments`/`establishment_registry_identifiers`, AUCUNE
promotion, AUCUNE migration exécutée** — mêmes garanties que
MINSANTE-C/D/E. Script : `scripts/school-registry/minsante-f-reclassify.ts`
(idempotent, revérifié par 2 exécutions réelles consécutives — même
tally, même checksum d'approbation).

### F.1 — Politique finale de catégorie du pilote

La hiérarchie de preuve Model A (§C.1, inchangée depuis MINSANTE-C) reste
la référence **définitive** pour ce pilote : `EXPLICIT_LEVEL_WORD_IN_
OFFICIAL_TITLE` -> `SUPERIEUR_CONFIRMED` ; `OFFICIAL_CYCLE_DIPLOMA_NAME_
IN_TITLE` -> `AUTRES_CONFIRMED` ; corroboration officielle **Tier 1/2**
vérifiée **directement** (jamais un snippet de moteur de recherche, jamais
Facebook/annuaire seul, §6 du brief F) -> selon la preuve ; sinon
`CATEGORY_REVIEW` (défaut permanent, jamais une catégorie devinée). Cette
politique est désormais **figée pour ce pilote** : tout candidat futur
(nouvelle région, nouvelle filière) réutilise la même hiérarchie sans
l'affaiblir.

**1/14 nouvelle résolution ce sprint** : "Institut des Sciences et
Techniques Médico-Sanitaires de Bafoussam" (ISTMS) -> `AUTRES_CONFIRMED`,
via une source Tier 2 vérifiée directement (`iu-pointe.fr`, site
institutionnel officiel du groupe parent "Institut Universitaire de la
Pointe" dont ISTMS est l'une des 6 écoles constitutives) — désignation
explicite du cycle "TMS" (Technicien Médico-Sanitaire, cycle non-supérieur
reconnu) appliquée nommément à ISTMS, corroborée indépendamment par 3
sources externes sur la signification du sigle, recoupée avec le signal
négatif déjà établi en MINSANTE-E (ISTMS absent du registre IPES MINESUP).
Détail complet : `reports/registry/minsante-f-category-recovery.csv`.

### F.2 — Politique du candidat non résolu (permanente)

`STILL_CATEGORY_REVIEW` est un **état terminal légitime et permanent**,
jamais un échec à corriger par relâchement de preuve — confirmé à nouveau
ce sprint (§14 du brief F : le succès du sprint n'était PAS de résoudre
14/14, mais que chaque candidat reçoive une décision finale justifiée).
**13/14 candidats restent `CATEGORY_REVIEW`** malgré une recherche
alternative ciblée par routes A-K pour chacun ce sprint — traçabilité
complète (`RESEARCH_NOTES` dans `minsante-f-reclassify.ts`, reprise dans
`minsante-f-category-recovery.csv`) : sites institutionnels toujours
injoignables (SSL reproductible sur `univ-jeuguevou.com/*`, revérifié via
DEUX voies indépendantes ce sprint — WebFetch direct ET proxy de lecture
tiers, échec identique confirmant un blocage serveur réel), DNS sur
`eps-lesetoiles.com`/`fondation-monga.org`/`inssas.com`, HTTP 403 sur
`cpfmbouocmr.org`, timeout DNS sur `cpfmbouocmr.net`, empreinte numérique
nulle pour "Les Argus" de Bandjoun, contenu institutionnel prometteur mais
Tier 3 uniquement (snippets de moteur de recherche, jamais une page
récupérée directement) pour COFPSAROMA/EPS Les Étoiles. Un candidat
(Bamougoum/EMES) a une décision MINSANTE primaire localisée mais
délibérément non récupérée (`MANUAL_SOURCE_REVIEW_REQUIRED`) car le
document mélange la décision avec des données d'évaluation d'étudiants
(risque PII, §12 du brief F) — accès humain direct requis, pas de
re-scraping automatisé.

**Politique retenue : les candidats non résolus restent différés
indéfiniment**, jamais bloquants pour la clôture du pilote (§F.4), jamais
promus tant qu'une preuve Tier 1/2 future ne les résout pas explicitement.

### F.3 — Règles de récupération de preuve officielle (retenues pour tout sprint futur)

1. **Ne jamais se contenter de re-tester une URL déjà morte sans variante**
   — toujours tenter routes A-K (acronyme, nom+région, nom+ministère,
   nom+acte légal, nom+niveau, domaines gouvernementaux) avant de conclure
   à un blocage structurel.
2. **Un snippet de moteur de recherche n'est jamais une preuve finale**
   (§6, Tier 3 = découverte uniquement) — même quand son contenu est très
   favorable (ex. EPS Les Étoiles : snippet décrivant un cursus ATMS/TPMS
   explicitement non-supérieur), la page doit être récupérée **directement**
   pour faire autorité. Documenté comme piste prioritaire de vérification
   humaine plutôt que comme preuve.
3. **Un deuxième chemin de récupération indépendant (proxy de lecture
   tiers) renforce la confiance qu'un blocage est réel** (serveur), pas un
   artefact de l'outil de fetch — utilisé ce sprint sur `univ-jeuguevou.com`
   avec échec identique aux deux voies.
4. **Un PDF de décision individuelle mélangeant acte administratif et
   données d'évaluation d'étudiants ne doit jamais être récupéré/analysé
   pour la seule preuve de catégorie** — `MANUAL_SOURCE_REVIEW_REQUIRED`
   est le résultat correct, pas un contournement automatisé (§11-12).
5. **Un signal négatif (absence d'un établissement d'un registre officiel
   voisin) ne suffit jamais seul à confirmer une catégorie positive** —
   utilisé uniquement en recoupement d'une preuve positive déjà trouvée
   (ex. ISTMS : absence du registre IPES MINESUP recoupée avec la
   désignation "TMS" trouvée sur le site du groupe, jamais utilisée seule).

### F.4 — Critères de clôture du pilote (§22 du brief F)

Le pilote MINSANTE peut être considéré **CLOS** sans exiger une population
100% propre, dès lors que :

```
[x] Les 22 lignes ont une classification explicite et documentée.
[x] Les candidats non résolus (13 CATEGORY_REVIEW + 1 DUPLICATE_REVIEW) sont isolés et documentés (RESEARCH_NOTES complètes, traçables).
[x] La population CLEAN_APPROVABLE (8/22, ~36%) est jugée significative pour une promotion contrôlée limitée à ce snapshot exact.
[x] Aucun problème de sécurité inconnu ne subsiste (0 doublon non traité, 0 collision cross-ministry non résolue, PII persistée = 0).
[x] Le comportement source/matching/catégorie est compris et documenté (F.1-F.3).
```

**`MINSANTE PILOT CLOSED : YES`** — voir `reports/registry/minsante-f-pilot-closure.json`
pour le détail machine-lisible complet.

### F.5 — Règle de population de promotion (§23 du brief F)

Si une future promotion contrôlée est exécutée pour ce pilote (sprint
futur, distinct, **NON exécuté ce sprint**) : la population de promotion
doit être **EXACTEMENT** le snapshot `minsante-f-pilot-approval.json`
(8 candidats, checksum ci-dessous) — **jamais** une reclassification
partielle au moment de la promotion, jamais un candidat `CATEGORY_REVIEW`/
`DUPLICATE_REVIEW` ajouté après coup sans repasser par un sprint de
reclassification dédié avec preuve Tier 1/2 documentée. Les candidats
différés restent différés jusqu'à preuve future, indéfiniment si
nécessaire.

### F.6 — Traitement des candidats différés (résumé opérationnel)

```
CATEGORY_REVIEW (13)     -> classification INCHANGÉE, category_evidence rafraîchie, exclu de toute promotion, réévaluable par un futur sprint de recherche (aucune date limite imposée).
DUPLICATE_REVIEW (1)     -> classification INCHANGÉE (§16 du brief F, blocage de doublon prime toujours), category_decision rafraîchie pour information seulement.
CLEAN_APPROVABLE (8)     -> seule population éligible à une promotion contrôlée future (§F.5), snapshot figé.
```

### F.7 — Reclassification finale des 22 lignes pilote

```
AVANT (MINSANTE-E) : CLEAN_APPROVABLE=7, CATEGORY_REVIEW=14, DUPLICATE_REVIEW=1
APRÈS (MINSANTE-F) : CLEAN_APPROVABLE=8, CATEGORY_REVIEW=13, DUPLICATE_REVIEW=1, CROSS_MINISTRY_REVIEW=0, OTHER_REVIEW=0
```

Détail complet, ligne par ligne :
`reports/registry/minsante-f-category-recovery.csv`,
`reports/registry/minsante-f-category-summary.json`,
`reports/registry/minsante-f-cross-ministry-review.csv`,
`reports/registry/minsante-f-reclassification.csv`,
`reports/registry/minsante-f-pilot-closure.json`.

Nouveau snapshot d'approbation : `reports/registry/minsante-f-pilot-approval.json`
(8 candidats, checksum `26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653`)
— l'ancien snapshot MINSANTE-E (7 candidats, checksum
`43e6f55393823970a0332d1feed62f3ec84b1b7761fe0a288df4819a28aaf792`) reste
inchangé sur disque, jamais écrasé.

### F.8 — Décisions séparées, non exécutées ce sprint (§23-24 du brief F)

```
READY FOR CONTROLLED PROMOTION PRE-FLIGHT : YES (population = snapshot minsante-f-pilot-approval.json uniquement, §F.5) — évaluation seule, PAS exécuté.
READY TO EXPAND PDF PARSER TO 10/10 FILIERES : NON — indépendant de la clôture du pilote régional ; le comportement du parser sur des documents hétérogènes (certains avec texte natif, certains scannés) n'a pas été testé à l'échelle nationale ce sprint. Évaluation seule, PAS exécuté.
```

**Aucune promotion, aucune expansion nationale exécutée ce sprint — décision
en attente de validation Jean-Merlain + Eddy + architecte.**

## MISE À JOUR SPRINT MINSANTE-G.1 (2026-08-20) — PILOT INTERNAL MATCHING HARDENING + GEO ENRICHMENT

Sprint de suivi de **MINSANTE-G** (`reports/registry/minsante-g-preflight-summary.json`),
qui avait exécuté le premier pré-vol de promotion contrôlée réel sur les 8
candidats du snapshot F et trouvé un blocage : **7/8 candidats** revenaient
`AMBIGUOUS`/`PROBABLE_MATCH` contre leurs frères différés du même pilote
(les 13 `CATEGORY_REVIEW` + 1 `DUPLICATE_REVIEW`) — la toute première fois
que ce matching **interne au pilote** était exécuté (B-F ne comparaient les
candidats qu'à la production live et à MINESUP). §26 de MINSANTE-G interdisait
explicitement de corriger le moteur et de re-promouvoir dans le même sprint.
MINSANTE-G.1 fait cette correction, **toujours sans promotion**.

### G.1.1 — Cause racine (revue humaine + inspection technique)

Revue humaine individuelle des 7 paires signalées (hiérarchie de preuve :
nom source, tokens propres distinctifs, sigle, ville explicite — jamais un
token générique seul) : **les 21 sous-paires (7 candidats × leurs
alternatives à égalité) sont toutes `CONFIRMED_DISTINCT`** — aucun doublon
réel. Détail complet : `reports/registry/minsante-g1-duplicate-pair-review.csv`.

Trois causes techniques distinctes identifiées dans
`scripts/school-registry/lib/matching/engine.ts`, chacune corrigée :

1. **`region` court-circuitait TOUJOURS `city` via `||`** — même une fois
   `city` renseignée, `candidateGeo = normalizeGeo(region) || normalizeGeo(city)`
   ignorait structurellement `city` dès que `region` était non vide (vrai
   pour les 22 lignes du pilote, `region='Ouest'`). Deux écoles de villes
   différentes dans la même région paraissaient "géographiquement cohérentes
   par défaut", sans jamais qu'un conflit de ville puisse être détecté.
2. **Le vocabulaire de rôle/statut générique n'était pas complet** :
   `infirmier(s)`/`infirmière(s)` (rôle "nurse") et `fondation` (préfixe de
   statut juridique, "Foundation X") jouaient exactement le même rôle que
   `santé`/`médico`/`personnel`/`sanitaire` déjà retirés en MINSANTE-B, sans
   y être ; `sanitaires` (pluriel) avait été omis alors que `sanitaire`
   (singulier) était déjà retiré.
3. **Le tie-break `AMBIGUOUS` ne tenait compte QUE du ratio de mots**, jamais
   de la géographie — deux cibles à égalité de chevauchement restaient
   TOUJOURS à égalité même quand l'une partageait la ville du candidat et
   l'autre non.

### G.1.2 — Corrections apportées au moteur de matching (génériques, tous registres)

`geoAgreement(regionA, cityA, regionB, cityB)` (export nommé de `engine.ts`)
remplace l'ancien calcul ad hoc. Règle, **applicable à MINESEC/MINESUP/
MINSANTE et tout futur registre**, pas seulement MINSANTE :

```
1. Si LES DEUX côtés ont une city connue -> comparaison au niveau ville (signal le plus spécifique).
2. Sinon, si LES DEUX côtés ont une region connue -> comparaison au niveau région (repli, moins spécifique).
3. Sinon -> UNKNOWN — JAMAIS un accord positif.
```

**Sémantique NULL (§11 du brief G.1)** : `city=NULL` des DEUX côtés ne compte
JAMAIS comme un accord géographique positif — au pire elle retombe sur la
comparaison de région (un signal réel, pas un artefact NULL/NULL), au pire
des cas elle retourne `UNKNOWN`. Testé explicitement :
`geoAgreement(null, null, null, null) === "UNKNOWN"`.

**Tie-break géographique (§12)** : dans le chevauchement flou
(`STRONG_MATCH`/`PROBABLE_MATCH`/`AMBIGUOUS`), une cible en **conflit**
géographique explicite (ville OU région connues et différentes) est exclue
du pool de désambiguïsation dès qu'une cible non-conflictuelle existe au même
ratio — "different explicit cities -> strong negative signal" (§7.D du
brief). Si TOUTES les cibles à égalité sont en conflit, aucun gagnant n'est
fabriqué arbitrairement (comportement `AMBIGUOUS` historique préservé).

**Exclusion des tokens de localité déjà capturés par city/region du calcul
de chevauchement flou** : un nom de ville qui apparaît DANS le texte du nom
(ex. "... DE BAFOUSSAM") ET dans le champ structuré `city` ne doit pas
ÉGALEMENT compter comme un mot "distinctif" de chevauchement — double
comptage du même signal géographique, jamais une preuve d'identité
supplémentaire. Root cause exacte observée : plusieurs écoles réelles et
DISTINCTES de Bafoussam restaient à égalité de chevauchement simplement
parce qu'elles partagent le token `bafoussam`.

**Politique frères de pilote (§12)** : les candidats approuvés restent
comparés à leurs frères différés du même batch — un vrai doublon doit
toujours bloquer la promotion. La correction porte sur la QUALITÉ du signal
(stopwords + géographie), **jamais** sur l'exclusion des frères eux-mêmes,
qui masquerait de vrais doublons futurs.

**Stopwords ajoutés** (`FUZZY_STOPWORDS`, justification complète par token
avec avant/après/risque de régression : `reports/registry/minsante-g1-stopword-audit.json`) :
`infirmier`, `infirmiers`, `infirmiere`, `infirmieres`, `fondation`, `sanitaires`
(complète le `sanitaire` singulier déjà présent depuis MINSANTE-B — même
oubli de pluralisation déjà évité pour `personnel`/`personnels`).

**Explicitement NON ajouté** : `sciences` (pluriel) — bien que ce token
explique 3/8 signaux résiduels après tous les autres correctifs, SPRINT
MINESUP-E avait déjà pris une décision documentée de le préserver comme
différenciateur de spécialité légitime pour l'enseignement supérieur
(`Higher Institute of Science and Technology`) ; l'ajouter globalement
aurait silencieusement écrasé cette décision pour TOUS les registres, pas
seulement MINSANTE — exactement le type d'ajout de terme de domaine "à
l'aveugle" que le brief G.1 interdit.

**Non-régression** : les 46 tests pré-existants de
`lib/matching/__tests__/matching.test.ts` passent inchangés (0 régression),
plus 14 nouveaux tests dédiés dans
`lib/matching/__tests__/matching-minsante-g1.test.ts` (scénarios A-F du
brief G.1 : deux écoles d'infirmiers distinctes, vraie variante avec
"infirmiers", région+city NULL, villes explicites différentes, candidat
approuvé vs frère différé, cas historiques vrais positifs inchangés).

### G.1.3 — Enrichissement `city` évidence-only (§8-10 du brief G.1)

Les 22 lignes staging du pilote (`batch='minsante-pilot-v1'`) avaient TOUTES
`city=NULL` malgré `region='Ouest'` non-discriminant. Le nom officiel
MINSANTE lui-même contient explicitement la localité en suffixe
(`"... DE <VILLE>"`, §9 : *"the school name itself may be accepted only
when location is an explicit part of the official name"*). Extraction
**déterministe** (dernière occurrence de `" DE "` dans `name_raw`, texte
capturé verbatim) — **jamais** une inférence par capitale régionale,
popularité, sigle ou extrait web.

Résultat : **22/22 lignes enrichies**, source `MINSANTE_OFFICIAL_NAME_SUFFIX`,
21 à confiance `HIGH` (nom de ville simple), 1 à confiance `MEDIUM` (nom
composé, `"MBOUO BANDJOUN"`, capturé verbatim sans interprétation). Écriture
strictement additive : `city` (colonne, était NULL) + `raw_data.minsante_g1_geo_enrichment`
(objet de traçabilité — source/preuve/confiance/date). `name_raw`,
`raw_data.minsante_b_snapshot` à `..._f` et toutes les autres clés
existantes de `raw_data` **inchangées**, vérifié par relecture après
écriture. Détail ligne par ligne : `reports/registry/minsante-g1-city-enrichment.csv`.

**Snapshot d'approbation inchangé** : le checksum
`26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653` reste
**valide** après enrichissement — `city` ne fait PAS partie des champs
canoniques hachés par `minsante-f-reclassify.ts`/`minsante-g-promotion-preflight.ts`
(`staging_id, name, region, programs, education_family, main_category,
category_evidence, source, decision`). Vérifié programmatiquement ce
sprint, pas supposé. **Aucun nouveau snapshot requis.**

### G.1.4 — Résultat du re-matching interne au pilote (dry-run, aucune écriture)

`scripts/school-registry/minsante-g1-preflight-recheck.ts` (même logique que
`minsante-g-promotion-preflight.ts`, mêmes 8 candidats, même checksum, contre
l'état actuel de la base post-enrichissement) :

```
AVANT (MINSANTE-G)  : ELIGIBLE=1, DUPLICATE_SIGNAL=7
APRÈS (MINSANTE-G.1): ELIGIBLE=5, DUPLICATE_SIGNAL=3 (matching_after : EXACT=0 STRONG=0 PROBABLE=1 AMBIGUOUS=2 NO_MATCH=5)
```

Les 3 signaux résiduels sont **tous** attribuables au seul token générique
`sciences` (délibérément non retiré, §G.1.2) — **pas** à un doublon réel :
les 7 paires originales ont toutes été confirmées `CONFIRMED_DISTINCT` en
revue humaine (§G.1.1). `READY FOR RE-PREFLIGHT : NO` (eligible=5 ≠ 8) —
conformément au §19 du brief G.1, le sprint s'arrête ici, **aucune
promotion**. Détail complet : `reports/registry/minsante-g1-preflight-recheck.json`,
`reports/registry/minsante-g1-matching-after.csv`.

### G.1.5 — Leçons pour une future promotion contrôlée du pilote

```
1. Le matching interne-au-pilote (candidats vs frères différés du même batch) DOIT être exécuté au moins une fois avant toute promotion contrôlée — B-F ne l'avaient jamais fait.
2. `city` doit être enrichie AVANT le matching, pas après — sans elle, `region` seule ne discrimine jamais un pilote mono-région.
3. Un token générique découvert dans UN registre (ex. "infirmiers" MINSANTE) doit être audité avec preuve réelle avant ajout — jamais supposé par analogie seule.
4. Un token générique NE DOIT PAS être ajouté s'il contredit une décision déjà documentée dans un AUTRE registre (ex. "sciences", protégé par MINESUP-E) — FUZZY_STOPWORDS est un contrat partagé, pas un réglage local.
5. `eligible != candidate_count` doit STOP le sprint, jamais être "forcé" en abaissant le seuil de preuve localement.
```

**MINSANTE-G.1 CLOSED : YES — aucune promotion, aucune écriture
establishments/registry_identifiers. Décision en attente de validation
Jean-Merlain + Eddy + architecte (recommandation : B — revue
géographie/doublon supplémentaire requise pour le token `sciences`, voir
`reports/registry/minsante-g1-summary.json`).**
