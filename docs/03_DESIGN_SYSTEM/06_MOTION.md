# 06 — Motion

## Principe

Une animation "digne d'Apple" n'est pas une animation impressionnante —
c'est une animation qu'on ne remarque pas consciemment, qui rend simplement
l'interface crédible et cohérente. Si un utilisateur dit "waouh, jolie
animation", c'est probablement trop long ou trop voyant. La règle : **jamais
plus de 250ms**, jamais d'animation qui retarde une action plutôt que de
l'accompagner.

## Durées officielles

| Token | Durée | Usage |
|---|---|---|
| `motion-fast` | 150ms | Hover, changement de couleur, press |
| `motion-base` | 200ms | Apparition/disparition (fade), ouverture de menu |
| `motion-slow` | 250ms | Modal, Drawer, transitions de page — jamais au-delà |

Aucune quatrième valeur n'existe. Si une transition "semble" avoir besoin de
plus de 250ms, le problème est ailleurs (trop d'éléments qui bougent à la
fois, pas la durée).

## Easing

- **Standard** (`cubic-bezier(0.4, 0, 0.2, 1)`) : la très grande majorité
  des transitions (hover, fade, changement de couleur).
- **Entrée** (`cubic-bezier(0, 0, 0.2, 1)`) : éléments qui apparaissent
  (Modal, Toast, Drawer) — démarrage rapide, fin en douceur.
- **Sortie** (`cubic-bezier(0.4, 0, 1, 1)`) : éléments qui disparaissent —
  symétrique de l'entrée.
- Jamais de `linear` sauf pour les animations infinies (Skeleton shimmer,
  spinner).

## Catalogue de mouvements

| Mouvement | Spécification |
|---|---|
| **Hover** | Couleur/ombre en `motion-fast` (150ms), easing standard. S'applique à Button, Card interactive, liens de navigation. |
| **Press** | `scale(0.98)` en 100ms (plus rapide que hover — doit se sentir instantané au clic), retour à `scale(1)` au relâchement. |
| **Fade** | Opacité `0 → 1`, `motion-base` (200ms). Apparition de contenu asynchrone (résultats de recherche, contenu chargé). |
| **Slide** | Translation 8–16px + fade combinés, `motion-base`. Utilisé pour les Dropdown/Select qui s'ouvrent, les Toast. |
| **Scale** | `0.96 → 1` + fade, `motion-slow` (200-250ms). Réservé à Modal — jamais à un simple hover (trop lourd pour une micro-interaction). |
| **Page transition** | Fade du contenu sortant (150ms) puis fade du contenu entrant (150ms) — jamais de slide latéral façon application mobile native, incohérent avec un site web. |
| **Card reveal** | Les cartes d'une liste (résultats d'école, admissions) apparaissent avec un `fade + translateY(8px)`, décalées de 30ms entre chaque carte jusqu'à 6 cartes maximum (au-delà, apparition simultanée — un décalage sur 40 cartes serait perçu comme un ralentissement, pas un effet). |
| **Skeleton loading** | `shimmer` en boucle infinie, 1.5s, `linear` (seule exception à l'easing standard, nécessaire pour un mouvement continu). Remplace `animate-pulse` (jugé trop abrupt, voir `04_COMPONENTS.md` §Skeleton). |

## Ce qu'on n'utilise jamais

- Pas de rebond ("bounce") — ne correspond à aucune des marques de
  référence citées par la mission (Stripe/Linear/Notion/Apple sont toutes
  sobres dans leurs courbes).
- Pas de rotation 3D / parallax — coûteux en performance sur les appareils
  d'entrée de gamme majoritaires au Cameroun (voir `01_DESIGN_PRINCIPLES.md`
  §6 et `07_RESPONSIVE.md`).
- Pas d'animation qui bloque l'interaction — un utilisateur doit toujours
  pouvoir cliquer/taper pendant qu'une animation se joue.

## Accessibilité du mouvement

Toute animation non essentielle doit respecter
`prefers-reduced-motion: reduce` (désactivation ou réduction drastique de
durée) — voir `08_ACCESSIBILITY.md`. Les transitions d'état fonctionnelles
(ouverture de Modal, par exemple) peuvent rester mais passent en fade simple
sans scale/translation.
