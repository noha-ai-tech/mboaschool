# Field Mapping — CHAMP SOURCE → CHAMP ÉCOLES237

Document produit dans le cadre de la mission DATA-REGISTRY-01 (fondation du répertoire national).
Diagnostic effectué sur la branche `chore/upgrade-next-security`, sans aucune modification de table.

---

## 1. État actuel du schéma `establishments` (diagnostic)

Source : `supabase/schema.sql`, `supabase/seed_schools.sql`, `supabase/migrations/0005_forfait_multi_etab.sql`,
et lecture directe du code applicatif (`src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/lib/useSchool.ts`).

| Colonne | Origine | Utilisée par l'annuaire public | Remarque |
|---|---|---|---|
| `id`, `owner_id`, `name`, `slug` | `schema.sql` | Oui | — |
| `main_category` | `schema.sql` (enum `garderie/primaire/secondaire/superieur/autres`) | Oui — filtre principal de l'annuaire | Catégorie produit, pas une classification ministérielle |
| `sub_category` | `schema.sql` (texte libre) | Oui — sous-filtre dépendant de `main_category` | Valeurs actuelles définies dans `CATEGORIES` (`src/app/page.tsx`), ex. "Lycée public", "Collège privé" |
| `ownership_type` | `schema.sql` (texte libre) | **Non — colonne présente mais jamais lue ni écrite par aucune page** | Cible naturelle pour recevoir la classification `ownership` de cette mission |
| `region`, `department`, `arrondissement` | `schema.sql` | Non affichées directement dans l'annuaire public actuel, mais présentes en base | Cibles naturelles pour la hiérarchie administrative source |
| `city` | `schema.sql` (obligatoire) | Oui — affichage et recherche texte | Concept "ville" (Yaoundé/Douala/...), pas un niveau administratif MINESEC |
| `neighborhood` | `schema.sql` | Oui, via `quartier ?? neighborhood` (`src/app/page.tsx:132`) | Coexiste avec `quartier` — les deux sont lues séparément, voir §2 |
| `quartier` | **[DÉRIVE]** `seed_schools.sql` (hors migration versionnée) | Oui — priorité sur `neighborhood` | Confirme le constat de `docs/00_CURRENT_STATE_AUDIT/05_DATABASE_CURRENT_STATE.md` |
| `latitude`, `longitude` | `schema.sql` | Oui — carte et calcul de distance | — |
| `is_verified`, `is_featured`, `is_claimed` | `schema.sql` / **[DÉRIVE]** `seed_schools.sql` | Oui | `is_claimed` reste non modifié par aucun flux applicatif (constat déjà documenté) |
| `forfait` | Migration `0005_forfait_multi_etab.sql` | Non (module Pro uniquement) | Sans lien avec cette mission |

**Aucun type TypeScript généré depuis Supabase n'existe dans ce dépôt** (`supabase gen types typescript` non utilisé) — confirmé par recherche exhaustive, aucun fichier `database.types.ts` ou équivalent trouvé. Le code s'appuie sur des `any` partout où `establishments` est manipulé.

---

## 2. Mapping canonique — MINESEC (Répertoire des Établissements ESG)

Source confirmée le 2026-08-07 : `https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg`
(voir `SOURCE_CATALOG.md` pour le détail complet de la vérification).

