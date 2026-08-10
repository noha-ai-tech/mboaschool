# 20 — Landing Components

Inventaire des composants utilisés par section, tous issus du Design
System V2 (`04_COMPONENTS.md`). Aucun ancien composant de la landing
actuelle n'est réutilisé — reconstruction complète conforme à la consigne
"aucun ancien composant".

## Composants existants du Design System, réutilisés tels quels

| Composant | Sections | Variant utilisé |
|---|---|---|
| `Logo` | Header, Footer | `light` (header, fond clair) / `dark` (footer, fond Accent) |
| `Favicon` | — | Uniquement via metadata (`09_BRANDING.md`), pas affiché dans la page |
| `Button` | Hero, Établissements, Module Pro | `primary` (CTA Hero gauche, "Créer la page de mon école"), `secondary` (CTA Hero droite), `link` (Module Pro, "Découvrir →") |
| `Input` | Recherche | `lg`, avec icône recherche à gauche |
| `Card` | Pourquoi, Établissements (bénéfices) | `flat` — jamais `interactive` (ces cartes ne sont pas cliquables) |
| `SchoolCard` | Recherche (aperçu) | Variant existant, inchangé |
| `HeroCard` | Établissements (fond dégradé Accent → Primary) | Tel que défini en `04_COMPONENTS.md` |
| `Metric` | Statistiques | 3 instances en ligne |
| `Avatar` | Témoignages | `md`, fallback initiales si pas de photo fournie |
| `Badge` | (aucun usage sur la landing — volontaire, la landing ne montre aucun statut système) | — |

## Composants nouveaux nécessaires (absents de `04_COMPONENTS.md`)

Le Design System V2 couvre les composants d'interface produit (dashboard,
formulaires) mais pas certains éléments propres à une landing marketing.
Trois ajouts nécessaires, à intégrer rétroactivement à `04_COMPONENTS.md`
lors de l'implémentation :

| Nouveau composant | Rôle | Spécification |
|---|---|---|
| `BrowserFrame` | Cadre de mockup produit (Hero, Établissements) | `rounded-2xl`, ombre `elevation-2`, barre de titre minimale (3 points, pas d'URL fictive — éviter tout élément qui daterait visuellement le mockup) |
| `StepIndicator` | Numérotation des 3 étapes (Section 3) | Chiffre en Text Secondary 40px + ligne connectrice `Border` 1px, jamais de cercle plein coloré |
| `Testimonial` | Citation (Section 8) | `Avatar` + nom + rôle + citation en `Body Large`, guillemet décoratif en Primary Light à faible opacité, jamais de note en étoiles (voir `18_LANDING_COPYWRITING.md`) |

## Ce qui n'est délibérément pas utilisé

- **`Modal`/`Drawer`** : aucune action de la landing ne nécessite une
  fenêtre superposée — tout CTA mène à une vraie page (`/preinscription`,
  `/auth/inscription`).
- **`Table`** : aucune donnée tabulaire sur une landing marketing.
- **`Tabs`** : la landing est un scroll unique, pas une interface à
  onglets — cohérent avec "une seule action principale par écran"
  appliqué à l'échelle de la page entière.
- **Icônes en excès** : maximum 1 icône par bloc (Section 2, 3), jamais
  d'icône décorative sans rôle informatif — conforme à "peu d'icônes".
