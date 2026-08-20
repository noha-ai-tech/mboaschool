# MINEFOP Import Contract

SPRINT MINEFOP-A, 2026-08-19. Opérateur : jean-merlain. Contrat de
collecte pour un futur MINEFOP-B — **non exécutable en l'état**, la
source primaire étant actuellement inaccessible (voir
`docs/03_DATA_REGISTRY/MINEFOP_SOURCE_CATALOG.md`). S'appuie sur
`MULTI_REGISTRY_CONTRACT.md` (contrat générique multi-ministère) et
`REGISTRY_EXTRACTION_SAFETY.md` (politique d'extraction, obligatoire).
Chaque section marque explicitement ce qui est CONNU (structurel, déduit
du schéma existant) vs INCONNU (dépend d'un accès source qui n'a pas pu
être obtenu ce sprint) — jamais deviné pour combler un inconnu.

## 1. Authority / Registry

```
authority = MINEFOP   (déjà dans l'enum registry_source_ministry, migration 0006 — CONFIRMÉ, aucune migration requise)
registry  = INCONNU   — aucun nom proposé ce sprint (contrairement à MINESUP_IPES/MINESUP_STATE_UNIVERSITIES en MINESUP-A). La spec de ce sprint interdit explicitement de coder un namespace arbitraire tant que la structure réelle de la source n'a pas été observée — respecté ici : la source n'a jamais été atteinte.
```

## 2. Entity Model

```
UNKNOWN — aucune fiche de centre de formation professionnelle réelle n'a été observée ce sprint (source bloquée). Impossible de déterminer si un centre = une ligne unique, ou si des centres partagent une même autorisation (ex. franchises, réseaux de centres agréés sous un même opérateur — hypothèse plausible dans le secteur mais NON VÉRIFIÉE).
```

**Can current establishments model represent MINEFOP : PROBABLE mais NON
CONFIRMÉ.** Le modèle (une ligne = un établissement identifiable) a
fonctionné pour MINESEC et MINESUP ; rien dans les sources externes
consultées (article de presse) ne suggère une structure différente, mais
ce n'est qu'une inférence, pas une preuve directe.

## 3. Official Identifier Strategy

```
IDENTIFIER NAME:     INCONNU. L'article Cameroon Tribune (Source B) mentionne
                    des "dates d'expiration de l'agrément" par centre — suggère
                    l'existence d'un numéro/acte d'agrément individuel, mais
                    aucun exemple réel de sa forme n'a été observé.
FORMAT:               INCONNU — aucun échantillon.
UNIQUENESS:            INCONNU.
STABLE OVER TIME:      INCONNU — mais le concept même d'expiration ("agrément
                    expiré") suggère que le statut n'est PAS stable dans le
                    temps de la même façon qu'un arrêté de création MINESUP.
                    Si confirmé, cela impliquerait un `status`/`valid_until`
                    à modéliser séparément de l'identifiant lui-même — à
                    creuser lors d'un futur MINEFOP-B avec un vrai échantillon.
```

**Décision** : aucun `identifier_type` proposé ce sprint (contrairement à
MINESUP-B qui a pu proposer `CREATION_ORDER`/`OPENING_AUTHORIZATION`
après observation directe). Le modèle texte ouvert
(`authority`/`registry`/`identifier`/`identifier_type`) reste
structurellement compatible pour accueillir ces valeurs plus tard, sans
migration.

## 4. Category Mapping — MINEFOP TAXONOMY GAP ANALYSIS

```
registry_education_family : 'vocational_training' — DÉJÀ PRÉSENT dans l'enum (migration 0006, scripts/school-registry/types.ts), CONFIRMÉ ce sprint. AUCUNE migration requise.
main_category (établissements, produit) : 'autres' — DÉJÀ PRÉSENT, avec des sous-catégories directement pertinentes (src/lib/categories.ts) : "Santé", "Auto-école", "Couture", "Coiffure", "Hôtellerie", "Informatique", "Langues". AUCUNE migration requise.
```

| Type de centre (hypothèse, secteur formation professionnelle) | `education_family` | `main_category` / `sub_category` | Migration needed? |
|---|---|---|---|
| Centre de formation professionnelle générique | `vocational_training` | `autres` | NON |
| Centre spécialisé santé | `vocational_training` | `autres` / "Santé" | NON |
| Auto-école | `vocational_training` | `autres` / "Auto-école" | NON |
| Centre informatique/bureautique | `vocational_training` | `autres` / "Informatique" | NON |
| Institut hôtelier | `vocational_training` | `autres` / "Hôtellerie" | NON |

**Conclusion : MIGRATION REQUIRED BEFORE PILOT = NON.** Le schéma et la
taxonomie produit anticipaient déjà MINEFOP avant ce sprint — contraste
net avec l'incertitude qui pèse sur toutes les autres sections de ce
contrat (source bloquée), cette section-ci est la seule à pouvoir
conclure avec un niveau de confiance élevé sans avoir vu une seule fiche
réelle, parce qu'elle repose sur l'audit du CODE EXISTANT, pas sur la
source externe.

## 5. Geography Mapping

```
UNKNOWN — aucune fiche source atteinte. L'article Cameroon Tribune donne des TOTAUX par région (Centre, Littoral, Ouest) mais aucune adresse/ville individuelle. Réutiliser normalizeRegionCasing()/cameroonRegions.ts par défaut si une source structurée est trouvée plus tard — même politique que MINESUP/MINESEC, mais rien à confirmer aujourd'hui.
```

## 6. Completeness Proof Strategy

```
COMPLETENESS_PROOF = UNKNOWN, et le restera tant que la source primaire n'est pas accessible.
Le chiffre "730 centres en règle" (Source B, article de presse, 2018) NE DOIT JAMAIS servir d'expected_count :
  1. Il est vieux de ~8 ans à la date de ce sprint.
  2. Il vient d'un article de presse, pas d'un document MINEFOP consulté directement.
  3. Il désigne les centres "en règle" (agréés valides) à une date donnée — pas un total structurel du secteur, et le même article confirme explicitement l'existence de structures NON agréées ("de nombreuses structures fonctionnent illégalement") qui ne devraient de toute façon jamais figurer dans un registre officiel MINEFOP.
Toute future collecte MINEFOP devra définir sa propre preuve d'exhaustivité à partir d'une source PRIMAIRE actuelle, jamais par référence à ce chiffre historique.
```

## 7. Raw Snapshot Strategy

Conceptuellement identique au pattern déjà validé (MINESEC/MINESUP) —
réutilisable sans changement le jour où une source structurée est
atteinte :

```
source_url        = URL exacte de chaque page/fiche (jamais un snapshot agrégé)
fetched_at         = horodatage de la requête
content_type       = INCONNU (HTML vs PDF — les seuls documents MINEFOP atteints ce sprint sont des PDF individuels, pas une liste ; un futur MINEFOP-B pourrait donc devoir gérer un extracteur PDF, PAS seulement HTML comme MINESUP/MINESEC — à anticiper comme un travail technique distinct si confirmé)
SHA256             = writeSourceSnapshot() existant, réutilisable tel quel
parser_version     = à définir lors de l'écriture d'un futur collecteur réel
expected_count      = UNKNOWN (§6)
completeness_status  = MANUAL_REVIEW_REQUIRED par défaut tant que §6 n'est pas résolu
```

## 8. Matching Rules — TEST RÉEL AVEC CANDIDATS SYNTHÉTIQUES (§20)

Le moteur partagé (`scripts/school-registry/lib/matching/engine.ts`) a
été testé ce sprint avec 5 candidats **synthétiques** (aucune donnée
MINEFOP réelle disponible) contre les 8 établissements `main_category=
'autres'` actuellement en production :

```
Live 'autres' (8) : Auto-École La Route Sûre, Auto-École Madiba,
Centre de Cuisine et d'Hôtellerie de Douala, Centre de Formation en
Couture et Mode de Yaoundé, Centre de Formation en Informatique et
Bureautique (CFIB), Centre Informatique et Bureautique de Yaoundé
(CIBY), etsmoafo, Institut Supérieur de Santé.
```

| Candidat synthétique | Résultat | safeForAutoLink |
|---|---|---|
| "Centre de Formation en Informatique et Bureautique" (Douala) | PROBABLE_MATCH vs CFIB (Yaoundé) — géographie contradictoire détectée correctement | false |
| "Centre de Formation Professionnelle Informatique de Yaoundé" | AMBIGUOUS (chevauchement 60% avec plusieurs cibles) | false |
| "Auto-École La Route Sûre" (nom identique, géo inconnue des deux côtés) | STRONG_MATCH | false |
| "Institut Supérieur de Santé de Douala" | AMBIGUOUS (chevauchement 50% avec plusieurs cibles) | false |
| "Centre de Formation Agropastorale de Bafoussam" | AMBIGUOUS (chevauchement 50%, aucun lien thématique réel avec les cibles) | false |

**Aucun faux positif dangereux** : jamais de fusion automatique
(`safeForAutoLink` toujours `false`), et le seul cas à géographie
contradictoire (CFIB Douala/Yaoundé) a été correctement dégradé à
`PROBABLE_MATCH` plutôt qu'`EXACT_IDENTITY`.

**Gap réel identifié — vocabulaire vocationnel absent de
`FUZZY_STOPWORDS`.** Les mots génériques "centre", "formation",
"professionnelle" ne sont PAS dans la liste de mots vides du moteur
(qui couvre le vocabulaire secondaire — "collège"/"lycée"/... — et
supérieur — "university"/"institute"/... — mais rien de vocationnel).
Résultat observé : "Centre de Formation Agropastorale de Bafoussam" (un
domaine totalement différent, aucune ville commune) obtient quand même
un chevauchement de 50% avec des cibles sans rapport, uniquement via
"centre"/"formation". Ce n'est **pas un risque de sécurité** (jamais
d'auto-fusion, toujours `AMBIGUOUS`/revue humaine), mais un bruit
inutile qui alourdirait la revue humaine à l'échelle nationale.
**Recommandation avant tout pilote réel** : étendre `FUZZY_STOPWORDS`
avec un vocabulaire vocationnel générique ("centre", "formation",
"professionnel", "professionnelle", "agree", "agréé") — même pattern
que le correctif déjà appliqué pour le supérieur en MINESUP-E. **Non
corrigé ce sprint** : la spec MINEFOP-A est une investigation
read-only/documentation, pas un sprint de code ; ce changement touche un
fichier partagé par TOUS les registres déjà en production (MINESEC,
MINESUP) et mérite son propre test de non-régression ciblé, à faire au
moment où un vrai pilote MINEFOP est engagé — pas en avance sur des
données hypothétiques.

## 9. Staging Contract

`STAGING COMPATIBLE : YES` (même conclusion que MINESUP §9, revérifiée
structurellement) :

- `education_family = 'vocational_training'` — déjà présent, aucune migration.
- `official_identifier` (staging, text libre) — prêt à accueillir un
  identifiant MINEFOP quel que soit son format final, une fois observé.
- `raw_data` (jsonb) — absorbe tout champ riche futur (spécialités,
  durée de formation, etc.) sans changement de schéma.
- `region`/`city`/`locality` — suffisants, aucun champ manquant identifié.

Aucune extension de schéma staging requise — **mais cette conclusion
repose sur l'hypothèse que la structure d'une fiche MINEFOP ressemblera
aux registres déjà vus (nom, géographie, identifiant, catégorie)** ;
à reconfirmer explicitement le jour où une vraie fiche est enfin
observée.

## 10. Review Rules

Reprendre la matrice de déduplication inter-ministères
(`MULTI_REGISTRY_CONTRACT.md` §5) sans modification. Risque de doublon
avec les 8 établissements `autres` déjà en production **confirmé réel**
(§8 ci-dessus, test synthétique) : tout futur candidat MINEFOP DOIT être
matché contre ces 8 avant tout staging — et le gap de mots vides (§8)
devra être comblé avant de faire confiance au volume de résultats
`AMBIGUOUS` produits à l'échelle nationale (sinon risque de saturer la
revue humaine de faux positifs bruités, jamais de fusion incorrecte).

