# 19 — Landing Layout

Structure et grille par section, en références aux tokens
`05_LAYOUT.md`. Conteneur global : `max-w-screen-xl` (1280px), marges
`space-5` (mobile) à `space-6` (desktop), cohérent avec l'existant.

## Rythme vertical global

Chaque section est séparée par `space-24` (96px) desktop / `space-12`
(48px) mobile — jamais deux sections collées. Alternance de fond
`Background` / `Surface` d'une section à l'autre pour marquer la
transition sans ajouter de bordure visible (cohérent avec "pas de
bordures lourdes").

| # | Section | Fond | Padding vertical |
|---|---|---|---|
| 1 | Hero | Background (dégradé de marque subtil, pas le dégradé saturé actuel) | `space-24` desktop / `space-16` mobile |
| 2 | Pourquoi | Surface | `space-20` |
| 3 | Comment ça marche | Background | `space-20` |
| 4 | Recherche | Surface | `space-20` |
| 5 | Établissements | Accent (fond sombre — seule section sombre de la page, crée une rupture volontaire) | `space-20` |
| 6 | Module Pro | Background | `space-16` (plus courte que les autres, cohérent avec sa discrétion) |
| 7 | Statistiques | Surface | `space-12` (courte, 1 ligne de chiffres) |
| 8 | Témoignages | Background | `space-20` |
| 9 | FAQ | Surface | `space-20` |
| 10 | Footer | Accent | `space-12` |

## Grille par section

**Section 1 — Hero** : 2 colonnes desktop (`grid-cols-[1fr_1fr]`, gap
`space-10`) — texte + CTA à gauche, mockup à droite. 1 colonne mobile,
mockup en dessous du texte (jamais au-dessus — le message passe avant la
preuve visuelle sur petit écran).

**Section 2 — Pourquoi** : 3 colonnes desktop (`grid-cols-3`, gap
`space-8`), 1 colonne mobile empilée. Chaque bloc centré verticalement sur
son icône.

**Section 3 — Comment ça marche** : 3 colonnes desktop avec connecteur
visuel léger (ligne fine `Border` entre les étapes, jamais une flèche
lourde), 1 colonne mobile avec numérotation verticale.

**Section 4 — Recherche** : 1 colonne centrée pour la barre de recherche
(largeur max `640px`, jamais pleine largeur — une barre trop large perd en
lisibilité), puis grille 3 colonnes desktop / 1 colonne mobile pour les
`SchoolCard` d'aperçu.

**Section 5 — Établissements** : 2 colonnes desktop (texte + 4 blocs
bénéfices en grille 2×2 / mockup dashboard à droite), inversé par rapport
au Hero (mockup à gauche) pour créer une rupture de rythme visuel entre
les deux sections à mockup.

**Section 6 — Module Pro** : 1 colonne centrée, texte + 4 mots-clés en
ligne horizontale (`flex`, wrap sur mobile) — pas de grille de cartes,
volontairement plus simple que la Section 5.

**Section 7 — Statistiques** : 1 ligne (`flex justify-around` desktop,
`grid grid-cols-1` empilé mobile) de 3 chiffres, séparateurs verticaux
fins (`Border`) entre chaque, jamais de carte autour.

**Section 8 — Témoignages** : 2-3 colonnes desktop selon le nombre de
citations disponibles (voir `18_LANDING_COPYWRITING.md`), 1 colonne mobile.

**Section 9 — FAQ** : 1 colonne centrée, largeur max `720px` — une FAQ
large sur toute la largeur nuit à la lisibilité des réponses.

**Section 10 — Footer** : 4 colonnes desktop (logo+description / Produit /
Entreprise / Légal), empilées mobile.

## Ce qui disparaît de la structure actuelle

- Le double affichage du CTA "Inscrire mon école" dans le header ET
  répété plusieurs fois dans le corps de page — un seul rappel en Section
  5, cohérent avec `12_SCREEN_BLUEPRINTS.md` §Landing Page.
- Le regroupement de résultats par sous-catégorie avec répétition du
  bandeau de filtre à chaque groupe (Section 4 devient un aperçu court,
  pas la liste complète — la liste complète reste sur `/categorie/[slug]`,
  hors périmètre de cette mission).