| Champ source (colonne affichée sur le site) | Champ canonique Écoles237 (staging) | Confiance | Note |
|---|---|---|---|
| Nom Établissement | `name_raw` → `name_normalized` (fingerprint) | Haute | Le nom brut est conservé intact ; seule une copie normalisée sert au dédoublonnage |
| Matricule | `official_identifier` | Haute quand présent | Absent sur une partie des lignes observées (2 des 3 lignes réelles consultées n'affichaient pas de matricule visible) |
| Localité | `locality` | Haute | Correspond conceptuellement à `quartier`/`neighborhood` d'Écoles237, mais à un niveau parfois plus proche d'une bourgade que d'un quartier urbain — à valider au cas par cas, pas une équivalence automatique |
| Cycles (ex. "Premier Cycle", "Premier et Second Cycles") | `education_family_hint` → classifié en `education_family` | Moyenne | Signal partiel — ne distingue pas général/technique de façon fiable à lui seul, voir §3 |
| Sous Système (Francophone/Anglophone/Bilingue) | `subsystem` | Haute | Mapping direct, 1:1 |
| **Région, Département, Arrondissement** | `region`, `department`, `arrondissement` | **Aucune — non disponible par ligne** | **Constat majeur** : ces trois champs sont des *critères de filtre* sur le site MINESEC (menus déroulants), **pas des colonnes affichées par établissement** dans le tableau de résultats consulté. Un import complet capturant cette hiérarchie nécessiterait d'itérer chaque combinaison de filtres (région × département × arrondissement) plutôt qu'un unique listing global — non implémenté dans cette mission (voir `IMPORT_RUNBOOK.md`, limitations connues) |
| *(aucune colonne visible)* | `commune` | Aucune | Non exposé par cette source sous cette forme ; à vérifier si un autre document MINESEC (publication annuelle PDF mentionnée par le décret RNE) l'inclut |
| *(aucune colonne visible)* | `city` | Aucune directe | Nécessiterait une table de correspondance département → ville principale (ex. Mfoundi → Yaoundé, Wouri → Douala), non construite dans cette mission — **ne pas inventer cette correspondance sans validation** |
| *(aucune colonne visible)* | `ownership` | **Très faible — indice uniquement** | Aucune colonne "public/privé" sur ce listing. Le texte de recherche (résultat web) mentionne que la liste précise "le nom du fondateur pour le privé" — signal exploitable mais non confirmé structurellement sur cette page précise. La logique de `lib/normalize.ts` (`inferOwnership`) déduit un indice à partir du nom (ex. "École Publique de..." → `public`) mais **ce n'est qu'une heuristique de faible confiance**, jamais une certitude |

---

## 3. Classification canonique — logique et limites

### `education_family`

La classification s'appuie **en premier lieu sur le ministère source** (signal fiable), puis affine avec le texte
brut de la source quand disponible (`education_family_hint`). Voir `scripts/school-registry/lib/normalize.ts`,
fonction `classifyEducationFamily`.

| Ministère | `education_family` par défaut | Nuance |
|---|---|---|
| MINEDUB | `basic` | Regroupe maternelle et primaire — Écoles237 distingue ces deux niveaux via `main_category` (`garderie` vs `primaire`), information qui devra être conservée séparément si MINEDUB est implémenté (voir `SOURCE_CATALOG.md`) |
| MINESEC | `secondary_general` par défaut ; `secondary_technical` ou `teacher_training` si l'indice textuel (cycles, nom) le suggère | **Le répertoire ESG consulté dans cette mission ne couvre que le général.** Aucune source MINESEC technique identifiée à ce stade |
| MINESUP | `higher_education` | — |
| MINEFOP | `vocational_training` | — |
| MINSANTE | `health_training` | — |
| MINADER | `agricultural_training` | — |
| MINEPIA | `livestock_fisheries_training` | — |
| MINFOF | `forestry_wildlife_training` | — |

### `ownership`

Aucune source consultée dans cette mission n'expose ce champ de façon structurée et fiable à 100 %. Toute valeur
calculée par `inferOwnership()` doit être traitée comme **une proposition à vérifier**, jamais comme une donnée
certaine — c'est la raison pour laquelle le statut `review` existe dans le pipeline de dédoublonnage et devra
également s'appliquer, à terme, à la confiance des champs individuels (amélioration non construite dans cette
mission, voir `IMPORT_RUNBOOK.md`).

### `subsystem`

Seul champ de classification à confiance haute pour MINESEC : mapping direct depuis la colonne "Sous Système"
(Francophone/Anglophone/Bilingue → valeurs canoniques identiques).

---

## 4. Ce qui n'est PAS mappé (principe : ne rien inventer)

Conformément à la consigne de la mission ("ne pas inventer une localisation absente de la source"), les champs
suivants restent `null` dans le staging tant qu'aucune source ne les fournit explicitement :

- `commune` (aucune source consultée ne l'expose distinctement)
- `city` pour les enregistrements MINESEC (nécessiterait une table de correspondance non construite)
- `region`, `department`, `arrondissement` pour un import MINESEC en mode "listing global" (nécessitent l'itération par filtre, non implémentée)

Ces champs ne sont **jamais remplis par déduction silencieuse** — un enregistrement avec ces champs vides reste
visible comme tel dans le rapport de qualité, pas masqué par une valeur inventée.