## 11. PII / Data Minimization Policy

Politique identique à MINESUP (`piiRedaction.ts` réutilisable tel
quel) : exclure nom du promoteur/directeur/représentant légal de tout
champ ET de toute URL persistée. Aucune fiche MINEFOP réelle n'a été
observée ce sprint pour confirmer la présence de tels champs, mais le
principe reste appliqué par défaut à toute future collecte, jamais
conditionné à une preuve préalable de leur absence.

## 12. Future Promotion Prerequisites

Avant toute collecte MINEFOP réelle (hors périmètre de ce sprint) :

1. **Obtenir un accès fonctionnel à `minefop.cm`** (certificat TLS
   renouvelé + résolution du 403/404 applicatif) — précondition
   bloquante absolue, aucun contournement tenté ni recommandé.
2. Si le site reste inaccessible durablement, chercher une source
   PRIMAIRE alternative structurée (portail open-data gouvernemental,
   publication officielle téléchargeable récente avec des fiches
   individuelles) — ne jamais construire un import sur la seule Source
   B (article de presse 2018).
3. Une fois une vraie fiche observée : compléter réellement les
   sections §2 (entity model), §3 (identifier strategy), §5
   (géographie), §6 (completeness proof) — actuellement toutes
   `UNKNOWN` par manque d'accès, pas par choix.
