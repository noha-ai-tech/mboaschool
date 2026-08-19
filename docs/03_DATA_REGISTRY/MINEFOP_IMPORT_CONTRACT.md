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

## 14. Décision — SOURCE PRIORITY PLAN

```
NEXT STEP DECISION : E — SOURCE ACCESS RESOLUTION REQUIRED FIRST (ni un pilote de collecte, ni même un échantillon d'identifiants n'est possible tant que minefop.cm reste inaccessible ou qu'une source primaire alternative structurée n'a pas été trouvée). Aucune collecte, même légère, ne doit être tentée sur la Source B (article de presse, Tier 3/Discovery) — elle ne fournit aucune fiche individuelle à extraire.
PILOT STRATEGY : Ne peut pas être proposée ce sprint — aucune région, aucun sous-ensemble de centres n'a pu être observé pour en évaluer la faisabilité. À reprendre entièrement une fois §14 ci-dessus résolu.
```
