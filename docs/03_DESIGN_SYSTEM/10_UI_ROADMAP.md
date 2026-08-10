# 10 — UI Roadmap

Ce document n'est pas exécuté par cette mission (Phase 12 : architecture
uniquement, aucun code touché). Il fixe l'ordre recommandé pour la
**prochaine** mission d'implémentation, afin que le Design System ne reste
pas seulement un document mais devienne le code réel du produit.

## Pourquoi un ordre précis, pas un big-bang

Réécrire toutes les pages d'un coup romprait exactement la discipline que
ce Design System cherche à instaurer (voir Mission 09 : "pas de
refactoring massif"). L'implémentation doit suivre le même principe que
toutes les missions précédentes : fondations d'abord, puis migration
progressive, jamais une réécriture totale en une seule fois.

## Étape 0 — Fondations techniques (préalable obligatoire)

1. `tailwind.config.ts` : déclarer les tokens de `02_COLOR_SYSTEM.md`,
   `05_LAYOUT.md` (spacing/elevation) et `06_MOTION.md` comme extensions
   du thème — plus aucune couleur/radius/durée en valeur brute après cette
   étape.
2. `src/app/layout.tsx` : intégrer Manrope via `next/font/google`
   (`03_TYPOGRAPHY.md`).
3. `globals.css` : supprimer la couleur de fond concurrente (`#fbf8ef`),
   aligner sur le token `Background` officiel.

Aucune page ne doit changer visuellement à cette étape au-delà de la
police et du fond — c'est une étape d'outillage, pas de redesign.

## Étape 1 — Composants primitifs

Dans cet ordre, du plus réutilisé au moins réutilisé (mesuré sur le
dépôt actuel) : **Button, Input, Badge, Card, Modal/Drawer, Table,
Skeleton**, puis le reste de `04_COMPONENTS.md`. Chaque composant remplace
ses équivalents dupliqués au fur et à mesure qu'une page est de toute façon
retouchée pour une autre raison (bug, nouvelle fonctionnalité) — pas de
mission dédiée "remplacer tous les boutons".

## Étape 2 — Dashboards (Phase 6)

Reconstruction dans l'ordre : **École** (le plus utilisé, le plus abouti
déjà) → **Admin** → **Enseignant** → **Parent** (le seul qui n'existe pas
encore — voir `05_LAYOUT.md`, à cadrer comme une mission fonctionnelle à
part entière, pas seulement un habillage visuel).

## Étape 3 — Pages publiques

Accueil, fiche école, catégories, préinscription, suivi — en dernier, car
ce sont les pages qui convertissent aujourd'hui et qui portent le plus de
risque de régression si retouchées sans discipline.

## Décisions explicitement reportées (hors périmètre Design System)

- **Choix d'une librairie de graphiques** pour `ChartCard` — décision
  technique (bundle size, licence), pas une décision de design. À trancher
  au moment de l'implémentation d'un premier écran qui en a réellement
  besoin.
- **Mode sombre applicatif** (bascule utilisateur clair/sombre pour tout le
  produit) — les tokens actuels le permettent sans renommage futur, mais
  ce n'est pas une demande produit exprimée à ce jour. Ne pas construire
  en avance de besoin.
- **Dashboard Parent** — nécessite d'abord une décision produit (compte
  parent obligatoire ou non, quel périmètre) avant qu'un design puisse
  être verrouillé au-delà des principes déjà posés en `05_LAYOUT.md`.
- **Illustrations custom** — non nécessaires tant que les états vides
  textuels (`09_BRANDING.md`) suffisent ; à revisiter si le produit gagne
  un budget design dédié.

## Critère de sortie

Le Design System sera considéré "en production" quand : `tailwind.config.ts`
contient tous les tokens, zéro couleur brute (`bg-[#...]`) ne subsiste dans
`src/`, et les 7 composants de l'Étape 1 sont utilisés par au moins 80% des
pages qui en ont l'usage. Mesurable, donc vérifiable mission après mission
— pas un objectif flou.
