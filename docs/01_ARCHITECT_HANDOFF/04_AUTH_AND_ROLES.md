# 04 — Authentication and Roles

## 1. Mécanisme d'authentification

Supabase Auth, intégré via `@supabase/ssr` avec trois points d'entrée distincts dans le code :

| Client | Fichier | Clé utilisée | Usage |
|---|---|---|---|
| Navigateur | `src/lib/supabase.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tous les composants `"use client"` |
| Serveur (cookies) | `src/lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Server Components, API routes, layouts serveur |
| Serveur (admin) | `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | Uniquement `api/enseignants/[id]/inviter` et `auth/enseignant-bienvenue` — contourne volontairement le RLS pour lier un compte enseignant |

**Connexion** (`src/app/auth/connexion/page.tsx`) : `supabase.auth.signInWithPassword`, puis lecture de `profiles.role` pour rediriger vers `/dashboard/admin` ou `/dashboard/ecole`.

**Inscription** (`src/app/auth/inscription/page.tsx`) : `supabase.auth.signUp` avec `emailRedirectTo` vers `/auth/callback`. Le profil est créé automatiquement par le trigger Postgres `handle_new_user` (défini dans `auth-setup.sql`, puis redéfini dans `0003_comptes_enseignants.sql` pour gérer le rôle `teacher`).

**Callback** (`src/app/auth/callback/route.ts`) : échange le code contre une session, lit `profiles.role`, redirige :
- `platform_admin` → `/dashboard/admin`
- `teacher` → `/auth/enseignant-bienvenue`
- autres → `/dashboard/ecole`

## 2. Où le profil est chargé

- Côté client (dashboard école) : hook `src/lib/useSchool.ts`, appelé dans chaque page du dashboard école. Charge `auth.getUser()` puis l'établissement associé (`establishments.owner_id = auth.uid()`).
- Côté serveur (middleware, callback, layouts Pro/enseignant) : lecture directe de `profiles.role` ou de `establishments.owner_id`/`forfait` à chaque requête concernée.

Il n'existe **pas** de couche unique de résolution de session/rôle partagée entre client et serveur — chaque route reproduit sa propre requête. Ce n'est pas une faille en soi, mais c'est une duplication qui augmente le risque d'incohérence si la logique de rôle change un jour (voir `09_TECHNICAL_DEBT.md`).

## 3. Rôles réellement présents dans le code

Défini dans l'enum PostgreSQL `user_role` (`schema.sql`, étendu par `0003_comptes_enseignants.sql`) :

| Rôle | Déclaré | Assigné par du code réel | Utilisé pour un contrôle d'accès réel |
|---|---|---|---|
| `parent` | Oui | Oui — valeur par défaut de `handle_new_user` | Non (aucune route ne vérifie spécifiquement ce rôle) |
| `establishment_admin` | Oui (`schema.sql` ligne 4) | **Non — aucune occurrence d'assignation trouvée dans tout le dépôt** | Non — mort |
| `platform_admin` | Oui | NON VÉRIFIÉ DANS LE CODE comment ce rôle est assigné en base (aucun flux d'inscription ne le positionne — probablement fait manuellement dans Supabase) | **Oui** — `src/middleware.ts`, `auth/callback/route.ts`, `dashboard/page.tsx` |
| `teacher` | Oui (ajouté par `0003_comptes_enseignants.sql`) | Oui — `handle_new_user` si `raw_user_meta_data.role === 'teacher'` (positionné lors de l'invitation, `api/enseignants/[id]/inviter`) | Oui — redirection post-callback, mais pas de contrôle d'accès dédié sur `/enseignant/*` au niveau middleware |

**Constat important** : la distinction entre "école propriétaire" et "administrateur plateforme" ne repose **pas** sur le rôle `establishment_admin` prévu dans le schéma, mais sur la relation `establishments.owner_id = auth.uid()`. Le rôle du profil (`profiles.role`) reste `parent` pour un propriétaire d'école ordinaire. C'est un choix de conception cohérent avec le code observé, mais il diverge de ce que suggère le nom de l'enum `user_role` et de ce que documente `CLAUDE_CONTEXT.md` (qui distingue "École (autonome)" comme un rôle à part).

## 4. Protection des routes — middleware vs. page

Deux mécanismes coexistent, **sans registre central** qui les unifie :

### a) Middleware (`src/middleware.ts`, `config.matcher`)

Couvre : `/dashboard/:path*`, `/auth/:path*`, `/pro/:path*`, et une liste explicite de préfixes API Pro (`/api/timetable/`, `/api/pointage/`, `/api/messagerie/`, `/api/enseignants/`).

Logique :
- `/dashboard/*` → redirige vers `/auth/connexion` si non connecté.
- `/dashboard/admin/*` → vérifie `profiles.role === 'platform_admin'`, sinon redirige vers `/dashboard/ecole`.
- `/pro/*` (sauf `/pro/acces-restreint`) et les API Pro listées → vérifie `establishments.forfait === 'pro'` pour l'utilisateur connecté (par `owner_id`), sinon redirige/`403`.
- `/auth/*` si déjà connecté → redirige vers le bon dashboard.

Ce mécanisme est **correctement écrit** pour ce qu'il couvre : c'est un contrôle serveur (Edge Middleware), impossible à contourner en modifiant l'URL côté client seul.

### b) Vérification au niveau de la page (Server Component)

Utilisée pour `/enseignant/*` (`layout.tsx`, `mon-espace/page.tsx`) et redondante mais présente sur plusieurs pages Pro déjà couvertes par le middleware (ex. `pro/emplois-du-temps/page.tsx` revérifie `auth.getUser()` et l'établissement). Cette redondance n'est pas un problème de sécurité — c'est une défense en profondeur correcte — mais elle n'est **pas appliquée partout de façon homogène** : `/enseignant/*` n'a pas de garde middleware du tout, uniquement une garde de page.

### c) Ce qui n'est protégé nulle part au niveau page/middleware : les mutations Supabase elles-mêmes

C'est le point le plus important de cette section. Le middleware et les gardes de page protègent l'**accès à l'écran**. Ils ne protègent pas automatiquement les **appels Supabase** effectués depuis le navigateur avec la clé anonyme : ces appels ne sont sécurisés que par les **policies RLS** définies en base. Deux cas trouvés dans le code où cette distinction est concrètement à risque :

1. **`dashboard/admin/ecoles/[id]/page.tsx`** appelle `supabase.from("establishments").update(form).eq("id", id)` avec le client anonyme. Le middleware garantit qu'un `platform_admin` seul atteint cet écran — mais la policy RLS `UPDATE` sur `establishments` trouvée dans le dépôt (`schema.sql`) est `owner_id = auth.uid()`. Un admin plateforme n'est presque jamais le `owner_id` d'une école qu'il gère. **Deux issues possibles, non vérifiables sans accès à Supabase** : soit la mutation échoue silencieusement en production (fonctionnalité cassée malgré une UI qui semble fonctionner), soit une policy RLS supplémentaire existe en base sans être versionnée dans ce dépôt (dérive de schéma, voir `05_DATABASE_CURRENT_STATE.md`).
2. **`dashboard/ecole/parametres/page.tsx`** et les autres pages du dashboard école reposent correctement sur `owner_id = auth.uid()` — cohérent avec la policy connue.

## 5. Un utilisateur peut-il modifier l'URL pour accéder à une autre zone ?

- **Vers `/dashboard/admin` en étant un utilisateur ordinaire** : NON — bloqué par le middleware (redirection vers `/dashboard/ecole`).
- **Vers le dashboard d'une autre école en modifiant un ID dans l'URL** : les pages du dashboard école ne prennent pas d'ID d'établissement dans l'URL — elles résolvent toujours l'établissement via `owner_id = auth.uid()` (`useSchool.ts`). Une école ne peut donc pas atteindre les données d'une autre école simplement en changeant une URL, **à condition que les policies RLS lues dans ce dépôt soient bien celles appliquées en production** (NON VÉRIFIABLE).
- **Vers `/pro/*` sans le forfait Pro** : redirection vers `/pro/acces-restreint` par le middleware — cohérent.
- **Vers `/ecole/[id]` d'une autre école** : c'est une page publique par conception (fiche publique) — accès en lecture à toute fiche est normal et voulu.
- **Un enseignant vers l'espace d'une autre école** : `enseignants.user_id = auth.uid()` filtre les requêtes ; le multi-établissement est géré explicitement via le paramètre `?eid=` mais toujours filtré par les lignes `enseignants` réellement liées à cet utilisateur (`mon-espace/page.tsx`, ligne ~20-40).

## 6. Confusion authentification / autorisation

Pas de confusion structurelle observée : `auth.getUser()` est systématiquement utilisé pour authentifier, et une requête distincte (`owner_id`, `role`, `forfait`) est systématiquement utilisée pour autoriser. Le seul point de vigilance réel reste le §4c ci-dessus (protection de page ≠ garantie sur la mutation).

## 7. Synthèse des lacunes

| Constat | Fichier(s) | Gravité | Type |
|---|---|---|---|
| Écriture admin sur `establishments` sans policy RLS connue pour `platform_admin` | `dashboard/admin/ecoles/[id]/page.tsx`, `schema.sql` | Élevé | Sécurité/fonctionnel |
| `/enseignant/*` hors du matcher middleware | `middleware.ts`, `enseignant/layout.tsx` | Faible (protection de page présente) | Cohérence architecturale |
| Lien de déconnexion mort (`/auth/signout` inexistant) | `enseignant/layout.tsx` | Faible | Fonctionnel |
| Rôle `establishment_admin` déclaré mais mort | `schema.sql` | Faible | Dette |
| Assignation de `platform_admin` non tracée dans le code | Tout le dépôt | NON VÉRIFIABLE | Documentation manquante |
