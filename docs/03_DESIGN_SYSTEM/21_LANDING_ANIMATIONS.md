# 21 — Landing Animations

Strictement dans le cadre de `06_MOTION.md` : `fade`, `slide`, `hover`,
`scale`, 150-250ms, jamais plus. Aucune animation supplémentaire n'est
introduite pour la landing — la contrainte de la mission ("jamais plus")
est une contrainte du Design System déjà posée, pas une nouvelle règle.

## Par section

| Section | Animation | Détail |
|---|---|---|
| Hero | `fade + slide` (translateY 12px → 0) à l'arrivée sur la page, 250ms, décalage de 80ms entre le texte et le mockup (le texte apparaît légèrement avant) | Une seule fois au chargement, jamais rejouée au scroll |
| Pourquoi / Comment ça marche / Établissements / Module Pro / Statistiques / Témoignages / FAQ | `fade + slide` (translateY 8px → 0) déclenché à l'entrée dans le viewport (`IntersectionObserver`), 200ms, décalage 40ms entre éléments d'une même grille (max 3 éléments décalés, cohérent avec `06_MOTION.md` §Card reveal) | Jouée une seule fois par section, jamais en boucle au scroll répété |
| Recherche (barre) | `scale` léger (1 → 1.01) + ombre renforcée au `focus`, 150ms | Signal que le champ est actif, sans déplacement de layout |
| SchoolCard (aperçu) | `hover` : élévation `elevation-0 → elevation-1` + `translateY(-2px)`, 150ms | Identique à la spec Card interactive de `04_COMPONENTS.md`, aucune variante propre à la landing |
| Boutons (CTA) | `hover` : assombrissement 8%, 150ms · `press` : `scale(0.98)`, 100ms | Identique à `04_COMPONENTS.md` §Button, aucune variante |
| Chips de filtre (Section 4) | `hover` + `active` : fond Muted → Primary Light, 150ms | Pas d'animation de sélection complexe |

## Ce qu'on n'utilise jamais sur cette page

- Pas de parallax (mockup Hero, image de fond) — coût de performance non
  justifié pour un gain esthétique marginal, contraire à
  `01_DESIGN_PRINCIPLES.md` §6.
- Pas de compteur animé sur les statistiques (chiffres qui défilent de 0
  à la valeur finale) — effet vu partout, ne sert pas la sobriété
  demandée en Section 7 ("aucune animation excessive" est une consigne
  explicite de la mission pour cette section précise).
- Pas d'animation déclenchée à chaque passage dans le viewport (scroll
  haut puis bas) — une fois jouée, une section reste stable, évite l'effet
  "clignotant" en scroll rapide.

## Accessibilité du mouvement

`prefers-reduced-motion: reduce` désactive tous les `fade + slide`
d'entrée de section (le contenu apparaît directement, sans transition) —
seuls `hover`/`focus` fonctionnels restent actifs, cohérent avec
`06_MOTION.md` dernière section et `08_ACCESSIBILITY.md`.
