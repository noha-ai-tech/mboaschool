# Dossier de transmission — Architecte produit/logiciel Écoles237

Ce document synthétise l'audit d'état actuel (`docs/00_CURRENT_STATE_AUDIT/`, 15 fichiers) pour un architecte
qui n'a pas participé à l'audit. Il ne remplace pas les documents source — il les indexe et les met en relation.
Chaque affirmation ci-dessous est traçable à un document source cité entre parenthèses. Rien n'a été inventé ou
extrapolé au-delà de ce que les documents source établissent déjà.

**Aucun fichier applicatif n'a été modifié pour produire ce dossier. Aucune migration exécutée. Aucun déploiement.**

---

## A. Identité du dépôt

| Champ | Valeur |
|---|---|
| Nom du projet | Écoles237 |
| Ancien nom | MboaSchool — aucune trace dans le dépôt actuel (renommage complet, voir `10_RENAME_MBOASCHOOL_TO_ECOLES237.md` dans l'audit complet) |
| Nom interne (`package.json`) | `ecoles237-mvp` |
| Branche analysée | `main` |
| Commit analysé | `045a2d8f78886e821e6150510373849e61f66c7d` (2026-07-24) — "Formulaire de recherche enrichi, carte géolocalisée façon Airbnb, résultats groupés par catégorie" |
| Date de l'audit | 2026-07-25 |
| Framework | Next.js 15.1.6 (App Router), React 18.3.1, TypeScript |
| Base de données | Supabase (PostgreSQL + Auth + Storage) |
| Plateforme de déploiement visible | **Aucune** — pas de `vercel.json`, `railway.json`, ni workflow CI/CD dans le dépôt. `CLAUDE_CONTEXT.md` indique "à confirmer (Railway / Netlify / Vercel)" (`12_GAPS_AND_UNKNOWNS.md`) |
| Environnement Supabase visible | Un seul projet référencé via variables d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — cette dernière absente de `.env.example`) ; aucune distinction dev/staging/prod visible dans le dépôt |
| Build | ✅ Réussi, 37 routes compilées, 0 erreur |
| TypeScript | ✅ `tsc --noEmit` sans erreur |
| Lint | ⚠️ Non exécutable — aucune configuration ESLint dans le dépôt |
| Tests | ❌ Absents — aucun framework, aucun script `npm test` |

---

## B. Architecture synthétique

*(Détail complet et diagrammes Mermaid : `11_ARCHITECTURE_AS_IS.md`)*

- **Frontend** : Next.js 15 App Router. Mélange de Server Components (pages publiques, layouts qui vérifient un rôle) et de Client Components (`"use client"` — formulaires, dashboard, carte Leaflet).
- **Accès aux données** : trois clients Supabase distincts et cohérents dans leur usage —
  1. navigateur (`src/lib/supabase.ts`, clé anonyme) ;
  2. serveur via cookies (`src/lib/supabase/server.ts`, clé anonyme, Server Components/routes API) ;
  3. serveur admin (`src/lib/supabase/admin.ts`, clé service role — utilisée uniquement dans `api/enseignants/[id]/inviter` et `auth/enseignant-bienvenue`, jamais côté client).
- **Authentification** : Supabase Auth via `@supabase/ssr`. `signUp`/`signInWithPassword`, callback OAuth/email qui échange le code contre une session et redirige selon `profiles.role`. Trigger Postgres `handle_new_user` crée le profil automatiquement.
- **Autorisation** : deux mécanismes coexistants sans registre unique (`04_AUTH_AND_ROLES.md` §4, `09_TECHNICAL_DEBT.md` TD-009) —
  1. **Middleware** (`src/middleware.ts`) : couvre `/dashboard/*`, `/auth/*`, `/pro/*` et une liste explicite de préfixes API Pro. Contrôle serveur non contournable côté client.
  2. **Vérification de page** (Server Component) : seul mécanisme pour `/enseignant/*` (hors du matcher middleware), et redondant sur plusieurs pages `/pro/*` déjà couvertes par le middleware.
  - **Point de vigilance central** : ces deux mécanismes protègent l'accès à l'écran, pas les mutations Supabase elles-mêmes, qui ne dépendent que des policies RLS. Voir section F et `06_SECURITY_AUDIT.md` R-001.