4. Étendre `FUZZY_STOPWORDS` avec le vocabulaire vocationnel (§8) et
   ajouter les tests de régression correspondants avant tout staging
   réel à l'échelle nationale.
5. Décider explicitement du nom du `registry` (§1) une fois la
   structure réelle de la source connue — jamais avant.
6. Pilote limité (une région) avant toute collecte nationale — même
   politique que MINESEC/MINESUP.

## 13. MINEFOP V1 Acceptance Criteria

```
[x] Compatibilité schéma (education_family, main_category) confirmée sans migration.
[ ] Accès fonctionnel à une source MINEFOP primaire structurée — BLOQUANT, non résolu ce sprint.
[ ] Au moins un échantillon réel de fiche(s) MINEFOP observé (nom, identifiant, géographie) — INCONNU tant que §précédent n'est pas résolu.
[ ] Format/unicité d'un identifiant officiel MINEFOP vérifié sur un échantillon représentatif — INCONNU.
[ ] Preuve d'exhaustivité définie sur une source ACTUELLE (jamais le chiffre 2018) — INCONNU.
[ ] FUZZY_STOPWORDS étendu au vocabulaire vocationnel + tests de régression — recommandé, non fait ce sprint.
[ ] Nom(s) de registre(s) décidé(s) à partir de la structure réelle observée — non fait, volontairement différé.
[ ] PII exclue à 100% (politique par défaut, à reconfirmer sur données réelles).
[ ] Dry-run staging propre (0 écriture) avant toute collecte réelle.
[ ] Pilote limité à une seule région avant toute collecte nationale.
```

