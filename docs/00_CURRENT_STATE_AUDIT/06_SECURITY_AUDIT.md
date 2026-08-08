# 06 — Security Audit

Méthode : lecture statique du code, du middleware et des fichiers SQL versionnés. Aucune tentative d'exploitation, aucune connexion à un environnement Supabase réel. Chaque constat indique s'il est **CONFIRMÉ DANS LE CODE** ou **NON VÉRIFIABLE SANS ACCÈS À LA BASE DE PRODUCTION**.

---

### R-001 — Écriture admin sur `establishments` sans policy RLS confirmée
- **Gravité** : Élevée
- **Statut** : Confirmé dans le code (incohérence code/policies) ; conséquence réelle **non vérifiable** sans accès à Supabase
- **Fichier(s)** : `src/app/dashboard/admin/ecoles/[id]/page.tsx` (appel `supabase.from("establishments").update(form)...` avec le client anonyme), `supabase/schema.sql` (seule policy `UPDATE` connue : `owner_id = auth.uid()`)
- **Scénario** : Un administrateur plateforme (`platform_admin`) ouvre `/dashboard/admin/ecoles/[id]` (accès légitime, bien protégé par le middleware) et tente de vérifier une école ou de changer son plan. Si aucune policy RLS supplémentaire n'existe en base pour `platform_admin`, Supabase refuse la mise à jour (RLS bloque toute ligne où `owner_id != auth.uid()`) — la fonctionnalité admin la plus importante du produit échoue silencieusement (le formulaire dit "Modifications sauvegardées" même si Supabase renvoie une erreur qui n'est pas branchée sur l'affichage : le code n'appelle `setSaved(true)` que dans le bloc `if (!error)`, donc l'utilisateur verrait effectivement une absence de confirmation — mais sans message d'erreur explicite non plus, juste un formulaire qui semble ne rien faire).
- **Alternative tout aussi grave** : si une policy permissive existe déjà en base (non versionnée) pour contourner ce blocage, elle échappe à toute revue de code — impossible de savoir si elle est correctement scopée (`platform_admin` uniquement) ou trop large.
- **Recommandation** : Vérifier en environnement réel si la sauvegarde fonctionne. Si non : ajouter une policy RLS explicite `platform_admin` versionnée dans une nouvelle migration. Dans tous les cas, faire transiter les mutations administratives sensibles par une route API serveur utilisant `createAdminClient()` plutôt que le client anonyme, pour ne plus dépendre de RLS pour cette opération précise.

---

