# 07 — Code Quality

## Commandes exécutées

| Commande | Résultat | Détail |
|---|---|---|
| `npm install` | ✅ Réussi | 129 paquets, aucune erreur d'installation (avertissements `npm audit` séparés, voir `06_SECURITY_AUDIT.md`) |
| `npm run lint` (`next lint`) | ⚠️ Non exécutable tel quel | Le dépôt ne contient **aucun fichier de configuration ESLint** (`.eslintrc*`). `next lint` démarre un assistant interactif de création de configuration ("Strict (recommended)" / "Base" / "Cancel"), qui ne peut pas être complété sans modifier le dépôt (créer un fichier de config) — hors périmètre de cet audit ("ne modifier aucun fichier applicatif"). **Lint jamais exécuté avec succès dans cet audit.** |
| `npm run typecheck` | ❌ Script inexistant | `package.json` ne définit pas de script `typecheck` |
| `npx tsc --noEmit` (équivalent manuel, exécuté en lecture seule, aucun fichier généré committé) | ✅ Réussi | Aucune erreur TypeScript sur l'ensemble du projet |
| `npm run test` | ❌ Script inexistant | `package.json` ne définit pas de script `test`, aucun fichier de test applicatif dans le dépôt |
| `npm run build` (`next build`) | ✅ Réussi | 37 routes compilées (voir liste complète dans `02_ROUTE_INVENTORY.md`), aucune erreur de build ni de type bloquante. Avertissements webpack mineurs sur la taille du cache (non bloquants). |

## Analyse statique manuelle

### Usage de `any`
19 occurrences de `: any` recensées dans 7 fichiers (`grep -R ": any\b" src`), notamment :
- `src/app/api/timetable/generate/route.ts` (3)
- `src/app/ecole/[id]/page.tsx` (6 — `useState<any>` pour `school`, `fees`, `infra`, listes d'images/documents)
- `src/app/dashboard/ecole/admissions/page.tsx` (3)
- `src/app/page.tsx`, `src/app/pro/emplois-du-temps/page.tsx`, `dashboard/ecole/documents`, `dashboard/ecole/galerie` (1 chacun)

Constat : `any` est utilisé quasi systématiquement pour les résultats bruts de requêtes Supabase (`useState<any>`, `useState<any[]>`) plutôt que pour des types dérivés des tables. C'est cohérent avec l'absence de génération de types Supabase (`supabase gen types typescript` n'est utilisé nulle part dans le dépôt) — aucun fichier `database.types.ts` ou équivalent trouvé.

### `eslint-disable`
Une seule occurrence dans tout `src/`, dans `src/components/LocalSchoolMap.tsx` (`// eslint-disable-next-line react-hooks/exhaustive-deps`), un fichier ajouté récemment pour la carte de l'accueil. Ce n'est pas un signe de contournement généralisé.

### `TODO` / `FIXME` / marqueurs de contenu à vérifier
Aucun `TODO`/`FIXME` trouvé. En revanche, 5 fichiers contiennent des marqueurs **"À VÉRIFIER"** en commentaire — mais il s'agit de données de contenu (numéros de téléphone fictifs dans `seed_schools.sql`), pas de dette technique de code.

### Composants volumineux / logique métier dans l'UI
Plusieurs pages dépassent 300-600 lignes et mélangent requêtes Supabase, état local et rendu dans un seul composant client (`src/app/page.tsx` ~900 lignes, `src/app/ecole/[id]/page.tsx` ~615 lignes, `src/app/categorie/[slug]/page.tsx`). Ce n'est pas un défaut bloquant pour un MVP, mais c'est une source de duplication réelle : le composant `Logo` (bandeau vert/rouge/jaune + icône `School`) est redéfini **indépendamment dans au moins 8 fichiers** (`page.tsx`, `auth/connexion`, `auth/inscription`, `dashboard/admin/page.tsx`, `dashboard/ecole/layout.tsx`, `pro/layout.tsx`, `pro/acces-restreint/page.tsx`, `enseignant/layout.tsx`) au lieu d'être un composant partagé unique.

### Appels Supabase côté client qui pourraient être côté serveur
La majorité des pages du dashboard école et de l'admin utilisent le client navigateur (`src/lib/supabase.ts`) pour lire et écrire des données, y compris pour des opérations sensibles (mise à jour du statut d'une candidature, mise à jour d'un établissement par l'admin). Ce n'est pas incorrect en soi avec Supabase (le RLS est censé être la barrière de sécurité, pas la localisation du code), mais cela **reporte 100% de la charge de sécurité sur les policies RLS** — voir R-001 dans `06_SECURITY_AUDIT.md` pour le cas concret où cette dépendance devient un risque.

### Gestion d'erreur et états de chargement
Globalement cohérente : la quasi-totalité des pages ont un état `loading` avec squelette (`animate-pulse`) et un état vide explicite ("Aucun résultat", "Aucune photo publiée", etc.). Les erreurs Supabase sont généralement capturées (`if (error) ...`) mais **rarement affichées à l'utilisateur au-delà d'un message générique** — par exemple `dashboard/admin/ecoles/[id]/page.tsx` ignore silencieusement le contenu de `error` retourné par `update()` (il vérifie seulement `if (!error)` pour afficher la confirmation, sans jamais afficher `error.message` si la mise à jour échoue).

### Duplication de logique
- La logique de calcul de distance (`haversineKm`) est définie une seule fois dans `page.tsx` et n'est pas partagée avec `categorie/[slug]/page.tsx` (qui n'a pas de fonctionnalité de distance) — pas un problème actuellement, mais un signal qu'il n'existe pas de dossier `lib/geo.ts` partagé.
- Les formulaires de type "upload fichier vers Storage puis insert en base" sont dupliqués presque à l'identique entre `dashboard/ecole/galerie/page.tsx` et `dashboard/ecole/documents/page.tsx` (structure très proche, bucket différent).

### Problèmes d'encodage constatés
Plusieurs fichiers contiennent des caractères accentués corrompus (mojibake), signe d'un enregistrement dans un encodage incorrect à un moment donné :
- `src/app/api/timetable/generate/route.ts` ("Non authentifi�", "�tablissement")
- `supabase/migrations/0001_timetable_schema.sql` (commentaires d'en-tête)

Sans impact fonctionnel (les chaînes utilisées dans la logique semblent correctes), mais impact réel sur les messages d'erreur affichés à l'utilisateur final dans au moins un cas.

## Synthèse

| Axe | Constat |
|---|---|
| Compilation | ✅ Propre (`tsc --noEmit` et `next build` réussissent) |
| Lint | ⚠️ Jamais exécutable en l'état — configuration absente |
| Tests | ❌ Absents |
| Typage | Fonctionnel mais dépend beaucoup de `any` sur les données Supabase — pas de types générés |
| Duplication | Réelle sur le composant Logo et les flux d'upload — gérable, pas critique |
| Encodage | Deux fichiers avec des caractères corrompus à corriger |