## 14. Décision — SOURCE PRIORITY PLAN (MINEFOP-A initiale)

```
NEXT STEP DECISION : E — SOURCE ACCESS RESOLUTION REQUIRED FIRST (ni un pilote de collecte, ni même un échantillon d'identifiants n'est possible tant que minefop.cm reste inaccessible ou qu'une source primaire alternative structurée n'a pas été trouvée). Aucune collecte, même légère, ne doit être tentée sur la Source B (article de presse, Tier 3/Discovery) — elle ne fournit aucune fiche individuelle à extraire.
PILOT STRATEGY : Ne peut pas être proposée ce sprint — aucune région, aucun sous-ensemble de centres n'a pu être observé pour en évaluer la faisabilité. À reprendre entièrement une fois §14 ci-dessus résolu.
```

---

## 15. SPRINT MINEFOP-A.1 — MISE À JOUR (2026-08-20)

Fait suite à une recherche systématique de sources alternatives (voir
`MINEFOP_SOURCE_CATALOG.md`, section "ALTERNATIVE SOURCE RECOVERY —
MINEFOP-A.1"). `minefop.cm` reste inaccessible (retest minimal confirmé :
`CERT_HAS_EXPIRED`, identique à MINEFOP-A). **Aucune source alternative
fournissant des fiches d'établissements individuelles n'a été trouvée.**
La meilleure source trouvée (Source D — Annuaire Statistique ONEFOP/MINEFOP
2020-2021, ins-cameroun.cm) est un document STATISTIQUE AGRÉGÉ, pas un
registre nominatif.

### 15.1 Source hierarchy (mise à jour)

```
1. minefop.cm (Source A)                 — TOUJOURS BLOQUÉ, TIER 1 potentiel non exploitable
2. Annuaire ONEFOP/MINEFOP (Source D)     — TIER 1 réel, mais AGRÉGATS SEULEMENT — sert d'EXPECTED_COUNT
                                             et de vocabulaire/typologie officiels, jamais de source d'extraction
                                             d'établissements individuels
3. Décret 2005/123 + Arrêté 007/PM 2002   — TIER 2, cadre légal/autorité, aucune fiche
   (Sources E, F)
4. Pattern d'identifiant d'agrément       — Format confirmé sur 5 exemples indépendants, mais AUCUNE liste
   (Source G)                              centralisée trouvée — inutilisable en collecte tant qu'une liste
                                             n'existe pas
5. Cameroon Tribune 2018 (Source B)       — TIER 3/Discovery, historique, jamais un expected_count actuel
6. vitrineducameroun.com (Source H)       — DISCOVERY ONLY, PDF scanné illisible, provenance non établie
```

