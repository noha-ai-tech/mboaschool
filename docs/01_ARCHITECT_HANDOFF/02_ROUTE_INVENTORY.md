# 02 — Route Inventory

Source : arborescence `src/app`, `src/middleware.ts`, sortie de `npm run build` (37 routes compilées, confirmant qu'aucune route n'est orpheline au sens de la compilation).

Légende accès : **Public** = aucune vérification ; **Middleware** = bloqué/redirigé par `src/middleware.ts` avant même le rendu ; **Page** = vérifié dans le composant serveur de la page elle-même (pas de garantie au niveau middleware) ; **Aucun** = ni middleware ni vérification trouvée dans le fichier.

| Route | Fichier | Accès | Rôle attendu | Source de données | État | Risque |
|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Public | Parent/visiteur | `establishments`, `fees`, `infrastructures`, `school_images` (via client anon) | FONCTIONNEL | Faible |
| `/categorie/[slug]` | `src/app/categorie/[slug]/page.tsx` | Public | Parent/visiteur | `establishments` filtré par `main_category` | FONCTIONNEL | Faible |
| `/ecole/[id]` | `src/app/ecole/[id]/page.tsx` (+ `layout.tsx` pour les métadonnées) | Public | Parent/visiteur | `establishments`, `fees`, `infrastructures`, `school_images`, `school_documents`, `school_announcements` | FONCTIONNEL | Faible |
| `/preinscription` | `src/app/preinscription/page.tsx` | Public | Parent | Insertion dans `applications` (colonnes non toutes présentes dans les migrations versionnées, voir `05`) | PARTIEL | Moyen — dépend de colonnes non tracées |
| `/auth/connexion` | `src/app/auth/connexion/page.tsx` | Middleware (redirige si déjà connecté) | Tous | `auth.signInWithPassword`, lecture `profiles.role` | FONCTIONNEL | Faible |
| `/auth/inscription` | `src/app/auth/inscription/page.tsx` | Middleware (redirige si déjà connecté) | École (autonome) | `auth.signUp` | PARTIEL | Moyen — le paramètre `?ecole=` transmis depuis "Revendiquer cette page" n'est jamais lu ; aucune revendication réelle |
| `/auth/callback` | `src/app/auth/callback/route.ts` | Public (route technique) | Tous | Échange code OAuth/email, lecture `profiles.role`, redirection par rôle | FONCTIONNEL | Faible |
| `/auth/enseignant-bienvenue` | `src/app/auth/enseignant-bienvenue/page.tsx` | Page (redirige si non connecté) | Enseignant | Client **admin** Supabase pour lier `enseignants.user_id` | FONCTIONNEL | Moyen — utilise la clé service role côté serveur ; logique correcte mais critique si dupliquée ailleurs |
| `/dashboard` | `src/app/dashboard/page.tsx` | Page (redirige si non connecté) | Tous connectés | `profiles.role` | FONCTIONNEL | Faible |
| `/dashboard/admin` | `src/app/dashboard/admin/page.tsx` | **Middleware** (`platform_admin` requis) | Admin plateforme | `establishments` (lecture) | FONCTIONNEL (lecture) | Faible |
| `/dashboard/admin/ecoles/[id]` | `src/app/dashboard/admin/ecoles/[id]/page.tsx` | **Middleware** (hérite de `/dashboard/admin`) | Admin plateforme | `establishments` (lecture **et écriture** via client anonyme) | PARTIEL / NON VÉRIFIABLE | **Élevé** — aucune policy RLS `UPDATE` connue pour `platform_admin` sur `establishments` ; l'écriture peut échouer silencieusement en prod |
| `/dashboard/ecole` | `src/app/dashboard/ecole/page.tsx` (+ `layout.tsx`) | Middleware (authentifié) | École (owner) | `applications`, `classes` filtrés par `establishment_id` | FONCTIONNEL | Faible |
| `/dashboard/ecole/admissions` | `.../admissions/page.tsx` | Middleware (authentifié) | École (owner) | `applications` (lecture/écriture statut + notes) | FONCTIONNEL | Faible — dépend des colonnes non tracées de `applications` |
| `/dashboard/ecole/classes` | `.../classes/page.tsx` | Middleware (authentifié) | École (owner) | `classes` (CRUD) | FONCTIONNEL | Faible |
| `/dashboard/ecole/classes/[id]` | `.../classes/[id]/page.tsx` | Middleware (authentifié) | École (owner) | `classes`, `school_announcements` (avec `class_id`, `type` — non tracés) | PARTIEL | Moyen — colonnes non documentées |
| `/dashboard/ecole/frais` | `.../frais/page.tsx` | Middleware (authentifié) | École (owner) | `fees` (upsert manuel) | FONCTIONNEL | Faible |
| `/dashboard/ecole/infrastructure` | `.../infrastructure/page.tsx` | Middleware (authentifié) | École (owner) | `infrastructures` (upsert manuel) | FONCTIONNEL | Faible |
| `/dashboard/ecole/galerie` | `.../galerie/page.tsx` | Middleware (authentifié) | École (owner) | `school_images` + Storage bucket `school-images` | FONCTIONNEL | Faible |
| `/dashboard/ecole/documents` | `.../documents/page.tsx` | Middleware (authentifié) | École (owner) | `school_documents` + Storage bucket `school-documents` | FONCTIONNEL | Faible |
| `/dashboard/ecole/annonces` | `.../annonces/page.tsx` | Middleware (authentifié) | École (owner) | `school_announcements` (`is_important` non tracé) | PARTIEL | Faible-Moyen |
| `/dashboard/ecole/paiements` | `.../paiements/page.tsx` | Middleware (authentifié) | École (owner) | Aucune — écran statique | ABSENT (placeholder "Prochainement") | Faible |
| `/dashboard/ecole/parametres` | `.../parametres/page.tsx` | Middleware (authentifié) | École (owner) | `establishments` (update) | FONCTIONNEL | Faible |
| `/dashboard/ecole/onboarding` | `.../onboarding/page.tsx` | Middleware (authentifié) | École (owner, première connexion) | Insertion `establishments` | FONCTIONNEL mais crée toujours une **nouvelle** fiche | Moyen — pas de vérification anti-duplication, pas de lien avec une fiche existante |
| `/dashboard/ecole/selection` | `.../selection/page.tsx` | Middleware (authentifié) | École | Aucune — redirige immédiatement vers `/dashboard/ecole` | Route morte / vestige | Faible |
| `/enseignant/mon-espace` | `src/app/enseignant/mon-espace/page.tsx` (+ `layout.tsx`) | **Page uniquement** (pas de middleware — hors matcher) | Enseignant | `enseignants`, RPC `calculer_heures_enseignant`, `pointages` | FONCTIONNEL | Moyen — protection incohérente avec le reste (middleware absent, dépend uniquement du contrôle serveur de la page) |
| `/pro/emplois-du-temps` | `src/app/pro/emplois-du-temps/page.tsx` (+ `layout.tsx`) | **Middleware** (`forfait = 'pro'`) | École (owner, forfait Pro) | `establishments`, `classes`, `matieres`, `emplois_du_temps` | FONCTIONNEL | Faible |
| `/pro/matieres` | `src/app/pro/matieres/page.tsx` | Middleware (forfait Pro) | École (owner) | `matieres`, `matieres_volume_horaire` | PARTIEL — non lu ligne à ligne dans cet audit | Faible |
| `/pro/parametres/emploi-du-temps` | `.../parametres/emploi-du-temps/page.tsx` | Middleware (forfait Pro) | École (owner) | `contraintes_etablissement` | PARTIEL — non lu ligne à ligne | Faible |
| `/pro/enseignants` | `src/app/pro/enseignants/page.tsx` | Middleware (forfait Pro) | École (owner) | `enseignants` | FONCTIONNEL | Faible |
| `/pro/enseignants/nouveau` | `.../enseignants/nouveau/page.tsx` | Middleware (forfait Pro) | École (owner) | POST `/api/enseignants/creer` | PARTIEL — non lu ligne à ligne | Faible |
| `/pro/pointage/kiosque` | `.../pointage/kiosque/page.tsx` | **Middleware exclut cette route explicitement dans son commentaire — à vérifier** (voir remarque ci-dessous) | École (mode kiosque partagé) | Caméra navigateur + POST `/api/pointage/enregistrer` | FONCTIONNEL | Moyen — écran destiné à être affiché publiquement en établissement, protection à revalider |
| `/pro/pointage/historique` | `.../pointage/historique/page.tsx` | Middleware (forfait Pro) | École (owner) | `pointages`, RPC `calculer_heures_enseignant` | PARTIEL — non lu ligne à ligne | Faible |
| `/pro/messagerie` | `src/app/pro/messagerie/page.tsx` | Middleware (forfait Pro) | École (owner) | `messages`, `matieres` (départements) | FONCTIONNEL | Faible |
| `/pro/acces-restreint` | `src/app/pro/acces-restreint/page.tsx` | Public (exclu explicitement du middleware `/pro/*` pour éviter une boucle infinie) | Tous | Aucune | FONCTIONNEL | Faible |
| `/api/enseignants/creer` | `src/app/api/enseignants/creer/route.ts` | **API — vérification manuelle dans le handler** (auth + owner_id) | École (owner) | `enseignants` (insert), génère un code de pointage unique | FONCTIONNEL | Faible |
| `/api/enseignants/[id]/inviter` | `.../[id]/inviter/route.ts` | API — vérification manuelle (auth + owner_id + appartenance enseignant→établissement) | École (owner) | `admin.auth.admin.inviteUserByEmail` (clé service role) | FONCTIONNEL | Faible — bien scopé |
| `/api/messagerie/envoyer` | `src/app/api/messagerie/envoyer/route.ts` | **Middleware** + vérification manuelle | École (owner) | `messages` (insert) | FONCTIONNEL | Faible |
| `/api/pointage/enregistrer` | `src/app/api/pointage/enregistrer/route.ts` | **Middleware** + vérification manuelle | École (session kiosque) | `pointages` (insert) + Storage `pointages-photos` | FONCTIONNEL | Faible |
| `/api/timetable/generate` | `src/app/api/timetable/generate/route.ts` | **Middleware** + vérification manuelle | École (owner, forfait Pro) | `contraintes_etablissement`, génère `emplois_du_temps` | PARTIEL — logique de génération non auditée en détail | Faible |

