# MINESUP Import Contract

SPRINT MINESUP-A, 2026-08-19. Opérateur : jean-merlain. Contrat de collecte
pour un futur MINESUP-B — non exécuté par ce sprint (READ-ONLY, aucun
import). S'appuie sur `docs/03_DATA_REGISTRY/MINESUP_SOURCE_CATALOG.md`
(sources), `MULTI_REGISTRY_CONTRACT.md` (contrat générique multi-ministère)
et `REGISTRY_EXTRACTION_SAFETY.md` (politique d'extraction, obligatoire).

## 1. Authority / Registry

```
authority = MINESUP   (déjà dans l'enum registry_source_ministry, migration 0006)
```

Deux registres distincts identifiés — **pas un seul**, cohérent avec la
leçon MINESEC V1.1 (une autorité peut opérer plusieurs registres
incompatibles) :

```
registry = MINESUP_STATE_UNIVERSITIES   -- les 11 universités d'État (Source A)
registry = MINESUP_IPES                  -- instituts privés (Source B/C)
```

Ces deux noms sont des propositions de ce sprint, pas des valeurs déjà
utilisées ailleurs — à valider avant tout code réel (aucune écriture
production ne dépend de ces noms exacts aujourd'hui, `registry` reste un
champ texte ouvert dans la migration 0021).

## 2. Entity Model — MINESUP ENTITY MODEL ANALYSIS

Question posée (§12/§13) : institution vs campus vs faculté vs programme.

**Constat des sources** : MINESUP lui-même ne publie AUCUNE subdivision
campus/faculté/programme comme entité séparée avec sa propre fiche. Chaque
université d'État est UNE entrée dans le menu (Source A) ; chaque IPES est
UNE fiche (Source C), avec les filières listées EN TEXTE dans une section
de cette même fiche, jamais comme des sous-entités séparées.

**Preuve indirecte que MINESUP utilise déjà la bonne granularité** :
"Université de Yaoundé 1" et "Université de Yaoundé 2" apparaissent comme
DEUX entrées distinctes dans le menu MINESUP — si MINESUP avait voulu
traiter "Université de Yaoundé" comme une seule institution mère avec des
composantes, il ne l'aurait pas scindée ainsi. **Décision recommandée** :
respecter la granularité déjà choisie par MINESUP, ne pas la recalculer.

Classification (uniquement quand les données le permettent, jamais
inventée) :

```
ROOT_INSTITUTION   — chaque entrée du menu "Institutions Universitaires"
                      et chaque fiche IPES = un ROOT_INSTITUTION = une ligne
                      establishment.
CAMPUS              — non observé comme entité séparée dans les sources
                      consultées ce sprint. Si un futur audit d'une
                      université d'État spécifique (sur SON PROPRE site,
                      hors MINESUP) révèle des campus nommés distinctement
                      avec leur propre adresse, documenter au cas par cas
                      — ne pas généraliser une règle sans preuve.
ACADEMIC_COMPONENT  — "Filières, spécialités et diplômes autorisés" —
                      donnée RICHE mais jamais promue en establishment
                      séparé (§19). Conservée comme attribut/texte de
                      l'institution, ou une future table dédiée hors
                      périmètre de ce sprint.
PROGRAM             — cf. ACADEMIC_COMPONENT, même traitement.
UNKNOWN             — tout cas ambigu (ex. une "École" mentionnée comme
                      rattachée à une université sans fiche propre) reste
                      UNKNOWN jusqu'à preuve contraire, jamais assigné par défaut.
```

**Can current establishments model represent MINESUP : YES.** Le modèle
actuel (une ligne = un établissement physique/institutionnel identifiable)
correspond à la granularité MINESUP elle-même. Aucun changement de schéma
nécessaire pour ce point.

## 3. Official Identifier Strategy

```
IDENTIFIER NAME:        Référence d'arrêté ministériel ("Arrêtés portant création")
AUTHORITY:               MINESUP
FORMAT:                  Texte libre observé : "07/0140/MINESUP du 21 Septembre 2007"
                        — numéro + service + date, PAS un format fixe de longueur/
                        motif vérifié (un seul échantillon, voir §Identifier Analysis
                        ci-dessous pour la prudence appliquée)
UNIQUENESS:              INCONNU — non vérifié sur un corpus large. Un arrêté peut en
                        théorie couvrir plusieurs établissements ou être amendé par un
                        arrêté ultérieur ; à vérifier avant d'imposer une contrainte
                        UNIQUE stricte lors d'un futur MINESUP-B.
STABLE OVER TIME:        Probablement OUI (un arrêté de création ne change pas
                        rétroactivement) mais un "Autorisation d'ouverture" DISTINCT
                        existe aussi comme champ séparé (vide dans l'échantillon) —
                        pourrait représenter un second identifiant/événement, à
                        clarifier avant import.
ONE PER ESTABLISHMENT:   Probable pour "Arrêtés portant création" (un acte de
                        création par institution), NON CONFIRMÉ sur plusieurs
                        échantillons.
MULTIPLE PER ESTABLISHMENT: Possible si une institution a été créée PUIS a fait
                        l'objet d'arrêtés d'extension/modification distincts —
                        hypothèse, non vérifiée.
ONE PER CAMPUS:          N/A — aucun campus séparé identifié (§2).
ONE PER PROGRAM:         NON — les filières n'ont pas leur propre identifiant
                        officiel visible, elles sont listées sous l'identifiant de
                        l'institution mère.
UNKNOWN:                 Le format exact et la garantie d'unicité restent à confirmer
                        sur un échantillon représentatif (10-20 fiches réparties sur
                        plusieurs régions) avant tout import réel — recommandé comme
                        première étape technique de MINESUP-B, pas fait ici (collecte
                        limitée à 1 fiche dans ce sprint, §27).
```

**Décision** : traiter la référence d'arrêté comme
`registry = MINESUP_IPES`, `identifier_type = "ARRETE_CREATION"`,
**PAS comme un identifiant garanti unique tant qu'un échantillon plus
large ne l'a pas confirmé** — le premier import réel devrait vérifier la
contrainte `UNIQUE(registry, identifier)` en dry-run (comme fait pour
MINESEC/cartescolaire, `backfill-registry-identifiers-dry-run.ts`) avant
de faire confiance à la contrainte DB.

## 4. Category Mapping — MINESUP TAXONOMY GAP ANALYSIS

| Source type MINESUP | Écoles237 `education_family` | Écoles237 `main_category` | Match quality | Migration needed? |
|---|---|---|---|---|
| Université d'État | `higher_education` (déjà existant, migration 0006) | `superieur` | BON | NON |
| Institut Privé d'Enseignement Supérieur (IPES) | `higher_education` | `superieur` | BON | NON |
| "Institut Universitaire" / "École Supérieure" / "Higher Institute" (dénominations variées observées) | `higher_education` | `superieur` | BON — même famille malgré la diversité des libellés, le champ existant absorbe déjà cette variété | NON |
| Filière/spécialité/diplôme (sous-institution) | N/A — pas une catégorie d'établissement | N/A | N/A | Aucune (§19 : jamais une ligne par filière) |

**Conclusion** : `registry_education_family` anticipait déjà
`higher_education` avant même ce sprint (confirmé SPRINT REGISTRY-MULTI-A
§10.1/MULTI_REGISTRY_CONTRACT.md §4). **Aucune migration de taxonomie
nécessaire pour MINESUP.**

`sub_category` (établissements, texte libre) pourrait porter la
dénomination officielle exacte ("IPES", "Université d'État") si un futur
import le juge utile — pas un blocage, décision produit différée.

## 5. Geography Mapping

| Champ | Disponibilité source | Politique |
|---|---|---|
| region | OUI (Source B par section, Source C par champ nommé) | Utiliser `normalizeRegionCasing()` existant, `src/lib/cameroonRegions.ts` |
| department | Champ présent (Source C) mais VIDE dans l'échantillon | NULL si vide — jamais déduit |
| arrondissement | Champ non observé distinctement | NULL si absent |
| city | Champ "Site de localisation" présent mais VIDE dans l'échantillon | NULL si vide — cohérent avec la politique déjà établie MINESEC ("city NULL n'est pas une absence", SPRINT R.2 §9) |
| address | Champ "Adresse postale" présent, souvent réduit à une boîte postale | Conserver tel quel si présent, jamais complété |
| campus location | Non applicable (§2 — pas de campus séparé identifié) | N/A |

Réutiliser `cameroonMajorCities.ts`/`cameroonRegions.ts` uniquement pour
la couche recherche (jamais pour fabriquer une valeur `city` absente de la
source) — même politique que Major Cities/MINESEC.

## 6. Completeness Proof Strategy

| Source | Preuve possible | Statut |
|---|---|---|
| A — Universités d'État | Liste fermée, nombre d'universités d'État publiques du Cameroun généralement documenté ailleurs (hors sources MINESUP elles-mêmes) — pourrait servir de preuve croisée EXTERNE, pas une preuve MINESUP elle-même | `COMPLETENESS_PROOF = UNKNOWN` tant qu'aucune preuve déterministe propre à la source n'existe (§8 : ne jamais inventer un total) |
| B — IPES agrégé | Total annoncé "environ 430" — approximatif, ne satisfait pas `SOURCE_EXPLICIT_COUNTER` au sens strict | `COMPLETENESS_PROOF = UNKNOWN` — écart réel constaté (304 extraits vs ~430 annoncés), non résolu ce sprint |
| C — Fiche détail | N/A (fiche unique, pas une liste) | N/A |

**Aucune des sources trouvées ne permet aujourd'hui une preuve
d'exhaustivité déterministe forte.** Un futur MINESUP-B devrait soit (a)
trouver une source avec un total explicite et vérifiable, soit (b)
accepter un statut `MANUAL_REVIEW_REQUIRED` explicite pour tout batch tant
que ce problème n'est pas résolu — jamais un `PASS` silencieux sur un
compte approximatif (règle permanente `REGISTRY_EXTRACTION_SAFETY.md`).

## 7. Raw Snapshot Strategy

Réutilisable tel quel (`lib/extraction/sourceSnapshot.ts`,
`hashing.ts`) :

```
source_url        = URL exacte de chaque page consultée (liste régionale
                    ou fiche individuelle — un snapshot par page, jamais
                    un snapshot agrégé qui perdrait la traçabilité par
                    institution)
fetched_at         = horodatage de la requête
content_type       = HTML dans tous les cas observés ce sprint (aucun
                    PDF/XLSX officiel consolidé trouvé, voir source catalog)
SHA256             = writeSourceSnapshot() existant
parser_version     = à définir lors de l'écriture du collecteur réel
expected_count      = UNKNOWN (§6 ci-dessus) tant qu'une preuve n'existe pas
extracted_count      = calculé à l'exécution
completeness_status  = probablement MANUAL_REVIEW_REQUIRED par défaut pour
                     la Source B tant que l'écart n'est pas expliqué
```

Prototype de segmentation par région déjà validé dans ce sprint (script
temporaire, non conservé dans le dépôt — logique documentée dans
`MINESUP_SOURCE_CATALOG.md` Source B "EXTRACTION METHOD"). Un futur
`htmlExtractor.ts` pourrait avoir besoin d'une nouvelle primitive
`segmentByParagraphHeading()` (variante de `segmentByHeading()` existant,
qui cible des `<h2>/<h3>` — ici l'en-tête de région est un `<p><strong>`,
pas un titre HTML sémantique) — à écrire lors de MINESUP-B, pas ce sprint.

## 8. Matching Rules

Réutiliser `scripts/school-registry/lib/matching/engine.ts` tel quel — testé
contre données réelles ce sprint (§23, voir rapport final). Un gap concret
trouvé et documenté, PAS corrigé ce sprint (hors périmètre audit) :
**la normalisation actuelle ne rapproche pas "Yaoundé 1" (chiffre arabe)
de "Yaoundé I" (chiffre romain)** — a produit un résultat `AMBIGUOUS`
correct (aucune fusion incorrecte) mais un futur MINESUP-B bénéficierait
d'une normalisation chiffre arabe/romain dans `exactIdentityKey()`/
`fuzzyWords()` pour réduire le volume de revue humaine inutile. Recommandé
comme amélioration AVANT MINESUP-B, pas un blocage.

## 9. Staging Contract

`STAGING COMPATIBLE : YES` (confirme REGISTRY-MULTI-A §10, vérifié contre
la structure MINESUP réelle) :

- `education_family = 'higher_education'` — déjà présent dans l'enum,
  aucune migration.
- `official_identifier` (text, staging) — peut porter la référence
  d'arrêté brute pendant la collecte/normalisation, avant tout backfill
  vers `establishment_registry_identifiers`.
- `raw_data` (jsonb) — absorbe les champs riches de la Source C (filières,
  nom du promoteur À NE PAS PROMOUVOIR EN PRODUCTION mais qui peut
  transiter dans `raw_data` pendant la collecte pour audit — cohérent avec
  la politique "raw jamais perdu" tant qu'aucune donnée personnelle n'est
  exposée publiquement en aval).
- `region`/`city`/`locality` (staging) — suffisants, aucun champ manquant
  identifié pour MINESUP spécifiquement.

Aucun champ manquant identifié. Aucune extension de schéma staging requise.

## 10. Review Rules

Reprendre la matrice de déduplication inter-ministères
(`MULTI_REGISTRY_CONTRACT.md` §5) sans modification. Ajout spécifique
MINESUP : le risque de doublon avec les 9 établissements `superieur` déjà
en production est RÉEL et déjà partiellement démontré (§22/§24 de ce
sprint, voir rapport final) — tout futur candidat MINESUP DOIT être
matché contre ces 9 avant tout staging, jamais après.

## 11. Future Promotion Prerequisites

Avant toute promotion contrôlée MINESUP (hors périmètre de ce sprint) :

1. Résoudre l'écart de complétude Source B (304 vs ~430) ou accepter
   explicitement un statut `MANUAL_REVIEW_REQUIRED` documenté.
2. Vérifier le format/l'unicité de la référence d'arrêté sur un échantillon
   représentatif (10-20 fiches, pas 1 seule).
3. Décider explicitement du nom des registres (`MINESUP_STATE_UNIVERSITIES`/
   `MINESUP_IPES`, proposés §1) — décision produit, pas technique.
4. Améliorer la normalisation chiffre arabe/romain du matching engine (§8).
5. Exécuter la migration 0021 (si validée) et le backfill MINESEC/
   cartescolaire existant AVANT ou PENDANT le premier pilote MINESUP — voir
   décision §31 du rapport final (`AFTER_MINESUP_DISCOVERY`, ce document
   marquant la fin de cette phase).
6. Pilote limité (quelques dizaines d'établissements, une région) avant
   toute collecte nationale — cohérent avec la politique déjà appliquée
   pour MINESEC (pilote Centre/Littoral avant national).

---

## 12. MISE À JOUR — SPRINT MINESUP-B (2026-08-19)

Investigation READ-ONLY complète : voir
`docs/03_DATA_REGISTRY/MINESUP_SOURCE_CATALOG.md` (section SPRINT
MINESUP-B) et `reports/registry/minesup-b-identifier-and-completeness-audit.json`
pour les données brutes (hash SHA256 par page, aucune page committée).

### 12.1 Official identifier strategy — RÉVISÉE

`identifier_type` ne peut plus être un singleton "ARRETE_CREATION" — la
source expose potentiellement **jusqu'à 4 types d'actes distincts** par
institution, avec des libellés eux-mêmes instables :

```
identifier_type = CREATION_ORDER              ("Arrêté(s) portant création", singulier/pluriel)
identifier_type = OPENING_AUTHORIZATION        ("Autorisation d'ouverture")
identifier_type = PROVISIONAL_COMBINED_ORDER   ("Arrêté provisoire de création et d'ouverture N°" — remplace les deux ci-dessus sur certaines fiches plus anciennes, jamais les deux structures en même temps observées sur un échantillon)
identifier_type = STATUS_CHANGE_ORDER          ("Arrêté(s) portant changement de statut de fonctionnement (agrément/homologation)")
```

Chacun vit comme une ligne `establishment_registry_identifiers` séparée
(`registry = MINESUP_IPES`, `identifier_type` distinct) — **jamais fusionné**.
`raw_identifier` (texte intégral, jamais tronqué/reformaté) est le SEUL
champ fiable ; un `normalized_identifier` (ex. isoler `NN/NNNN/MINESUP`)
n'est PAS adopté à ce stade — format prouvé non stable sur l'échantillon
(préfixe "N°"/"n°"/absent, séparateur "/" vs "-", nombre de segments
variable, au moins une référence tronquée dans la source elle-même).

### 12.2 Uniqueness — RÉSULTAT ÉCHANTILLON

`sample_size = 20` (10 régions couvertes) : `creation_order` présent sur
10/20, `opening_authorization` présent sur 10/20 (corrélation parfaite
présence/absence dans cet échantillon), **0 collision** entre institutions
différentes sur les 10 valeurs non nulles. Un cas de ré-apparition de la
même institution sous deux régions (Access-HIPS) montre une référence
**identique** dans les deux occurrences — cohérent avec l'hypothèse
d'unicité, mais 10 valeurs sur 301 institutions (~3%) reste **insuffisant**
pour conclure à l'unicité nationale.

```
IDENTIFIER ASSESSMENT — creation_order_reference : LIKELY_UNIQUE (0 collision observée, cohérence cross-région confirmée) mais NON PROUVÉ à l'échelle nationale
STABLE OVER TIME : YES pour la valeur elle-même une fois émise (rien n'indique de ré-émission), UNKNOWN pour la garantie qu'un futur MINESUP-B élargi ne trouve pas de contre-exemple
SUITABLE AS REGISTRY IDENTIFIER : PARTIAL — fiable comme signal fort quand présent (EXACT_IDENTIFIER-grade), mais couvre au mieux ~50% des institutions listées (celles ayant une fiche détail ET un champ rempli) — ne peut PAS être la seule clé de dédoublonnage, le nom+géographie doit rester le mécanisme de repli pour l'autre moitié
```

### 12.3 source_record_id

`page_id` WordPress (ex. `8064`) — confirmé technique, **jamais** stocké
comme `official_identifier`. Conservé uniquement comme `source_record_id`
pour permettre un re-fetch ciblé d'une fiche précise lors d'un futur audit
ou d'une collecte réelle. Absent pour les entrées dont l'URL est un slug
`index.php/...` plutôt qu'un `?page_id=` — dans ce cas `source_record_id
= null`, jamais deviné depuis le slug.

### 12.4 Completeness proof — RÉSOLUTION PARTIELLE

Écart 304/301 (liste) vs "~430" (prose) **expliqué mais non résolu** :
les deux chiffres coexistent sur la même page MINESUP sans être
réconciliés par la source elle-même (voir source catalog pour le détail
complet). **Décision** : la LISTE (304 entrées, 301 institutions uniques)
est traitée comme extraite de façon exhaustive et auditée pour cette page
précise (`PASS_WITH_EXPLAINED_EXCLUSIONS`, structure de page entièrement
vérifiée : pas de pagination, pas d'AJAX, pas de section manquante) ; le
TOTAL "~430" ne sert plus jamais d'`expected_count`
(`EXPECTED_COUNT_UNKNOWN` pour le total global du Cameroun). Un futur
MINESUP-C devra soit trouver une source MINESUP alternative avec un total
structuré vérifiable, soit accepter `MANUAL_REVIEW_REQUIRED` en
permanence pour ce point.

### 12.5 Entity model — RECONFIRMÉ

Aucun changement : 1 institution listée = 1 `establishment`, aucune
subdivision campus/faculté observée ni pour les universités d'État
(§16 du source catalog, 11/11 confirmées, liens 100% externes) ni pour
les IPES échantillonnés.

### 12.6 Matching normalization — IMPLÉMENTÉE

`scripts/school-registry/lib/matching/engine.ts::exactIdentityKey`
normalise désormais les numéraux romains/arabes institutionnels isolés
(I↔1 … X↔10) — corrige le gap "Yaoundé I" (fiche live) vs "Yaoundé 1"
(MINESUP) identifié en MINESUP-A. Revalidé : le test réel
`minesup-matching-sample-test.ts` passe désormais de `AMBIGUOUS` à
`EXACT_IDENTITY` pour ce cas précis, sans introduire de faux positif sur
les autres candidats testés (IPES sans correspondance restent
`PROBABLE_MATCH`/`AMBIGUOUS`, jamais auto-fusionnés). 8 nouveaux tests de
régression ajoutés à `matching.test.ts` (27/27 passent).

### 12.7 PII exclusion — RENFORCÉE

Constat aggravant : le nom du promoteur peut apparaître **dans l'URL
elle-même** (slug WordPress), pas seulement dans un champ de contenu — un
futur collecteur devra donc aussi traiter `source_url` comme
potentiellement sensible avant tout affichage public brut (l'URL peut
rester en interne pour la traçabilité/re-fetch, mais ne devrait jamais
être affichée telle quelle sur une fiche publique Écoles237 sans
vérification). `pii_field_present` (booléen) est le seul signal collecté
sur la présence de "Nom du promoteur"/"Nom du représentant légal" — leur
VALEUR n'est jamais extraite ni committée (confirmé : le rapport
`minesup-b-identifier-and-completeness-audit.json` ne contient que des
booléens pour ces champs, jamais les noms eux-mêmes).

### 12.8 MINESUP V1 Acceptance Criteria

```
[ ] Écart de complétude IPES (304/301 liste vs ~430 prose) documenté et accepté comme EXPECTED_COUNT_UNKNOWN pour le total — la LISTE elle-même n'a pas besoin d'être "résolue" davantage, elle est déjà auditée.
[ ] Échantillon d'identifiants élargi (50-100 fiches, pas 20) confirmant LIKELY_UNIQUE à une échelle plus significative avant toute promotion contrôlée.
[ ] official_identifier JAMAIS requis pour le staging (couvre au mieux ~50% des IPES) — nom + région + ville reste le mécanisme de repli obligatoire.
[ ] PII (promoteur/représentant légal, y compris dans les URLs) exclue à 100% de tout champ collecté et de tout affichage public.
[ ] Catégorie higher_education validée sans migration (déjà le cas, RAS).
[ ] Matching validé sans faux positif sur un lot pilote réel (universités d'État + un échantillon d'IPES d'une région).
[ ] Dry-run staging propre (0 écriture) avant toute collecte réelle.
[ ] Pilote limité à une seule région avant toute collecte nationale.
[ ] QA publique (recherche/fiche établissement) vérifiée sur le pilote avant extension.
```

### 12.9 Décisions

```
MIGRATION 0021 : WAIT_FOR_MORE_EVIDENCE — le schéma texte ouvert (authority/registry/identifier/identifier_type) reste structurellement compatible (YES), mais imposer UNIQUE(registry, identifier) avant qu'un échantillon plus large (50-100 fiches) confirme LIKELY_UNIQUE à l'échelle nationale risquerait de bloquer un futur backfill sur une fausse collision. Réévaluer après un échantillon élargi, pas après ce sprint de 20 fiches.
BACKFILL TIMING : AFTER_MINESUP_PILOT — aucune donnée MINESUP réelle n'est en staging/production à ce jour ; le backfill MINESEC/cartescolaire existant peut attendre le premier pilote MINESUP réel pour être exécuté dans le même mouvement plutôt que deux fois.
NEXT COLLECTION DECISION : D — MORE SOURCE WORK REQUIRED (échantillon d'identifiants élargi à 50-100 fiches IPES, PAS un pilote de collecte complet) avant même un MINESUP-C pilote — l'échantillon de 20 fiches de ce sprint est suffisant pour comprendre la SÉMANTIQUE de l'identifiant, insuffisant pour garantir son UNICITÉ nationale.
```