**FALLBACK SOURCE STRATEGY : aucun fallback praticable ce sprint pour
l'EXTRACTION d'établissements.** La Source D (meilleure source trouvée) ne
change PAS la conclusion du §2 (entity model) ni du §3 (identifier
strategy) ci-dessus au niveau "fiche individuelle" — mais elle permet de
lever partiellement l'inconnu du §6 (completeness proof) au niveau
national/régional agrégé, et du §4 (taxonomie) au niveau vocabulaire réel.

### 15.2 Entity model — mise à jour partielle du §2

```
UNKNOWN AU NIVEAU FICHE INDIVIDUELLE — toujours vrai, aucune fiche de centre observée.
CONNU AU NIVEAU TYPOLOGIQUE (nouveau, Source D) :
  Types officiels confirmés : SAR/SM (Section Artisanale Rurale/Section Ménagère, PUBLIC),
  CFPR/IVTC (Centre de Formation Professionnelle Rapide), CFPE/AVTC (Centre de Formation
  Professionnelle d'Excellence), CFM/CFPM/TTC (Centre de Formation aux Métiers), INFFDP/NITTPD
  (Institut National des Formations des Formateurs et du Développement des Programmes, PUBLIC,
  cas particulier — institution de formation de formateurs, PAS un CFP grand public : à
  classifier séparément si rencontré, PROBABLE=OTHER plutôt que TRAINING_ESTABLISHMENT standard),
  et pour le PRIVÉ : Confessionnel / Laïc (avec ou sans convention avec l'État — Tableau 24 de
  la Source D, non détaillé dans le catalogue par manque de nécessité ce sprint).
  Un centre = une ligne dans les tableaux ONEFOP (comptage), cohérent avec l'hypothèse déjà
  posée en MINEFOP-A, mais RESTE UNE INFÉRENCE — les tableaux comptent des CENTRES, pas des
  franchises/réseaux, sans qu'on sache si un opérateur peut détenir plusieurs CFP comptés
  séparément (probable, non vérifié).
```

**Can current establishments model represent MINEFOP : TOUJOURS PROBABLE
mais NON CONFIRMÉ** — la Source D renforce la plausibilité (comptage par
centre discret) sans la prouver formellement.

### 15.3 Official Identifier Strategy — mise à jour partielle du §3

```
IDENTIFIER NAME (nouveau, Source G) : numéro d'arrêté d'agrément/d'ouverture, format
  "N°<numéro>/MINEFOP/SG/DFOP/<sous-direction>/<date>" — confirmé sur 5 exemples publiés
  indépendamment par les centres eux-mêmes (pas un seul agrégateur, donc pas une convention
  inventée par un tiers).
FORMAT :               Numérique variable (3-8 chiffres) + code sous-direction (SDGSF, CSACD, CBAC,
                        SDECC, SOEC, BOEC observés — sous-directions différentes selon le type de
                        structure, à ne pas traiter comme un seul type homogène) + date complète.
UNIQUENESS :            Présumée unique par décision (un arrêté = un acte daté), NON vérifiée sur volume
                        (5 échantillons seulement, aucune liste consolidée pour tester les collisions).
STABLE OVER TIME :      Le NUMÉRO est stable (acte administratif historique), mais le STATUT d'agrément
                        associé NE L'EST PAS — la Source D (Tableau 23) confirme explicitement l'existence
                        de deux catégories bien distinctes et actualisées annuellement : "CFP AGREE"
                        (733 au national en 2020-2021) vs "CFP NON AGREE" (730) — un centre peut détenir
                        un numéro d'arrêté historique sans être actuellement agréé. CONFIRME l'hypothèse
                        posée en MINEFOP-A (§3) qu'un `status`/`valid_until` séparé de l'identifiant est
                        nécessaire pour modéliser correctement ce registre.
```

**Décision (inchangée) : aucun `identifier_type` figé ce sprint.** Le
format est maintenant OBSERVÉ (contrairement à MINEFOP-A où il était
purement hypothétique), ce qui permettrait de proposer `AGREMENT_ORDER`
lors d'un futur sprint avec accès à une vraie liste — mais AUCUNE liste
consolidée n'a été trouvée pour valider ce format à l'échelle, donc pas de
nom de `registry`/`identifier_type` figé ici non plus.

