# 01 — Audit du dashboard actuel (Phase 1)

Lecture seule — aucune modification à cette étape. Périmètre : `src/app/dashboard/ecole/*` (le "School
Operating Center" cible). `dashboard/admin/*` et le module Pro (`src/app/pro/*`) sont hors périmètre de
modification pour cette mission, seulement référencés comme points d'intégration.

---

## Composants et routes existants

| Route | Fichier | Données chargées | État |
|---|---|---|---|
| `/dashboard/ecole` | `page.tsx` | `applications` (20 dernières), `classes` — via `useSchool()` pour l'établissement | FONCTIONNEL — stats réelles (Demandes/En attente/Acceptées/Refusées), liste préinscriptions, liste classes, bannière Pro conditionnelle |
| `/dashboard/ecole/admissions` | `admissions/page.tsx` | `applications` complet | FONCTIONNEL |
| `/dashboard/ecole/classes`, `/classes/[id]` | — | `classes`, `school_announcements` (classe) | FONCTIONNEL |
| `/dashboard/ecole/annonces` | `annonces/page.tsx` | `school_announcements` | FONCTIONNEL |
| `/dashboard/ecole/frais` | `frais/page.tsx` | `fees` (upsert 1 ligne) | FONCTIONNEL |
| `/dashboard/ecole/infrastructure` | `infrastructure/page.tsx` | `infrastructures` (upsert 1 ligne) | FONCTIONNEL |
| `/dashboard/ecole/documents` | `documents/page.tsx` | `school_documents` + Storage `school-documents` | FONCTIONNEL |
| `/dashboard/ecole/galerie` | `galerie/page.tsx` | `school_images` + Storage `school-images` | FONCTIONNEL |
| `/dashboard/ecole/paiements` | `paiements/page.tsx` | Aucune | PLACEHOLDER ("Prochainement") |
| `/dashboard/ecole/parametres` | `parametres/page.tsx` | `establishments` (update) | FONCTIONNEL — infos principales + contact |
| `/dashboard/ecole/onboarding` | `onboarding/page.tsx` | `establishments` (insert) | FONCTIONNEL — hors nav (accès direct uniquement) |
| `/dashboard/ecole/selection` | `selection/page.tsx` | Aucune | ROUTE MORTE — redirige immédiatement vers `/dashboard/ecole` |

## Composant central : `useSchool()`

`src/lib/useSchool.ts` — hook client unique résolvant l'établissement de l'utilisateur connecté
(`establishments.owner_id = auth.uid()`). Utilisé par `layout.tsx` et `page.tsx`. Sélectionne un jeu de colonnes
fixe (`id, name, city, neighborhood, phone, email, whatsapp, website, description, address, main_category,
is_verified, subscription_plan, forfait`) — **ne remonte pas** `logo_url`, `cover_image_url`,
`verification_status` (nouvelle colonne, migration 0008 non exécutée), utile pour les nouveaux widgets de cette
mission (complétion de profil). Chaque page qui a besoin de colonnes supplémentaires refait sa propre requête
`establishments` (ex. `parametres/page.tsx` ne relit même pas `logo_url`/`cover_image_url` alors qu'elle
pourrait les éditer).

## Navigation actuelle (`layout.tsx`)

11 entrées plates, sans regroupement : Vue d'ensemble, Admissions, Classes, Annonces, Frais, Infrastructures,
Documents, Galerie, Paiements, Paramètres, Emplois du temps (lien direct vers `/pro/emplois-du-temps`, sans
vérifier `forfait` avant d'afficher le lien — le clic redirige vers `/pro/acces-restreint` si non-Pro, géré par
le middleware, mais le lien est visible même pour un forfait gratuit).

## Permissions

Toutes les pages `dashboard/ecole/*` sont protégées par le middleware (`/dashboard/:path*` → authentification
requise) puis résolvent l'établissement via `owner_id = auth.uid()` — jamais d'ID d'établissement dans l'URL,
donc pas de risque de fuite par manipulation d'URL (déjà confirmé dans l'audit de sécurité précédent). Ce
principe est strictement conservé par cette mission — aucun nouveau widget n'introduit d'ID d'établissement dans
une URL ou un paramètre.

## Performance

- `dashboard/ecole/page.tsx` : 2 requêtes en parallèle (`Promise.all`), correct.
- Aucune requête N+1 identifiée dans les pages existantes.
- Chaque page du dashboard revalide indépendamment `useSchool()` en interne (`layout.tsx`) ET certaines pages
  re-fetchent `establishments` elles-mêmes (`parametres`) — léger doublon de requête (établissement chargé deux
  fois : une fois par le layout pour la sidebar, une fois par la page pour le formulaire), non bloquant à
  l'échelle actuelle.

## Duplication identifiée

- Le bloc "Logo Écoles237" (bandeau vert/rouge/jaune) est redéfini indépendamment dans `layout.tsx`,
  `dashboard/admin/page.tsx`, et plusieurs autres fichiers du dépôt — déjà documenté comme dette technique
  (TD-006, audit précédent). Non retouché dans cette mission (respect de la consigne "aucun nouveau style,
  réutiliser l'existant" — dupliquer davantage n'est pas non plus souhaitable, mais une extraction de composant
  sort du périmètre strict de cette mission).
- Le calcul de statut de candidature (`pending`/`reviewing`/`accepted`/`rejected` → libellé + couleur) est dupliqué
  entre `dashboard/ecole/page.tsx` et `dashboard/ecole/admissions/page.tsx` (déjà présent avant cette mission,
  non modifié ici).

## Ce que cette mission NE modifie PAS

`admissions`, `classes`, `annonces`, `frais`, `infrastructure`, `documents`, `galerie`, `paiements` (contenu
inchangé — seuls les libellés/regroupements de navigation qui pointent vers ces routes évoluent, jamais leur
code interne). `onboarding` inchangée. Module Pro (`src/app/pro/*`) inchangé — uniquement référencé par des
liens depuis la nouvelle navigation.