- **Stockage** : Supabase Storage, 3 buckets identifiés — `pointages-photos` (privé, créé et versionné en SQL), `school-images` et `school-documents` (documentés seulement en commentaire comme "à créer via le dashboard", configuration réelle non vérifiable depuis le dépôt).
- **Routes serveur** : 37 routes compilées ; Route Handlers sous `/api/enseignants/*`, `/api/messagerie/*`, `/api/pointage/*`, `/api/timetable/*` — détail complet dans `02_ROUTE_INVENTORY.md`.
- **Services externes** : Supabase (BDD/Auth/Storage) ; OpenStreetMap (tuiles cartographiques publiques, sans clé, sans SLA) ; `images.unsplash.com` (images de démonstration, autorisées dans `next.config.js`). **Aucun fournisseur de paiement intégré** malgré la mention Orange Money/MTN MoMo dans `CLAUDE_CONTEXT.md`. **Aucun service d'email transactionnel personnalisé** (emails via configuration par défaut de Supabase Auth). **Aucun outil de monitoring/observabilité** (pas de Sentry, Datadog, etc. dans les dépendances).
- **Modules métier** : annuaire public, fiche établissement, dashboard école (admissions, classes, frais, infrastructures, galerie, documents, annonces, paramètres), dashboard admin plateforme, préinscription publique.
- **Module Pro** : sous-système substantiel et réellement câblé — voir section G.

---

## C. Carte des domaines métier

Seuls les domaines confirmés dans le dépôt sont listés. Sources : `02_ROUTE_INVENTORY.md`, `03_FEATURE_STATUS.md`, `05_DATABASE_CURRENT_STATE.md`.

| Domaine | Routes | Tables | Composants/fichiers principaux | Statut | Risques | Dépendances |
|---|---|---|---|---|---|---|
| **Annuaire** | `/`, `/categorie/[slug]` | `establishments`, `fees`, `infrastructures`, `school_images` | `src/app/page.tsx`, `src/components/LocalSchoolMap.tsx` | FONCTIONNEL | Filtrage/recherche 100% client, pas de pagination serveur | RLS lecture publique sur `establishments` |
| **Établissements** | `/ecole/[id]`, `dashboard/ecole/parametres`, `dashboard/ecole/onboarding` | `establishments` | `src/app/ecole/[id]/page.tsx`, `dashboard/ecole/onboarding/page.tsx` | FONCTIONNEL avec réserves | Dérive de schéma (section F) ; pas de garde anti-duplication à la création | `owner_id = auth.uid()` |
| **Utilisateurs / Authentification** | `/auth/connexion`, `/auth/inscription`, `/auth/callback` | `profiles`, `auth.users` | `auth/connexion/page.tsx`, `auth/inscription/page.tsx`, `auth/callback/route.ts` | FONCTIONNEL | Rôle `establishment_admin` déclaré mais mort ; assignation de `platform_admin` non tracée dans le code | Trigger `handle_new_user` |
| **Administration** | `/dashboard/admin`, `/dashboard/admin/ecoles/[id]` | `establishments` | `dashboard/admin/page.tsx`, `dashboard/admin/ecoles/[id]/page.tsx` | Lecture FONCTIONNELLE / **écriture NON VÉRIFIABLE** | R-001 (policy RLS `UPDATE` manquante pour `platform_admin`) ; boutons "Ajouter", liens "Documents"/"Galerie" non fonctionnels | Middleware `platform_admin` |
| **Candidatures / Pré-inscriptions** | `/preinscription`, `dashboard/ecole/admissions` | `applications` | `preinscription/page.tsx`, `dashboard/ecole/admissions/page.tsx` | PARTIEL | Dérive de schéma ; pas de rate-limiting (R-005) ; nom réel (`applications`) diverge du plan documenté (`pre_inscriptions`) | RLS insertion publique |
| **Annonces** | `dashboard/ecole/annonces`, `dashboard/ecole/classes/[id]` | `school_announcements` | `dashboard/ecole/annonces/page.tsx`, `dashboard/ecole/classes/[id]/page.tsx` | PARTIEL | Dérive de schéma (`class_id`, `type`, `is_important` non versionnés) | RLS propriétaire |
| **Galerie** | `dashboard/ecole/galerie` | `school_images` | `dashboard/ecole/galerie/page.tsx` | FONCTIONNEL | Config bucket Storage non vérifiable | Bucket `school-images` |
| **Documents** | `dashboard/ecole/documents` | `school_documents` | `dashboard/ecole/documents/page.tsx` | FONCTIONNEL | Config bucket Storage non vérifiable ; logique d'upload dupliquée avec galerie (TD-007) | Bucket `school-documents` |
| **Frais** | `dashboard/ecole/frais` | `fees` | `dashboard/ecole/frais/page.tsx` | FONCTIONNEL | Aucun | RLS propriétaire |
| **Infrastructures** | `dashboard/ecole/infrastructure` | `infrastructures` | `dashboard/ecole/infrastructure/page.tsx` | FONCTIONNEL | Aucun | RLS propriétaire |
| **Classes** | `dashboard/ecole/classes`, `dashboard/ecole/classes/[id]` | `classes` | `dashboard/ecole/classes/*` | FONCTIONNEL | Aucun | RLS propriétaire |
| **Enseignants** | `/pro/enseignants`, `/pro/enseignants/nouveau`, `/api/enseignants/creer`, `/api/enseignants/[id]/inviter` | `enseignants` | `pro/enseignants/*`, `api/enseignants/*` | FONCTIONNEL | Aucun signalé | `current_establishment_id()`, client admin pour l'invitation |
| **Emplois du temps** | `/pro/emplois-du-temps`, `/pro/matieres`, `/pro/parametres/emploi-du-temps`, `/api/timetable/generate` | `matieres`, `matieres_volume_horaire`, `contraintes_etablissement`, `creneaux_horaires`, `emplois_du_temps` | `src/lib/timetable/*` | FONCTIONNEL | Algorithme de génération non audité ligne à ligne (hors périmètre) | Migration `0001_timetable_schema.sql` |
| **Absences / Pointage** | `/pro/pointage/kiosque`, `/pro/pointage/historique`, `/api/pointage/enregistrer` | `pointages` | `pro/pointage/*` | FONCTIONNEL | Modèle d'accès du kiosque à revalider (session propriétaire vs. poste partagé) | Bucket `pointages-photos`, migration `0002_presence.sql` |
| **Salaires / Bulletins** | — | — | — | **ABSENT** | Non trouvé dans le code — pas dans le périmètre du module Pro actuel | — |
| **Messagerie** | `/pro/messagerie`, `/api/messagerie/envoyer` | `messages` | `pro/messagerie/page.tsx` | FONCTIONNEL | Aucun | Migration `0004_messagerie.sql` |
| **Notifications** | — | — | — | **ABSENT** | Non trouvé dans le code | — |
| **Élèves** | Implicite via `applications`/`classes` | `applications`, `classes` | — | Pas de domaine "élève" séparé — aucune table `students`/`eleves` distincte trouvée | — | — |