### R-002 — Dérive de schéma non tracée entre le dépôt et la base réelle
- **Gravité** : Élevée
- **Statut** : Confirmé dans le code (voir `05_DATABASE_CURRENT_STATE.md` pour le détail complet)
- **Fichier(s)** : `supabase/seed_schools.sql`, `src/app/preinscription/page.tsx`, `src/app/dashboard/ecole/admissions/page.tsx`, `src/app/dashboard/ecole/classes/[id]/page.tsx`
- **Scénario** : Ce n'est pas une vulnérabilité d'accès, mais un risque opérationnel majeur : personne ne peut aujourd'hui reconstruire un environnement de test ou de staging fidèle à la production à partir de ce dépôt seul, et toute revue de sécurité future (y compris celle-ci) reste partiellement aveugle sur les policies RLS réellement actives pour les colonnes ajoutées hors migrations.
- **Recommandation** : Exporter le schéma réel de production (`pg_dump --schema-only` ou l'outil de diff Supabase CLI) et le comparer aux fichiers de ce dépôt avant toute décision d'architecture.

---

### R-003 — Clé service role : usage et exposition
- **Gravité** : Moyenne (usage actuel correct, mais point de vigilance permanent)
- **Statut** : Confirmé dans le code (usage correct constaté), variable d'environnement absente de `.env.example`
- **Fichier(s)** : `src/lib/supabase/admin.ts`, `.env.example`
- **Constat positif** : `createAdminClient()` n'est importé que dans des fichiers serveur (`api/enseignants/[id]/inviter/route.ts`, `auth/enseignant-bienvenue/page.tsx`, tous deux des Server Components/routes API, jamais des fichiers `"use client"`). Aucune fuite de la clé côté navigateur trouvée.
- **Constat de risque** : `SUPABASE_SERVICE_ROLE_KEY` n'est documentée nulle part dans `.env.example`. Un nouvel environnement (staging, nouveau développeur) configuré en suivant uniquement `.env.example` aura les fonctionnalités d'invitation enseignant silencieusement cassées (erreur runtime `undefined` passé à `createClient`), et pourrait être tenté de contourner le problème d'une façon qui expose la clé (ex. la mettre par erreur dans une variable `NEXT_PUBLIC_*`).
- **Recommandation** : Ajouter `SUPABASE_SERVICE_ROLE_KEY` (valeur vide) et `NEXT_PUBLIC_SITE_URL` à `.env.example`, avec un commentaire explicite "ne jamais préfixer par NEXT_PUBLIC_".

---

### R-004 — Vulnérabilités connues dans les dépendances (npm audit)
- **Gravité** : Élevée (1 critique, 2 hautes, remontées par les mainteneurs des paquets eux-mêmes)
- **Statut** : Confirmé — `npm audit` exécuté sans modification du code
- **Détail** : `next@15.1.6` (version figée dans `package.json`) est concerné par un grand nombre d'avis de sécurité publiés depuis, dont un RCE potentiel dans le protocole React Flight (GHSA-9qr9-h5gf-34mp), un contournement d'autorisation dans le middleware (GHSA-f82v-jwr5-mffw — **particulièrement pertinent ici puisque tout le contrôle d'accès du produit repose sur le middleware**), et plusieurs DoS. `postcss` et `sharp` (dépendances transitives) ont également des avis actifs.
- **Recommandation** : Planifier une mise à jour de Next.js vers une version corrigée (`npm audit fix --force` proposait `next@15.5.22` au moment de cet audit — à valider, tout changement de version majeure/mineure de Next.js doit être testé, pas appliqué à l'aveugle vu le nombre de pages).

---

### R-005 — Formulaire de préinscription public sans limitation de fréquence
- **Gravité** : Moyenne
- **Statut** : Confirmé dans le code
- **Fichier(s)** : `src/app/preinscription/page.tsx`, policy `Public can create applications` (`auth-setup.sql`, `with check (true)`)
- **Scénario** : N'importe qui peut soumettre un nombre illimité de dossiers de préinscription sans authentification ni CAPTCHA ni limitation de débit visible dans le code. Un acteur malveillant pourrait remplir la table `applications` de faux dossiers, dégradant l'expérience des écoles qui gèrent ces dossiers dans leur dashboard.
- **Recommandation** : Ajouter une limitation de fréquence (par IP ou par email) côté route API dédiée, ou un CAPTCHA, avant la mise en beta publique.

---

### R-006 — Absence totale de configuration ESLint et de tests automatisés
- **Gravité** : Moyenne (dette de qualité, pas une faille directe, mais un facteur aggravant pour tous les autres risques)
- **Statut** : Confirmé — `npm run lint` demande une configuration interactive absente, aucun fichier de test dans le dépôt
- **Impact** : Aucune détection automatique de patterns dangereux (injection, fuite de secret, mauvaise gestion d'erreur) avant mise en production. Voir `07_CODE_QUALITY.md`.

---

### R-007 — Rôle `establishment_admin` mort dans l'enum
- **Gravité** : Faible
- **Statut** : Confirmé dans le code
- **Impact** : Pas un risque de sécurité actif, mais une source de confusion pour quiconque conçoit une future policy RLS en pensant que ce rôle est utilisé.

---

### R-008 — Lien de déconnexion cassé pour les enseignants
- **Gravité** : Faible (fonctionnel, pas sécuritaire — mais une session qui ne se termine pas correctement est un risque sur un poste partagé, notamment le kiosque de pointage)
- **Statut** : Confirmé dans le code
- **Fichier(s)** : `src/app/enseignant/layout.tsx` (`<form action="/auth/signout" method="post">`), absence de `src/app/auth/signout/route.ts`
- **Recommandation** : Créer la route manquante ou remplacer par un appel client à `supabase.auth.signOut()` comme fait ailleurs (`dashboard/admin/page.tsx`, `useSchool.ts`).

---

## Résumé

| ID | Titre | Gravité | Statut de vérification |
|---|---|---|---|
| R-001 | Écriture admin sans policy RLS confirmée | Élevée | Confirmé (code) / conséquence non vérifiable |
| R-002 | Dérive de schéma non tracée | Élevée | Confirmé |
| R-003 | Clé service role non documentée dans `.env.example` | Moyenne | Confirmé |
| R-004 | Vulnérabilités npm (Next.js notamment) | Élevée | Confirmé |
| R-005 | Préinscription publique sans limite de fréquence | Moyenne | Confirmé |
| R-006 | Aucun lint/test automatisé | Moyenne | Confirmé |
| R-007 | Rôle `establishment_admin` mort | Faible | Confirmé |
| R-008 | Déconnexion enseignant cassée | Faible | Confirmé |

**Aucune action destructive, aucune tentative d'exploitation, aucune modification de configuration de sécurité n'a été effectuée pendant cet audit.**