### 15.4 Completeness Proof Strategy — mise à jour du §6

```
COMPLETENESS_PROOF AU NIVEAU AGRÉGÉ NATIONAL/RÉGIONAL : DISPONIBLE (nouveau) via la Source D —
  l'ONEFOP déclare explicitement procéder à un "recensement EXHAUSTIF" annuel des structures de
  formation professionnelle sur l'ensemble du territoire (méthodologie décrite : délégations
  régionales/départementales, agents de collecte formés, questionnaire structuré). Chiffre
  2020-2021 : 1 761 CFP (298 public + 1 463 privé, dont 733 agréés/730 non agréés).
COMPLETENESS_PROOF AU NIVEAU FICHE INDIVIDUELLE : TOUJOURS UNKNOWN — le recensement exhaustif
  allégué N'EST PAS publié sous forme de liste nominative accessible ce sprint. On ne peut donc
  PAS l'utiliser comme preuve d'exhaustivité d'un futur import d'établissements individuels, même
  si le CHIFFRE AGRÉGÉ peut servir de cible de validation ("combien d'établissements MINEFOP
  devrait-on avoir au total, par région, une fois la collecte terminée ?").
Le chiffre "730 centres en règle" (Source B, 2018) reste écarté comme expected_count actuel — la
  Source D fournit un chiffre 2020-2021 nettement plus récent et officiel (733 CFP privés agréés)
  qui devrait lui être préféré SI un jour un expected_count est nécessaire pour validation — mais
  ATTENTION à la coïncidence numérique documentée dans le catalogue (730 en 2018 = "en règle" ;
  730 en 2020-2021 = CFP privés NON agréés dans un tableau différent — ne jamais citer "730" sans
  préciser l'année ET la définition exacte).
```

### 15.5 Cross-source reconciliation (§17 du brief)

Une seule source quantitative comparable trouvée cette fois-ci (Source D)
en plus de la Source B déjà connue — comparaison à deux termes seulement,
PAS de fusion de listes nominatives (aucune des deux n'en fournit) :

```
SOURCE A (Cameroon Tribune 2018) : "730 centres en règle" — total national, type non précisé, presse
SOURCE B (ONEFOP/MINEFOP 2020-2021) : 733 CFP PRIVÉS agréés (+ 298 publics, non comparables au chiffre 2018 qui ne précise pas public/privé)
Overlap exact : impossible à établir (granularité différente, pas de liste nominative des deux côtés)
Conflit apparent : aucun conflit réel détecté — les deux chiffres (730 et 733) sont dans le même ordre de grandeur sur 2 ans d'écart, ce qui est cohérent plutôt que contradictoire, mais ne constitue PAS une validation croisée forte vu les définitions imprécises de la source 2018
Conclusion : PAS de fusion, PAS de nouvel expected_count figé — seulement une corroboration faible que l'ordre de grandeur "quelques centaines de CFP privés agréés au national" est stable dans le temps.
```

### 15.6 Décision — SOURCE PRIORITY PLAN (mise à jour MINEFOP-A.1)

```
NEXT STEP DECISION : E — SECONDARY STRUCTURED SOURCE FOUND, CORROBORATION OFFICIELLE ENCORE REQUISE.
  La Source D est officielle (Tier 1, ONEFOP/MINEFOP) et structurée, mais elle est agrégée — elle
  NE PEUT PAS remplacer un registre nominatif pour l'extraction d'établissements. Aucune source
  Tier 1/2 fournissant des fiches individuelles n'a été trouvée ce sprint malgré une recherche
  large (registres, PDF/XLS gouvernementaux, sources régionales, documents légaux, sources
  d'examen, partenaires internationaux, sondes sur entités connues, pattern d'identifiant).
PILOT STRATEGY : PAS DE PILOTE D'EXTRACTION D'ÉTABLISSEMENTS proposé ce sprint (aucune fiche
  individuelle disponible dans aucune source trouvée). Un futur sprint pourrait en revanche
  exploiter la Source D comme référence de VALIDATION (cible ~1 761 CFP, réparties par région)
  si/quand une source nominative est enfin trouvée ou si l'accès à minefop.cm est restauré.
MINEFOP DEFERRED : OUI — inchangé depuis MINEFOP-A, pour une raison différente (source agrégée
  trouvée mais insuffisante pour l'extraction, plutôt que source totalement bloquée).
```