Domaines mentionnés dans `CLAUDE_CONTEXT.md` mais **absents du code** : sections/responsables de section (`sections`), salaires, bulletins — voir section H et `12_GAPS_AND_UNKNOWNS.md`.

---

## D. Flux métier réellement implémentés

*(Détail pas-à-pas, fichiers exacts : `02_ROUTE_INVENTORY.md`, `03_FEATURE_STATUS.md`, `11_ARCHITECTURE_AS_IS.md` §3-4)*

### 1. Recherche d'une école
- **Point d'entrée** : `/` (`src/app/page.tsx`, Client Component)
- **Étapes** : chargement de `establishments` + jointures (`fees`, `infrastructures`, `school_images`) via client anonyme → filtrage client (catégorie, ville, texte, rayon géographique) → rendu grille + carte Leaflet → géolocalisation navigateur optionnelle (`haversineKm` calculé en JS pur, aucun appel serveur)
- **Routes** : `/`, `/categorie/[slug]`
- **Tables** : `establishments`, `fees`, `infrastructures`, `school_images`
- **Permissions** : lecture publique (RLS `true`)
- **État** : FONCTIONNEL
- **Rupture** : aucune ; limite d'échelle non vérifiée (pas de pagination, tout chargé en mémoire)

### 2. Consultation d'une fiche
- **Point d'entrée** : `/ecole/[id]` (`src/app/ecole/[id]/page.tsx` + `layout.tsx`)
- **Étapes** : lecture de `establishments`, `fees`, `infrastructures`, `school_images`, `school_documents`, `school_announcements` → rendu onglets (Général, Galerie, Documents, Annonces, Espace parent)
- **Routes** : `/ecole/[id]`
- **Tables** : les six listées ci-dessus
- **Permissions** : lecture publique
- **État** : FONCTIONNEL
- **Rupture** : l'onglet "Espace parent" est une annonce de fonctionnalité future, pas un vrai espace ; badges premium affichés mais jamais mis à jour par un flux de paiement réel

