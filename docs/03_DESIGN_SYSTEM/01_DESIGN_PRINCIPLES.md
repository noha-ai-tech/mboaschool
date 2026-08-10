# 01 — Design Principles

Écoles237 n'est pas un site vitrine et n'est pas un ERP scolaire de plus.
C'est une plateforme SaaS qui doit se sentir aussi soignée que les outils que
ses utilisateurs utilisent déjà par ailleurs (WhatsApp Business, Google
Workspace, applications bancaires mobiles). Le niveau de référence — Stripe,
Linear, Notion, Vercel, Apple, Arc, Airbnb — n'est pas une question
d'esthétique gratuite : c'est une question de **confiance**. Un directeur
d'école qui hésite à mettre sa carte pour payer un abonnement, ou un parent
qui hésite à laisser le numéro de son enfant, se fie d'abord à ce qu'il voit.

## Les 6 principes

### 1. Clarté avant décoration
Chaque écran doit pouvoir être compris en un coup d'œil, sans légende. Un
directeur d'école ouvrant son dashboard doit savoir en moins de 5 secondes
si tout va bien ou s'il y a quelque chose à traiter (Phase 6). Une couleur,
une taille, une position ne sont jamais purement esthétiques — elles portent
toujours une information.

### 2. Une seule façon de faire chaque chose
Aujourd'hui, un bouton primaire peut être `rounded-xl`, `rounded-lg` ou
`rounded-md` selon la page où il a été écrit (voir l'audit, Phase 1). Le
Design System existe pour qu'il n'y ait plus jamais deux réponses possibles
à "comment doit ressembler un bouton primaire ici ?". La cohérence n'est pas
une contrainte esthétique, c'est ce qui permet à la plateforme de grandir
sans que chaque nouvelle page ne réinvente sa propre variante.

### 3. Calme, jamais bruyant
Écoles237 gère des sujets sensibles — l'inscription d'un enfant, la paie
d'un enseignant, la vérification d'une école. L'interface doit inspirer le
sérieux et le calme, pas la surexcitation. Pas de couleurs saturées à outrance,
pas d'animations qui attirent l'attention sans raison, pas de rouge/jaune
utilisés comme décoration — ces couleurs restent des signaux (voir
`02_COLOR_SYSTEM.md`).

### 4. Rapide à percevoir, pas seulement rapide à charger
Un produit "premium" ne se contente pas de charger vite (déjà couvert par
Mission 09) — il *paraît* rapide : chaque interaction a un retour visuel
immédiat (hover, press, focus), rien ne "saute" à l'écran (skeletons plutôt
que spinners nus, transitions courtes plutôt que changements brusques —
voir `06_MOTION.md`).

### 5. Le vert est la signature, pas un détail
Le vert (déjà présent dans le produit) devient la couleur de marque
officielle. Le rouge et le jaune du drapeau restent des couleurs
d'accompagnement du logo, jamais des couleurs d'interface généralisées —
ils ne doivent jamais entrer en concurrence avec les couleurs sémantiques
(succès/alerte/danger) définies dans `02_COLOR_SYSTEM.md`.

### 6. Conçu pour le Cameroun, pas malgré lui
Connexions parfois lentes, écrans d'entrée de gamme, usage tactile
majoritaire, alternance fréquent entre français et contexte local. Le
Design System doit rester léger (pas de librairies d'animation lourdes),
tactile-first (cibles ≥ 44px, voir `07_RESPONSIVE.md` et
`08_ACCESSIBILITY.md`), et ne jamais supposer un grand écran ou une
connexion rapide par défaut.

## Ce que ce document n'est pas

Ce n'est pas une liste de composants (`04_COMPONENTS.md`), pas une palette
(`02_COLOR_SYSTEM.md`), pas un plan de mise en œuvre (`10_UI_ROADMAP.md`).
C'est la boussole qui doit permettre de trancher, dans deux ans, une
question de design qu'aucun de ces documents n'aura anticipée — en revenant
à ces 6 principes plutôt qu'au goût du moment.
