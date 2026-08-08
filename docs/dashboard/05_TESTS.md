# 05 — Tests (Phase 13)

Aucun environnement Supabase réel disponible depuis cet audit — tests documentés pour exécution manuelle par
Eddy/Helon avant validation, comme pour les missions précédentes de cette série.

## Connexion

1. Se connecter avec un compte école existant (`owner_id` déjà lié).
2. **Attendu** : redirection vers `/dashboard/ecole`, sidebar affiche le nom et la ville de l'établissement,
   badge vérifié si `is_verified`.

## Navigation

1. Cliquer sur chaque élément de la sidebar (Vue d'ensemble, Mon établissement, Admissions, Enseignants,
   Emplois du temps, Présences, Documents, Galerie, Actualités, Statistiques, Paramètres, Support).
2. **Attendu** : chaque lien mène à une page qui charge sans erreur console. Enseignants/Emplois du
   temps/Présences redirigent vers `/pro/acces-restreint` si le forfait n'est pas Pro (icône cadenas visible
   avant le clic).
3. Vérifier que les anciennes routes directes (`/dashboard/ecole/frais`, `/classes`, `/infrastructure`,
   `/paiements`) restent accessibles (via "Mon établissement") et fonctionnelles à l'identique d'avant cette
   mission.

## Responsive (Phase 9)

Aucun test visuel réel effectué (pas de navigateur instrumenté dans cet environnement — même limite
méthodologique que documentée dans `docs/sprints/SPRINT-01/07_RESPONSIVE.md`). À tester manuellement :

1. 375px / 768px / 1024px / 1440px sur `/dashboard/ecole` et `/dashboard/ecole/etablissement`.
2. Vérifier que la sidebar mobile (`mobileOpen`) s'ouvre/ferme correctement avec la nouvelle barre supérieure
   commune (desktop + mobile, remplaçant l'ancienne barre mobile-uniquement).
3. Vérifier que la grille de cartes KPI (4 colonnes en desktop) reste lisible en 2 colonnes sur mobile
   (`grid-cols-2 lg:grid-cols-4`, classes déjà utilisées ailleurs dans le dashboard existant).
4. **Mode tablette** (Phase 9) : vérifier spécifiquement la zone 768-1023px, où la sidebar bascule de mobile à
   desktop (`lg:` = 1024px chez Tailwind) — n'a pas été testée visuellement, à confirmer.

## Permissions

1. Se connecter avec un compte sans établissement lié (`owner_id` jamais renseigné).
2. **Attendu** : `dashboard/ecole/page.tsx` affiche "Aucun établissement lié" (comportement inchangé). Les
   nouvelles pages (`etablissement`, `centre-documentaire`, `statistiques`, `support`) doivent être vérifiées
   individuellement — chacune retourne `null`/rien si `school` est `null` après chargement (`if (!school) return
   null`), cohérent avec le reste du dashboard.
3. Confirmer qu'aucune des nouvelles pages n'accepte d'ID d'établissement en paramètre d'URL (elles n'en ont
   aucun — vérifié dans le code, voir `04_SECURITY.md`).

## Checklist

1. Sur un établissement incomplet (logo absent, aucune photo, frais non renseignés), vérifier que la carte
   "Complétez votre fiche" apparaît sur la Vue d'ensemble avec le bon pourcentage et la bonne liste de tâches
   manquantes.
2. Ajouter un logo/une photo/des frais, recharger la page.
3. **Attendu** : le pourcentage augmente, la tâche complétée disparaît de la liste. À 100 %, la carte checklist
   disparaît entièrement (comportement voulu, voir `03_WIDGETS.md`).

## Statistiques

1. Charger `/dashboard/ecole/statistiques` sur un établissement avec des préinscriptions existantes.
2. **Attendu** : le graphique par semaine reflète le nombre réel de préinscriptions par période. Les cartes
   Visiteurs/Pages vues/Popularité affichent "Non disponible" — **ne doivent jamais afficher un chiffre**, quel
   que soit l'état des données.

## Non-régression

1. Vérifier que `dashboard/admin/*` (hors périmètre de cette mission) fonctionne toujours à l'identique.
2. Vérifier que les 8 pages non modifiées (`admissions`, `classes`, `annonces`, `frais`, `infrastructure`,
   `documents`, `galerie`, `paiements`, `onboarding`) fonctionnent exactement comme avant cette mission — leur
   code interne n'a subi aucune modification.
