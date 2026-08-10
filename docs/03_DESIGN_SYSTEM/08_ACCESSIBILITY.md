# 08 — Accessibility

## Pourquoi ce n'est pas optionnel ici

Écoles237 s'adresse à des parents et des directeurs de tous âges et de tous
niveaux d'aisance numérique, souvent sur des appareils d'entrée de gamme, en
plein soleil, parfois avec une connexion instable qui force à naviguer au
clavier/lecteur d'écran pendant un chargement partiel. L'accessibilité n'est
pas une case à cocher réglementaire — c'est directement le public réel du
produit.

Mission 09 (Release Candidate) a déjà trouvé et corrigé deux failles
concrètes (boutons icône sans `aria-label`, champs de formulaire sans
`label`/`for` associés) — ce document formalise les règles qui auraient dû
empêcher ces failles d'apparaître.

## Niveau cible

**WCAG 2.1 niveau AA** sur l'ensemble du produit. Le niveau AAA n'est pas
visé (contraintes de contraste trop strictes pour une palette de marque
colorée), sauf pour le texte critique (messages d'erreur, montants d'argent)
où AAA est atteint par construction (Text Primary sur Background = 18.9:1).

## Règles obligatoires par composant

- **Tout élément interactif sans texte visible** (IconButton, bouton de
  fermeture, bouton d'envoi avec icône seule) porte un `aria-label`
  explicite — sans exception, sans "on verra plus tard". Vérifié
  systématiquement avant qu'un composant soit considéré terminé.
- **Tout champ de formulaire** a un `<label>` avec `htmlFor` pointant vers
  l'`id` du champ — jamais un placeholder utilisé comme seul label, jamais
  un label purement visuel sans association programmatique.
- **Tout focus est visible** : anneau `2px solid Primary` avec
  `outline-offset: 2px` (voir `04_COMPONENTS.md`), jamais
  `outline: none` sans remplacement.
- **Navigation clavier complète** : tout ce qui est cliquable à la souris
  est atteignable au `Tab` et activable au `Entrée`/`Espace`. Ordre de
  tabulation = ordre visuel, jamais l'inverse.
- **Piège de focus** dans Modal/Drawer : le focus reste contenu tant que le
  composant est ouvert, revient à l'élément déclencheur à la fermeture
  (voir `04_COMPONENTS.md` §Modal).
- **Contraste minimum 4.5:1** pour tout texte de moins de 18px, 3:1 pour le
  texte large (24px+) ou en gras (19px+/700) — vérifié pour chaque paire de
  la palette officielle (`02_COLOR_SYSTEM.md`, dernière section).
- **Jamais la couleur seule** pour porter une information : un badge
  "Refusé" a toujours le mot "Refusé" en plus de la couleur Danger, un
  champ en erreur a toujours un message texte en plus de la bordure rouge.
- **Images** : `alt` descriptif pour toute image porteuse de sens (photo
  d'école), `alt=""` explicite pour le décoratif — jamais d'`alt` manquant.
- **`prefers-reduced-motion`** respecté (voir `06_MOTION.md`, dernière
  section).

## Structure sémantique

- Une seule balise `<h1>` par page.
- Hiérarchie de titres sans saut (`h1` → `h2` → `h3`, jamais `h1` → `h3`
  directement).
- Landmarks HTML natifs (`<nav>`, `<main>`, `<header>`, `<footer>`) plutôt
  que des `<div>` génériques partout — permet la navigation par landmarks
  au lecteur d'écran.
- Tableaux de données en vraies balises `<table>`/`<th>`/`<td>` (voir
  `04_COMPONENTS.md` §Table) — pas de `<div>` en grille qui *ressemble* à
  un tableau sans en avoir la sémantique, motif actuellement dominant dans
  le produit (Phase 1).

## Processus

Toute nouvelle page/composant passe par une vérification rapide avant
livraison : navigation complète au clavier seul, lecture des labels au
survol, vérification du contraste des nouvelles couleurs introduites. Ce
n'est pas un audit externe ponctuel — c'est une étape de la définition de
"terminé", au même titre que le build/lint déjà systématiques depuis
Mission 09.