### 3. Création d'un compte
- **Point d'entrée** : `/auth/inscription` (`auth.signUp`) → confirmation email → `/auth/callback` → `/dashboard/ecole/onboarding`
- **Étapes** : `signUp` avec `emailRedirectTo` → trigger `handle_new_user` crée le profil (`role = parent` par défaut) → callback échange le code et redirige selon `profiles.role` → onboarding crée un **nouvel** établissement (`INSERT establishments`)
- **Routes** : `/auth/inscription`, `/auth/callback`, `/dashboard/ecole/onboarding`
- **Tables** : `profiles` (auto), `establishments` (insert manuel à l'onboarding)
- **Permissions** : aucune vérification qu'un `owner_id` ne possède pas déjà un établissement
- **État** : PARTIEL
- **Rupture** : le paramètre `?ecole=<id>` transmis par le bouton "Revendiquer cette page" (`src/app/page.tsx`) n'est **jamais lu** par `auth/inscription/page.tsx` — un utilisateur qui clique "Revendiquer" crée en réalité une fiche neuve, il ne relie jamais son compte à la fiche existante. Voir section F et TD-003.

### 4. Accès au dashboard école
- **Point d'entrée** : `/dashboard/ecole` (résolution via `useSchool.ts`, `establishments.owner_id = auth.uid()`)
- **Étapes** : middleware vérifie l'authentification → page charge l'établissement du propriétaire connecté → stats calculées depuis `applications`/`classes`
- **Routes** : `/dashboard/ecole` et tous ses sous-onglets (admissions, classes, frais, infrastructure, galerie, documents, annonces, paramètres, paiements)
- **Tables** : `establishments`, `applications`, `classes`, `fees`, `infrastructures`, `school_images`, `school_documents`, `school_announcements`
- **Permissions** : `owner_id = auth.uid()` — cohérent entre code et RLS connue
- **État** : FONCTIONNEL (sauf `paiements`, écran statique "Prochainement")
- **Rupture** : aucune identifiée dans ce flux précis (au-delà de la dérive de schéma générale, section F)

### 5. Administration plateforme
- **Point d'entrée** : `/dashboard/admin` (middleware vérifie `profiles.role === 'platform_admin'`)
- **Étapes** : liste des établissements (lecture) → `/dashboard/admin/ecoles/[id]` pour éditer plan/vérification/mise en avant → `supabase.from("establishments").update(form)` avec le **client anonyme**
- **Routes** : `/dashboard/admin`, `/dashboard/admin/ecoles/[id]`
- **Tables** : `establishments`
- **Permissions** : accès à l'écran garanti par middleware ; **écriture non garantie** — seule policy `UPDATE` connue est `owner_id = auth.uid()`, qui ne couvre pas un admin non-propriétaire
- **État** : Lecture FONCTIONNELLE / Écriture **PARTIEL — NON VÉRIFIABLE**
- **Rupture** : risque que la fonctionnalité admin la plus importante du produit échoue silencieusement (le code n'affiche une confirmation que si `!error`, sans message d'erreur explicite en cas d'échec RLS). Voir R-001, TD-002, section F.

### 6. Candidatures / pré-inscriptions
- **Point d'entrée** : `/preinscription` (public, sans compte requis)
- **Étapes** : formulaire parent → `INSERT applications` (policy `Public can create applications`, `with check (true)`) → école consulte/traite via `dashboard/ecole/admissions`
- **Routes** : `/preinscription`, `dashboard/ecole/admissions`
- **Tables** : `applications`
- **Permissions** : insertion publique ; lecture/mise à jour par le propriétaire de l'établissement (ou par `parent_id`, jamais renseigné en pratique)
- **État** : PARTIEL
- **Rupture** : ce flux existe et fonctionne, mais sous un nom et une structure différents de ce que `CLAUDE_CONTEXT.md` planifiait (`pre_inscriptions` avec `code_suivi` public — jamais implémenté) ; aucune limitation de fréquence (R-005)

### 7. Module Pro
- Voir section G dédiée — flux emplois du temps, pointage, comptes enseignants, messagerie tous FONCTIONNELS et cohérents avec des migrations SQL versionnées (`0001` à `0005`).

### 8. Autres flux confirmés
- **Espace enseignant multi-établissement** (`/enseignant/mon-espace`) : sélection d'établissement via `?eid=`, filtré par les lignes `enseignants` réellement liées à l'utilisateur ; calcul d'heures via RPC `calculer_heures_enseignant`. FONCTIONNEL, mais protégé uniquement au niveau page (hors matcher middleware).
- **Invitation enseignant** (`/api/enseignants/[id]/inviter`) : utilise le client service role pour `admin.auth.admin.inviteUserByEmail`, bien scopé (vérifie auth + `owner_id` + appartenance enseignant→établissement avant d'agir).

---

## E. Modèle de rôles

*(Source : `04_AUTH_AND_ROLES.md`)*

| Rôle | Données lisibles | Données modifiables | Routes | Contrôle frontend | Contrôle serveur | RLS confirmée |
|---|---|---|---|---|---|---|
| **Parent / visiteur (non authentifié)** | Annuaire public, fiches établissement (lecture) | `applications` (insertion uniquement, sans compte) | `/`, `/categorie/[slug]`, `/ecole/[id]`, `/preinscription` | Aucun (public) | Aucun (public par conception) | Oui — lecture publique confirmée sur les tables publiques ; insertion publique confirmée sur `applications` |
| **École (owner, `profiles.role = parent` en pratique)** | Ses propres `establishments`, `applications`, `classes`, `fees`, `infrastructures`, `school_images`, `school_documents`, `school_announcements` | Idem, filtré par `owner_id = auth.uid()` | `/dashboard/ecole/*` | Middleware (authentification) + résolution via `useSchool.ts` | `owner_id = auth.uid()` sur chaque requête | Oui — policy `owner_id = auth.uid()` confirmée dans `schema.sql`/`auth-setup.sql` |
| **École (forfait Pro)** | Idem + tables module Pro (`enseignants`, `matieres`, `emplois_du_temps`, `pointages`, `messages`, etc.) de son établissement | Idem, scope établissement | `/pro/*`, API Pro (`/api/timetable/*`, `/api/pointage/*`, `/api/messagerie/*`, `/api/enseignants/*`) | Middleware (`forfait = 'pro'`) | `current_establishment_id()` (fonction `security definer`) | Oui — policies `*_scope` confirmées, versionnées dans les migrations `0001`-`0005` |
| **Enseignant** | Sa fiche `enseignants`, ses `pointages`, messagerie de son établissement | Ses `pointages` (via kiosque), messages selon policy | `/enseignant/mon-espace`, `/pro/pointage/kiosque` (accès partagé) | **Page uniquement — hors matcher middleware** | `enseignants.user_id = auth.uid()`, `enseignants_self_read`, `pointages_self_read` | Oui — policies confirmées dans les migrations Pro |
| **Administrateur plateforme (`platform_admin`)** | Tout `establishments` (lecture) | **NON CONFIRMÉ** pour `establishments` (écriture) | `/dashboard/admin`, `/dashboard/admin/ecoles/[id]` | Middleware (`profiles.role === 'platform_admin'`) | Vérification middleware confirmée pour l'accès à l'écran | **NON — aucune policy `UPDATE` pour `platform_admin` trouvée sur `establishments`** (seule policy connue : `owner_id = auth.uid()`) |
| **`establishment_admin`** | — | — | — | — | — | Rôle déclaré dans l'enum PostgreSQL mais **jamais assigné par aucun code applicatif** — mort |

**Ne pas inventer de permission au-delà de ce tableau.** Toute case marquée NON CONFIRMÉ nécessite un accès direct à l'environnement Supabase de production pour être tranchée (voir section H et `12_GAPS_AND_UNKNOWNS.md`).

---

## F. Dérive de schéma

*(Détail complet, diagramme ER : `05_DATABASE_CURRENT_STATE.md`)*

Méthode de constat : comparaison entre (1) `supabase/schema.sql`, (2) `supabase/migrations/*.sql` + `auth-setup.sql`, et (3) les colonnes réellement lues/écrites par le code applicatif. Une colonne utilisée par le code mais absente de (1) et (2) est marquée **[DÉRIVE]**.

### `establishments`

| | |
|---|---|
| Schéma attendu par le code | `is_claimed` (bool), `quartier`, `couleur_primaire`, `couleur_secondaire`, `emoji_logo`, `forfait` |
| Schéma visible dans les migrations | Colonnes du schéma initial (`schema.sql`) : `id`, `owner_id`, `name`, `slug`, `main_category`, `sub_category`, etc. + `forfait` ajoutée par la migration versionnée `0005_forfait_multi_etab.sql` |
| Origine de la dérive | `is_claimed`, `quartier`, `couleur_primaire`, `couleur_secondaire`, `emoji_logo` ajoutées uniquement par `supabase/seed_schools.sql` — un script de seed, pas une migration |
| Types TypeScript | Aucun type généré depuis Supabase (`supabase gen types typescript` non utilisé) — le code s'appuie sur des `any` (19 occurrences, `07_CODE_QUALITY.md`) |
| Conséquence | `plan_type` et `module_pro_actif`, documentées dans `CLAUDE_CONTEXT.md` comme "à ajouter", **n'existent nulle part** dans le dépôt — le concept réellement implémenté est `forfait` (valeurs `gratuit`/`gere`/`pro`, distinctes de `autonome`/`gere`/`pro` documenté) |
| Méthode recommandée de réconciliation | Exporter le schéma réel de production (`pg_dump --schema-only` ou Supabase CLI diff), comparer aux fichiers du dépôt, écrire une migration de rattrapage versionnée pour chaque colonne confirmée en production |

### `applications`

| | |
|---|---|
| Schéma attendu par le code | `student_first_name`, `student_last_name`, `full_student_name`, `desired_level`, `previous_school`, `notes` (vus dans `preinscription/page.tsx`, `dashboard/ecole/admissions/page.tsx`, `dashboard/ecole/page.tsx`) |
| Schéma visible dans les migrations | Schéma initial (`schema.sql`) : `id`, `parent_id`, `establishment_id`, `student_name`, `student_age`, `student_level`, `parent_name`, `parent_phone`, `parent_email`, `message`, `status` |
| Types TypeScript | Aucun — `any` généralisé |
| Conséquence | `desired_level` semble remplacer `student_level` sans migration tracée ; `parent_id` n'est jamais renseigné par le formulaire public (cohérent avec "sans compte requis"), ce qui signifie que la policy `Parents can read own applications` ne peut jamais s'appliquer à ces dossiers |
| Méthode recommandée de réconciliation | Idem `establishments` — export du schéma réel puis migration de rattrapage |

### `school_announcements`

| | |
|---|---|
| Schéma attendu par le code | `is_important` (bool, utilisé dans `dashboard/ecole/annonces` et la fiche publique), `class_id` et `type` (`announcement`/`homework`/`event`/`reminder`, utilisés dans `dashboard/ecole/classes/[id]/page.tsx`) |
| Schéma visible dans les migrations | Colonnes déclarées dans `auth-setup.sql` : `id`, `establishment_id`, `title`, `content`, `published_at`, `created_at` |
| Types TypeScript | Aucun — `any` généralisé |
| Conséquence | Le lien `class_id → classes` n'est tracé nulle part dans les migrations, alors qu'il est structurant pour les publications de classe |
| Méthode recommandée de réconciliation | Idem — export du schéma réel puis migration de rattrapage |

### Constat transversal

`CLAUDE_CONTEXT.md` recommande lui-même "Toute modification de schéma Supabase passe par SQL Editor" — cette pratique documentée est la cause probable directe de la dérive constatée. Tant que le schéma réel n'est pas rapatrié dans des migrations versionnées, **aucune revue de sécurité ni recréation d'environnement ne peut être complète** (`06_SECURITY_AUDIT.md` R-002, `09_TECHNICAL_DEBT.md` TD-001, gravité **CRITIQUE**).

---

## G. Module Pro réel

`CLAUDE_CONTEXT.md` (le contexte fourni au début de ce dossier) décrit le module Pro comme une **Offre 3 future**, "indépendante des deux offres ci-dessus — activable même sur l'offre gratuite", pas encore construite. **L'audit du code contredit cette description** : le module Pro est substantiel, câblé de bout en bout, et repose sur des migrations SQL versionnées et cohérentes.

### Pourquoi il est considéré "complet et câblé"

- 5 migrations dédiées et versionnées (`0001_timetable_schema.sql` à `0005_forfait_multi_etab.sql`), contrairement au reste du schéma qui souffre de dérive (section F).
- Chaque sous-fonctionnalité a un chemin complet : UI (page `/pro/*`) → route API ou requête Supabase directe → table dédiée → policy RLS scoping.
- Toutes les policies RLS du module Pro s'appuient sur une fonction centrale bien conçue, `current_establishment_id()` (`security definer`), qui résout l'établissement de l'utilisateur connecté via `establishments.owner_id = auth.uid()`.
- Le middleware protège explicitement `/pro/*` (sauf `/pro/acces-restreint`, exclu volontairement pour éviter une boucle de redirection) en vérifiant `establishments.forfait === 'pro'`.

### Fonctionnalités réellement présentes

| Fonctionnalité | Routes | Tables | Migration | Composants |
|---|---|---|---|---|
| Emplois du temps (génération, consultation) | `/pro/emplois-du-temps`, `/pro/matieres`, `/pro/parametres/emploi-du-temps`, `POST /api/timetable/generate` | `matieres`, `matieres_volume_horaire`, `contraintes_etablissement`, `creneaux_horaires`, `emplois_du_temps` | `0001_timetable_schema.sql` | `src/lib/timetable/*` |
| Comptes enseignants et invitations | `/pro/enseignants`, `/pro/enseignants/nouveau`, `POST /api/enseignants/creer`, `POST /api/enseignants/[id]/inviter`, `/auth/enseignant-bienvenue` | `enseignants` | `0003_comptes_enseignants.sql` | Utilise le client service role côté serveur uniquement |
| Pointage (mode kiosque avec photo) | `/pro/pointage/kiosque`, `/pro/pointage/historique`, `POST /api/pointage/enregistrer` | `pointages` | `0002_presence.sql` | Bucket privé `pointages-photos`, policy `pointages_owner_access` ; RPC `calculer_heures_enseignant` |
| Messagerie interne | `/pro/messagerie`, `POST /api/messagerie/envoyer` | `messages` | `0004_messagerie.sql` | Diffusion globale ou par département |
| Espace enseignant multi-établissement | `/enseignant/mon-espace` | `enseignants`, `pointages` | `0005_forfait_multi_etab.sql` | `SelecteurEtablissement.tsx` |

### Niveau de finition

- Emplois du temps, comptes enseignants, pointage, messagerie : **FONCTIONNEL** selon `03_FEATURE_STATUS.md`.
- Algorithme de génération d'emplois du temps (`/api/timetable/generate`) : présent et appelé, mais **non audité ligne à ligne** dans cet audit (hors périmètre déclaré "ne pas développer") — sa robustesse reste à valider par une revue dédiée si des anomalies de planning sont rapportées.

### Données fictives éventuelles

Aucune donnée fictive spécifique au module Pro identifiée dans le code lui-même. Le fichier `supabase/seed_schools.sql` contient 40 fiches d'établissements marquées "données réelles ou très plausibles — À VÉRIFIER" (`12_GAPS_AND_UNKNOWNS.md`), mais ce constat concerne l'annuaire, pas le module Pro.

### Permissions

Scope strict par établissement via `current_establishment_id()` sur toutes les tables du module Pro ; policies dédiées par table (`enseignants_scope`, `matieres_scope`, `edt_scope`, `pointages_scope` + `pointages_self_read`, `messages_directeur` + `messages_enseignant_read`, etc.) — voir `05_DATABASE_CURRENT_STATE.md` §3 pour la liste complète table par table.

### Dépendances

- Migration `0005_forfait_multi_etab.sql` (colonne `forfait` sur `establishments`) est la porte d'entrée : sans `forfait = 'pro'`, le middleware bloque tout `/pro/*`.
- Client service role (`src/lib/supabase/admin.ts`) requis pour l'invitation enseignant — dépend de `SUPABASE_SERVICE_ROLE_KEY`, non documentée dans `.env.example` (R-003).

### Risques

- Modèle d'accès du kiosque de pointage (`/pro/pointage/kiosque`) à revalider : soumis à la même règle que le reste de `/pro/*` (session du propriétaire), alors qu'un kiosque de pointage est généralement destiné à un poste partagé accédé par différents enseignants via leur code — NON VÉRIFIÉ si le comportement observé correspond à l'usage réel prévu (`02_ROUTE_INVENTORY.md`, remarque finale).
- Algorithme de génération d'emplois du temps non audité en détail.
- Encodage de caractères corrompu dans `src/app/api/timetable/generate/route.ts` et `supabase/migrations/0001_timetable_schema.sql`, visible dans un message d'erreur retourné à l'utilisateur (TD-012, gravité faible).

### Éléments absents

- **Sections et responsables de section** (`sections` avec `ecole_id`, `nom`, `responsable_id`, `type`, mentionnée dans `CLAUDE_CONTEXT.md` comme anticipation Phase 4) : **absente du code et des migrations**, aucune trace.
- **Salaires, bulletins** : aucune table, aucune route trouvée — non commencés.
- **Notifications** : aucune table, aucune route trouvée.

---

## H. Décisions requises du fondateur

Liste strictement limitée à ce qui ne peut pas être tranché à partir du code seul (`12_GAPS_AND_UNKNOWNS.md`, `03_FEATURE_STATUS.md`, `05_DATABASE_CURRENT_STATE.md`).

- **Produit** — L'onglet "Espace parent" de la fiche publique doit-il rester visible en l'état (annonce d'une fonctionnalité future) ou être masqué tant qu'il n'existe pas réellement ?
- **Modèle commercial** — Le concept documenté (`plan_type`/`module_pro_actif`, valeurs `autonome`/`gere`/`pro`) doit-il devenir la référence, ou le concept réellement codé (`forfait`, valeurs `gratuit`/`gere`/`pro`) doit-il devenir la documentation officielle ? Les deux ne peuvent pas rester en parallèle (TD-013).
- **Propriété des données** — Qui est responsable de confirmer/exporter le schéma réel de production Supabase (colonnes ajoutées hors migrations, policies RLS créées via SQL Editor) ? Cette étape est un préalable à toute autre décision technique (TD-001).
- **Processus de revendication** — Le flux "Revendiquer cette page" doit-il être construit maintenant (lier un compte à une fiche existante, avec un mécanisme de vérification — email pro, document, validation admin) ou le bouton doit-il être retiré de l'interface tant qu'il n'existe pas ?
- **Validation des écoles** — Le texte affiché aux écoles ("visible après vérification par l'équipe") n'est adossé à aucun état `pending` confirmé dans le schéma connu. Un processus de vérification manuel existe-t-il réellement en dehors du code (Supabase dashboard), ou ce texte est-il actuellement inexact ?
- **Limites des offres** — L'offre "Gérée" (accès admin délégué à l'équipe Écoles237, journal des modifications) n'a aucune logique de code trouvée. Est-elle en conception ailleurs (document produit non versionné), ou son développement n'a-t-il pas commencé ?
- **Commission** — Le taux de 2% mentionné dans `CLAUDE_CONTEXT.md` pour l'offre Autonome n'a aucune trace de calcul ou d'application dans le code (aucune table `commissions`/`payments` utilisée). Le mécanisme de perception de cette commission reste à définir.
- **Accès au module Pro** — Le module Pro est présenté dans `CLAUDE_CONTEXT.md` comme "Offre 3", indépendante et activable même sur l'offre gratuite ; dans le code, l'accès dépend uniquement de `forfait = 'pro'` sur `establishments`, sans lien visible avec un mécanisme de facturation. Le mode d'activation commercial réel (paiement, activation manuelle par l'équipe, etc.) reste à définir.
- **Stratégie de lancement** — Statut réel des données en production : `CLAUDE_CONTEXT.md` affirme "il n'y a pas encore de vraies écoles en production", mais `seed_schools.sql` contient 40 fiches marquées "données réelles ou très plausibles — À VÉRIFIER". Cette contradiction doit être levée avant toute communication publique sur le nombre d'écoles réellement référencées.
- **Rôles institutionnels futurs** — Statut de la roadmap "sections/responsables de section" (structure organisationnelle multi-niveaux) : toujours planifiée, ou obsolète depuis l'implémentation actuelle du module Pro (scope unique par établissement, sans sous-division) ?
- **Assignation du rôle `platform_admin`** — Aucun flux applicatif ne l'assigne dans le code. Confirmer que l'assignation manuelle via le dashboard Supabase est bien le processus voulu (et pas un oubli de développement).

---

## I. Priorités proposées

*(Ordre de travail détaillé, sans conception de solution : `13_RECOMMENDED_NEXT_STEPS.md`)*

### Blocage beta

1. **Reconstituer le schéma réel de Supabase** (TD-001, gravité CRITIQUE) et le comparer à ce dépôt — préalable à toute autre décision technique.
2. **Vérifier en environnement réel si la mutation admin sur `establishments` fonctionne** (R-001/TD-002) — détermine si l'équipe peut administrer les écoles au quotidien.
3. Trancher le sort du bouton "Revendiquer cette page" (TD-003) — le construire réellement ou le retirer temporairement.
4. Aligner la documentation produit sur le modèle de plans réellement implémenté (`forfait`, pas `plan_type`/`module_pro_actif`) (TD-013).

### Stabilisation

5. Décider du sort de `pre_inscriptions` (documentée, jamais construite) : garder `applications` tel quel ou migrer.
6. Ajouter une limitation de fréquence sur le formulaire de préinscription public (R-005).
7. Documenter `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SITE_URL` dans `.env.example` (R-003).
8. Corriger les points fonctionnels rapides et sans risque : lien de déconnexion enseignant cassé (TD-010), bouton "Ajouter" et liens `#` non fonctionnels dans l'admin.
9. Mettre en place une configuration ESLint non interactive et un minimum de vérification automatisée avant chaque déploiement (TD-005).
10. Planifier la mise à jour de Next.js vers une version corrigée des vulnérabilités identifiées (R-004/TD-004), testée hors production avant bascule.
11. Générer les types TypeScript depuis le schéma Supabase une fois celui-ci stabilisé (TD-008).
12. Ajouter un garde-fou anti-duplication sur l'onboarding école.
13. Réduire la duplication de code (composant `Logo` dans 8 fichiers — TD-006 ; logique d'upload galerie/documents — TD-007).

### Évolution produit

14. Construire réellement l'intégration de paiement Mobile Money si elle reste dans la feuille de route (actuellement placeholder pur).
15. Concevoir le modèle de données et l'accès pour l'offre "Gérée" (accès délégué, journal des modifications) — actuellement inexistant.
16. Ajouter un monitoring d'erreurs et de performance en production (aucun outil trouvé actuellement).
17. Module Pro — sections/responsables de section (structure organisationnelle multi-niveaux), si la roadmap le confirme (section H).
18. Extension nationale hors Douala/Yaoundé, volet institutionnel public (IPR/IPD) — explicitement hors sprint selon `CLAUDE_CONTEXT.md`, à reconfirmer avec le fondateur avant tout engagement.

---

## Documents source inclus dans ce dossier

| Fichier | Contenu |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | Synthèse globale, notation par axe (58/100) |
| `02_ROUTE_INVENTORY.md` | Les 37 routes, accès, état, risque, route par route |
| `03_FEATURE_STATUS.md` | Chaque fonctionnalité, preuve dans le code, limites |
| `04_AUTH_AND_ROLES.md` | Mécanisme d'auth, rôles, protection middleware vs. page |
| `05_DATABASE_CURRENT_STATE.md` | Schéma reconstitué, dérives, diagramme ER Mermaid |
| `06_SECURITY_AUDIT.md` | 8 risques (R-001 à R-008), gravité et statut de vérification |
| `09_TECHNICAL_DEBT.md` | 13 items de dette technique, classés par gravité |
| `11_ARCHITECTURE_AS_IS.md` | Diagrammes de contexte, conteneurs, séquence (Mermaid) |
| `12_GAPS_AND_UNKNOWNS.md` | Tout ce qui n'est pas vérifiable depuis ce dépôt seul |
| `13_RECOMMENDED_NEXT_STEPS.md` | Ordre de travail proposé, sans conception de solution |

Documents de l'audit complet **non inclus** dans ce dossier compact (disponibles dans `docs/00_CURRENT_STATE_AUDIT/` si nécessaire) : `01_REPOSITORY_MAP.md`, `07_CODE_QUALITY.md`, `08_UX_UI_AUDIT.md`, `10_RENAME_MBOASCHOOL_TO_ECOLES237.md`, `14_FILES_CHANGED.md`.