## Routes mortes, orphelines ou à vide constatées

- **`/dashboard/ecole/selection`** : ne fait qu'une redirection immédiate vers `/dashboard/ecole`. Vestige d'un ancien flux multi-établissement pour les écoles (à distinguer du sélecteur multi-établissement **enseignant**, qui lui est actif).
- **`/auth/signout`** référencée par un `<form action="/auth/signout">` dans `src/app/enseignant/layout.tsx` — **cette route n'existe pas dans le dépôt**. Le bouton "Déconnexion" de l'espace enseignant est cassé (404 attendu).
- **Liens `#` dans l'admin** : dans `src/app/dashboard/admin/ecoles/[id]/page.tsx`, les liens "Documents" et "Galerie" de la barre latérale pointent vers `href="#"` — non implémentés.
- **`/enseignant/*` hors du matcher du middleware** (`src/middleware.ts`, `config.matcher`) — protection uniquement au niveau de chaque page/layout serveur, pas au niveau middleware. Incohérent avec le reste de l'application mais pas nécessairement une faille (la vérification serveur existe bel et bien).

## Remarque sur `/pro/pointage/kiosque`

Le commentaire du middleware indique que seule `/pro/acces-restreint` est explicitement exclue de la protection `/pro/*`. `/pro/pointage/kiosque` reste donc soumise à la même règle que les autres routes Pro (authentification + `forfait = 'pro'`). Or un kiosque de pointage est généralement destiné à rester ouvert sur un poste partagé dans l'établissement (accès répété par différents enseignants via leur code, pas via une session individuelle) — le modèle d'accès actuel (session du **propriétaire** de l'établissement) mérite d'être revalidé avec le fondateur : NON VÉRIFIÉ si le comportement observé correspond à l'usage réel prévu.
