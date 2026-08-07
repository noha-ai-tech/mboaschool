# Checklist de test manuel — après déploiement Vercel

À exécuter juste après chaque déploiement en production (premier déploiement et suivants), directement sur l'URL
Vercel réelle. Cocher chaque case ; si une case échoue, noter le comportement observé avant de continuer.

Référence croisée : chaque flux ci-dessous correspond à un flux documenté dans
`docs/01_ARCHITECT_HANDOFF/ARCHITECT_HANDOFF.md` section D.

---

## PUBLIC

- [ ] **Accueil** (`/`) — la page charge, la liste des établissements s'affiche (ou un état vide propre si aucune école en base)
- [ ] **Annuaire** — la grille d'établissements se charge sans erreur console
- [ ] **Filtres** — filtrer par catégorie/ville produit un résultat cohérent
- [ ] **Recherche** — la recherche texte filtre correctement la liste
- [ ] **Géolocalisation** — activer la géolocalisation navigateur affiche la distance et centre la carte (tester l'autorisation navigateur, pas seulement le refus)
- [ ] **Fiche école** (`/ecole/[id]`) — carrousel photo, frais, infrastructures, documents, annonces s'affichent pour une fiche existante
- [ ] **Préinscription** (`/preinscription`) — soumettre le formulaire crée bien une ligne dans `applications` (à vérifier côté dashboard école ensuite)

## ÉCOLE

- [ ] **Inscription** (`/auth/inscription`) — création de compte envoie l'email de confirmation Supabase
- [ ] **Connexion** (`/auth/connexion`) — connexion réussie redirige vers `/dashboard/ecole`
- [ ] **Onboarding** — première connexion propose bien la création de la fiche établissement
- [ ] **Dashboard** (`/dashboard/ecole`) — stats (candidatures, classes) s'affichent
- [ ] **Modification fiche** (`/dashboard/ecole/parametres`) — une modification est bien sauvegardée et visible sur la fiche publique
- [ ] **Galerie** (`/dashboard/ecole/galerie`) — upload d'une image réussit (test direct du bucket `school-images`, voir section F de la checklist de déploiement — c'est le test qui confirme si ce bucket existe réellement)
- [ ] **Frais** (`/dashboard/ecole/frais`) — l'enregistrement des frais fonctionne
- [ ] **Infrastructures** (`/dashboard/ecole/infrastructure`) — l'enregistrement des infrastructures fonctionne

## ADMIN

- [ ] **Connexion** — un compte `platform_admin` se connecte et est bien redirigé vers `/dashboard/admin`
- [ ] **Liste écoles** (`/dashboard/admin`) — la liste de tous les établissements s'affiche
- [ ] **Consultation école** (`/dashboard/admin/ecoles/[id]`) — le détail d'une école se charge
- [ ] **Tentative de modification** — modifier un champ et enregistrer : **noter précisément le résultat observé** (confirmation "Modifications sauvegardées", ou message d'erreur explicite depuis le correctif de cette mission, ou absence totale de réaction). C'est le test qui confirme ou infirme R-001 (policy RLS `UPDATE` manquante pour `platform_admin` sur `establishments`) en environnement réel — voir section L de `VERCEL_DEPLOYMENT_CHECKLIST.md`.

## PRO

- [ ] **Enseignants** (`/pro/enseignants`) — la liste des enseignants d'un établissement au forfait Pro s'affiche
- [ ] **Invitations** (`/pro/enseignants/nouveau` → invitation) — l'email d'invitation part bien (dépend de la Redirect URL Supabase, section E)
- [ ] **Emplois du temps** (`/pro/emplois-du-temps`) — génération/consultation sans erreur
- [ ] **Pointage** (`/pro/pointage/kiosque`) — capture photo + enregistrement d'un pointage fonctionne (nécessite caméra navigateur — HTTPS obligatoire, fourni par défaut sur Vercel)
- [ ] **Présences** (`/pro/pointage/historique`) — l'historique des pointages s'affiche
- [ ] **Calcul des heures** — la RPC `calculer_heures_enseignant` retourne un résultat cohérent

## ENSEIGNANT

- [ ] **Connexion** — un compte enseignant se connecte et est redirigé vers `/auth/enseignant-bienvenue` puis `/enseignant/mon-espace`
- [ ] **Espace personnel** (`/enseignant/mon-espace`) — les informations de l'enseignant s'affichent
- [ ] **Changement d'établissement** — si l'enseignant est lié à plusieurs établissements, le sélecteur (`?eid=`) fonctionne
- [ ] **Horaires** — l'emploi du temps de l'enseignant s'affiche correctement
- [ ] **Présences** — l'historique de pointage de l'enseignant s'affiche
- [ ] **Déconnexion** — cliquer sur "Déconnexion" déconnecte réellement et redirige vers `/` (test direct du correctif appliqué dans cette mission — avant, ce bouton menait à une route inexistante, `/auth/signout`)

---

## En cas d'échec

- Noter le flux exact, l'étape, et le message d'erreur (console navigateur + réseau si possible)
- Ne pas tenter de correctif improvisé en production — reporter à une session de diagnostic dédiée
- Si le point ADMIN "Tentative de modification" échoue silencieusement ou avec une erreur RLS, c'est un résultat attendu et documenté (voir section L de `VERCEL_DEPLOYMENT_CHECKLIST.md`) — ne pas le traiter comme une régression de ce déploiement
