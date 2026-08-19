# Multi-Registry Contract — Écoles237

SPRINT REGISTRY-MULTI-A, 2026-08-19. Opérateur : jean-merlain. Contrat
commun pour tout futur collecteur de registre institutionnel
(MINESUP/MINEFOP/MINSANTE/Ministère des Transports), factorisant les
enseignements de MINESEC V1 + Major Cities V1 + l'audit cartescolaire
(MINESEC V1.1). Ce document ne duplique pas
`NATIONAL_REGISTRY_ARCHITECTURE.md` (architecture générale) ni
`REGISTRY_EXTRACTION_SAFETY.md` (politique d'extraction, obligatoire et
inchangée) — il définit le contrat entre un futur collecteur et le reste du
pipeline.

## 1. Authority vs Registry — ne pas confondre

Découverte structurante de SPRINT MINESEC V1.1 : une seule autorité
(MINESEC) opère déjà **deux registres incompatibles** (MINESEC_ESG à 17
caractères, MINESEC_CARTESCOLAIRE à préfixe alpha/digit — zéro
recouvrement direct d'identifiant, confirmé par comparaison directe). Un
futur ministère peut faire de même.

```
AUTHORITY  — l'institution émettrice (MINESEC, MINESUP, MINEFOP, MINSANTE, MINTRANSPORT*)
REGISTRY   — un système d'identifiants PRÉCIS au sein d'une autorité (ex. MINESEC_ESG)
IDENTIFIER — la valeur brute dans ce registre
```

`*` MINTRANSPORT n'existe pas encore dans l'enum Postgres
`registry_source_ministry` — voir
`scripts/school-registry/lib/registryAuthority.ts` pour la constante
interne stable utilisable avant sa propre migration.

**Règle d'unicité** : `UNIQUE(registry, identifier)`, jamais
`UNIQUE(identifier)` seul. Deux registres différents peuvent légitimement
émettre la même chaîne de caractères sans désigner le même établissement.

## 2. Provenance — trois notions distinctes, jamais confondues

```
DISCOVERY SOURCE            — où l'établissement a été trouvé la première fois
CORROBORATION SOURCE        — une source indépendante qui confirme son existence/identité
OFFICIAL REGISTRY IDENTIFIER — un identifiant émis par une autorité gouvernementale
```

Exemple réel (SPRINT R.3.2) : une école découverte sur
`memoirelittoral0.jimdofree.com` (discovery, Tier 3) puis corroborée par
`cartescolaire.cm/minesec` (corroboration officielle) reste enregistrée
avec `source_ministry = 'OTHER'` et `source_url` pointant vers la source de
découverte — **jamais réécrite** vers `source_ministry = 'MINESEC'` du
simple fait de la corroboration. La corroboration est une preuve
complémentaire, pas un remplacement de provenance (cohérent avec le
principe absolu de traçabilité, `NATIONAL_REGISTRY_ARCHITECTURE.md` §1).

Représentation actuelle (avant migration 0021) : `source_url`/
`source_reference` sur `establishments` ne portent QUE la provenance de
découverte ; la corroboration vit en texte libre dans `source_reference`
(ex. `"Corroboration officielle : cartescolaire.cm/minesec matricule
14280735..."`). Après la migration 0021 (si exécutée), chaque
identifiant de corroboration devient une ligne structurée dans
`establishment_registry_identifiers`, avec son propre `source_url` — sans
toucher au `source_url` de découverte sur `establishments`.

## 3. Contrat de collecteur

Chaque futur collecteur (`scripts/school-registry/sources/minesup.ts`,
`minefop.ts`, `minsante.ts`, et un futur `mintransport.ts`) doit produire un
résultat contenant AU MINIMUM :

| Champ | Déjà couvert par | Note |
|---|---|---|
| source authority | `RawSourceRecord.sourceMinistry` (types.ts) | Existant |
| source registry | **NOUVEAU** — pas encore dans `RawSourceRecord` | À ajouter au type si un ministère expose plusieurs registres (cas non certain avant l'audit du ministère) |
| source URL | `RawSourceRecord.sourceUrl` | Existant |
| fetched_at | `SourceSnapshotMetadata.fetched_at` (extraction/sourceSnapshot.ts) | Existant, R.2-SAFETY |
| raw snapshot | `writeSourceSnapshot()` | Existant, R.2-SAFETY |
| SHA256 | `SourceSnapshotMetadata.content_sha256` | Existant, R.2-SAFETY |
| parser_version | `ExtractionResult.parserVersion` | Existant, R.2-SAFETY |
| completeness verdict | `evaluateCompleteness()` | Existant, R.2-SAFETY — **obligatoire, fail-closed** |
| extraction method | `ExtractionResult.aiAssistance` (used/purpose) | Existant, R.2-SAFETY |
| source record identifier | `RawSourceRecord.officialIdentifier` | Existant |
| raw name | `RawSourceRecord.nameRaw` | Existant |
| normalized name | `NormalizedStagingRecord.nameNormalized` (lib/normalize.ts) | Existant |
| official identifier(s) | `RawSourceRecord.officialIdentifier` (UN SEUL champ aujourd'hui) | **LIMITE** — un registre qui expose plusieurs identifiants par établissement (peu probable mais pas exclu) nécessiterait `officialIdentifiers: RegistryIdentifierCandidate[]`, non implémenté — à réévaluer si un ministère réel le justifie, ne pas anticiper sans preuve |
| geography raw/normalized | `RawSourceRecord.region/department/...` + `normalizeRecord()` | Existant |
| category raw/normalized | `RawSourceRecord.educationFamilyHint` + `registry_education_family` (11 valeurs, déjà anticipe MINESUP='higher_education', MINEFOP='vocational_training', MINSANTE='health_training' — voir §4) | Existant |
| source metadata | `RawSourceRecord.raw` (jsonb intact) | Existant |
| warnings | `ExtractionResult.warnings` | Existant |

**Conclusion** : le contrat existant (`RawSourceRecord` + `ExtractionResult`
+ `NormalizedStagingRecord`) couvre déjà la quasi-totalité des besoins. Pas
de framework à reconstruire. Deux extensions POSSIBLES mais NON faites
(pas de besoin confirmé) :
1. un champ `sourceRegistry` explicite si un futur ministère confirme
   plusieurs registres (ne pas l'ajouter avant qu'un cas réel se présente) ;
2. un tableau d'identifiants multiples par ligne source (idem).

## 4. Catégories — ne pas forcer dans la taxonomie MINESEC

`registry_education_family` (staging, 11 valeurs) anticipe DÉJÀ MINESUP
(`higher_education`), MINEFOP (`vocational_training`), MINSANTE
(`health_training`) — voir `supabase/migrations/0006_national_registry_staging.sql`.
**Aucune migration nécessaire pour ces trois.** Le Ministère des Transports
n'a pas de valeur dédiée — retomberait sur `'other'` jusqu'à son propre
audit (SPRINT non planifié), conforme à la consigne de ne pas inventer sa
taxonomie par avance.

`establishments.main_category` (produit, 5 valeurs : garderie/primaire/
secondaire/superieur/autres) reste volontairement plus grossier — la
fonction `toMainCategory()` (répétée dans chaque script `promote-*.ts`,
candidate à factorisation, voir §6) absorbe déjà toute nouvelle
`education_family` dans `'autres'` par défaut, sans migration.

## 5. Matrice de déduplication inter-ministères

| Situation | Résultat |
|---|---|
| même `(registry, identifier)` | **SAME RECORD** — vérifier absence de conflit sur les autres champs, jamais fusionner silencieusement une divergence (ex. région différente = anomalie à investiguer, pas à ignorer) |
| `identifier` texte identique, `registry` différent | **coïncidence, aucun signal** — espaces de nommage distincts (§1) |
| autorités différentes + preuve d'identité forte (nom exact + géographie + catégorie cohérents) | **POSSIBLE SAME ESTABLISHMENT** — `STRONG_MATCH`, revue humaine ou rattachement prudent selon le niveau de preuve, jamais une fusion automatique |
| même nom seul | `PROBABLE_MATCH` ou `AMBIGUOUS` selon le chevauchement — **REVIEW**, jamais un signal suffisant seul |
| nom + ville + catégorie cohérents | signal FORT mais **pas une fusion automatique** — reste `STRONG_MATCH`, une décision humaine ou une règle explicite documentée reste nécessaire |
| géographie contradictoire | **REVIEW / conflit possible** — jamais ignoré, jamais résolu par préférence arbitraire d'une source sur l'autre |

Implémenté et testé : `scripts/school-registry/lib/matching/engine.ts` +
`__tests__/matching.test.ts` (19 tests, scénarios A-I de la spec
REGISTRY-MULTI-A).

## 6. Matching — module partagé, plus une logique par script

Audit (§4/§12) : 29 fichiers de `scripts/school-registry/` référencent
`official_id`/`official_identifier`. Chaque script `promote-*.ts` (MINESEC
final, Batch Q, Master V1 approuvé, Major Cities contrôlé, Major Cities
R.3.2 — au moins 5 implémentations indépendantes) recalculait sa propre
clé de correspondance exacte/floue, avec un bug réel trouvé et corrigé deux
fois séparément (SPRINT R.3 puis re-détecté en écrivant ce module :
`extractTableFirstColumn`-style stripping de mots de catégorie faussant les
clés exactes — voir `engine.ts`, section "Briques").

**Recommandation appliquée dans ce sprint** : `lib/matching/engine.ts`
centralise `exactIdentityKey`, `fuzzyWords`, `matchCandidate`,
`findIdentifierCollisions`. Les scripts de promotion EXISTANTS n'ont PAS
été réécrits pour l'utiliser (hors périmètre — "ne pas réécrire tous les
anciens scripts si une couche de compatibilité suffit", §24) : ils
continuent de fonctionner tels quels. Tout NOUVEAU script de promotion
(MINESUP, etc.) doit importer ce module plutôt que réimplémenter sa propre
version.

## 7. Staging — évaluation

**STAGING_REUSABLE_AS_IS** pour la quasi-totalité des besoins.

Justification :
- `source_ministry` (enum) couvre déjà MINESUP/MINEFOP/MINSANTE — seul
  MINTRANSPORT manque, migration triviale (`ALTER TYPE ... ADD VALUE`) le
  jour venu, non exécutée ici.
- `education_family` (enum, 11 valeurs) couvre déjà les trois prochains
  ministères sans migration.
- `official_identifier` (text, nullable) reste valable comme identifiant
  "principal" de collecte — le modèle multi-ID (`establishment_registry_
  identifiers`, côté `establishments`, pas `staging`) vient EN PLUS, pas en
  remplacement, pour le cas où un établissement déjà en staging accumule
  ensuite une corroboration d'un second registre après promotion.
- `raw_data` (jsonb) absorbe toute variation de structure source sans
  migration.

Aucune extension de schéma staging identifiée comme nécessaire pour
MINESUP/MINEFOP/MINSANTE. À réévaluer spécifiquement pour Transport si son
propre audit révèle un besoin structurel différent (ex. véhicules/permis
plutôt qu'établissements physiques — hors du modèle actuel).
