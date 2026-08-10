# 22 — Landing Responsive

Conception Mobile First stricte : chaque section ci-dessous est pensée à
375px d'abord, puis étendue — jamais l'inverse. Breakpoints officiels :
`07_RESPONSIVE.md`.

## Section par section

**1. Hero**
- Mobile : 1 colonne, texte centré, les 2 CTA empilés pleine largeur,
  mockup en dessous (réduit, `BrowserFrame` à 90% de la largeur d'écran).
- Tablet+ : 2 colonnes, CTA en ligne, mockup à droite en pleine hauteur de
  section.

**2. Pourquoi**
- Mobile : 1 colonne empilée, icône + titre + phrase centrés.
- Tablet : 2 colonnes (3e bloc en dessous, centré).
- Laptop+ : 3 colonnes.

**3. Comment ça marche**
- Mobile : 1 colonne, numérotation verticale à gauche du texte (pas de
  ligne connectrice horizontale, remplacée par une ligne verticale fine).
- Laptop+ : 3 colonnes avec connecteur horizontal.

**4. Recherche**
- Mobile : barre de recherche pleine largeur, chips de filtre en scroll
  horizontal (jamais de retour à la ligne qui pousserait le contenu vers
  le bas), `SchoolCard` en 1 colonne.
- Tablet : `SchoolCard` en 2 colonnes.
- Laptop+ : barre centrée max `640px`, `SchoolCard` en 3 colonnes.

**5. Établissements**
- Mobile : 1 colonne, texte puis les 4 blocs bénéfices en grille 2×2
  (jamais 1 colonne pure ici — 4 blocs courts restent lisibles en 2×2 même
  à 375px), mockup dashboard en dessous.
- Laptop+ : 2 colonnes (texte+bénéfices à gauche, mockup à droite).

**6. Module Pro**
- Mobile : mots-clés en grille 2×2 plutôt qu'en ligne (une ligne de 4
  mots déborderait ou se compresserait illisiblement à 375px).
- Tablet+ : ligne horizontale unique.

**7. Statistiques**
- Mobile : 3 chiffres empilés verticalement, séparateur horizontal fin
  entre chaque plutôt que vertical.
- Tablet+ : ligne horizontale avec séparateurs verticaux.

**8. Témoignages**
- Mobile : 1 colonne, citations empilées.
- Laptop+ : 2-3 colonnes selon le nombre réel de témoignages disponibles.

**9. FAQ**
- Identique à tous les breakpoints (1 colonne centrée) — une FAQ n'a
  jamais besoin de largeur supplémentaire, seulement d'être lisible.

**10. Footer**
- Mobile : colonnes empilées (logo d'abord, puis Produit, Entreprise,
  Légal, puis copyright).
- Laptop+ : 4 colonnes en ligne.

## Règles transversales

- Cibles tactiles 44px minimum sur tout élément interactif de la landing
  (CTA, chips, liens FAQ) — voir `07_RESPONSIVE.md`.
- Le `BrowserFrame` (Hero, Établissements) ne s'affiche jamais tronqué —
  s'il ne peut pas tenir dans la largeur disponible avec ses proportions
  réelles, il se réduit intégralement plutôt que de déborder ou d'être
  recadré.
- Aucun texte de la landing ne dépasse 75 caractères par ligne à aucun
  breakpoint (largeur de colonne contrainte même sur ultra-wide) —
  lisibilité avant remplissage de l'espace disponible.
- Test obligatoire avant livraison : 320px, 375px, 768px, 1024px, 1440px
  (reconduit de `07_RESPONSIVE.md`), avec une attention particulière à la
  Section 1 (Hero) où le mockup est l'élément le plus à risque de
  débordement.
