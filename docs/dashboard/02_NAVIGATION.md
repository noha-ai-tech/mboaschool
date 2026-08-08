# 02 — Navigation (Phase 2)

## Structure

La sidebar (`src/app/dashboard/ecole/layout.tsx`) est regroupée en 4 sections plutôt qu'une liste plate de 11
liens (état précédent) :

| Groupe | Éléments | Cible |
|---|---|---|
| — | Vue d'ensemble | `/dashboard/ecole` (redessinée, Phase 3/4) |
| Gestion | Mon établissement | `/dashboard/ecole/etablissement` (nouveau hub) |
| Gestion | Admissions | `/dashboard/ecole/admissions` (inchangée) |
| Gestion | Enseignants | `/pro/enseignants` si forfait Pro, sinon `/pro/acces-restreint` |
| Gestion | Emplois du temps | `/pro/emplois-du-temps` si forfait Pro, sinon `/pro/acces-restreint` |
| Gestion | Présences | `/pro/pointage/historique` si forfait Pro, sinon `/pro/acces-restreint` |
| Contenu | Documents | `/dashboard/ecole/centre-documentaire` (nouveau hub, Phase 7) |
| Contenu | Galerie | `/dashboard/ecole/galerie` (inchangée) |
| Contenu | Actualités | `/dashboard/ecole/annonces` (inchangée, renommée dans la nav uniquement) |
| Pilotage | Statistiques | `/dashboard/ecole/statistiques` (nouvelle page, Phase 5) |
| Pilotage | Paramètres | `/dashboard/ecole/parametres` (étendue additivement, Phase 8) |
| Pilotage | Support | `/dashboard/ecole/support` (nouvelle page) |

## Ce qui a disparu de la liste plate et où c'est allé

L'ancienne navigation listait aussi *Classes*, *Frais*, *Infrastructures*, *Paiements* en liens directs. Ces
quatre pages **existent toujours, inchangées**, mais ne sont plus des entrées de premier niveau — la mission
définit une liste de 12 éléments qui ne les inclut pas explicitement. Elles sont regroupées et restent
accessibles depuis le nouveau hub **Mon établissement** (`docs/dashboard/03_WIDGETS.md`).

## Modules Pro — verrouillage visuel

Enseignants / Emplois du temps / Présences pointent vers le module Pro existant. Si `school.forfait !== "pro"`,
le lien redirige vers `/pro/acces-restreint` (page déjà existante, inchangée) et une icône de cadenas
s'affiche dans la sidebar — signal visuel clair sans dupliquer la logique de vérification déjà gérée par le
middleware (`src/middleware.ts`, inchangé).

## Centre de notifications

Cloche persistante dans une nouvelle barre supérieure (desktop et mobile — auparavant la barre supérieure
n'existait qu'en mobile). Voir `03_WIDGETS.md` pour le détail du composant `NotificationBell`.

## Ce qui n'a PAS changé

Le contenu de `admissions`, `classes`, `annonces`, `frais`, `infrastructure`, `documents`, `galerie`,
`paiements`, `onboarding` — uniquement leur point d'entrée dans la navigation évolue.
