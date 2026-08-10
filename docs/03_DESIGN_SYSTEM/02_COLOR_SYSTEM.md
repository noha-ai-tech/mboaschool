# 02 — Color System

## Décision de fond

Le vert déjà utilisé dans le produit (`emerald-600`, `#059669`) devient la
**couleur primaire officielle**. Le rouge et le jaune du drapeau restent
des **couleurs de marque secondaires**, réservées au logo et à des accents
de marque très ponctuels (bande d'annonce, étoiles décoratives) — ils ne
sont **jamais** utilisés comme couleurs sémantiques d'interface. Le rouge
"danger" et le jaune "warning" ci-dessous sont des teintes fonctionnelles
distinctes, choisies pour leur lisibilité en UI, pas pour matcher le
drapeau.

Cette distinction résout directement l'incohérence trouvée en Phase 1 (un
second vert `#007A3D` utilisé dans 3 fichiers sans raison) : il n'existe
plus qu'un seul vert de marque à partir de maintenant.

## Palette officielle

| Token | Valeur | Usage |
|---|---|---|
| **Primary** | `#059669` | Couleur de marque. Boutons primaires, liens actifs, focus ring, icônes actives, badge "vérifié". |
| **Primary Dark** | `#047857` | Hover/press sur Primary, texte sur fond Primary Light. |
| **Primary Light** | `#ECFDF5` | Fond de badge/pastille sur les surfaces claires, halo de focus léger. |
| **Success** | `#059669` | Identique à Primary par choix assumé (produit à dominante verte) — mais token sémantique séparé : un futur changement de couleur de marque ne doit jamais changer le sens de "succès". |
| **Warning** | `#F59E0B` | États "en attente", "à vérifier", "documents requis". Jamais le jaune du logo (`#FFC72C`), qui reste réservé à la marque. |
| **Danger** | `#DC2626` | Erreurs, suppressions, suspensions, refus. Jamais le rouge du logo (`#CE1126`), même logique que Warning. |
| **Background** | `#FAF8F3` | Fond de page par défaut. Remplace les deux valeurs actuellement en concurrence (`#f9f7f2` et `#fbf8ef`, voir audit). |
| **Surface** | `#FFFFFF` | Cartes, formulaires, tout bloc posé sur Background. |
| **Surface Elevated** | `#FFFFFF` + `shadow-elevated` (voir `09_BRANDING.md` §Élévation) | Modales, menus déroulants, tiroirs — se distingue de Surface par l'ombre, jamais par une teinte différente. |
| **Border** | `#E8E6E1` | Bordures de cartes/inputs sur Background clair. Unifie `#ebebeb`/`#e5e5e5`/`#ddd` actuellement interchangeables. |
| **Muted** | `#F4F3EF` | Fond des zones secondaires (barres de recherche, lignes alternées de tableau, skeletons). |
| **Text Primary** | `#0A0A0A` | Titres, boutons, corps de texte important. Remplace `#0f172a` (globals.css) qui disparaît. |
| **Text Secondary** | `#6B7280` | Sous-titres, légendes, métadonnées (dates, compteurs). |
| **Accent** | `#0A0F0D` | Le "noir vert" déjà utilisé pour tous les fonds sombres (sidebars, header Pro, footer). Devient un token à part entière plutôt qu'une valeur répétée. |
| **Glass** | `rgba(255, 255, 255, 0.72)` + `backdrop-blur(20px)` | Barres flottantes, en-têtes qui survolent du contenu (voir `09_BRANDING.md`). |
| **Overlay** | `rgba(10, 15, 13, 0.55)` | Fond des modales/tiroirs, dérivé de Accent plutôt qu'un noir neutre — garde la teinte de marque même dans l'obscurcissement. |

## Palette drapeau (marque uniquement, jamais fonctionnelle)

| Token | Valeur | Usage strictement limité à |
|---|---|---|
| Brand Green | `#059669` | = Primary (le vert du drapeau et le vert produit sont unifiés) |
| Brand Red | `#CE1126` | Logo, accents décoratifs de marque (étoiles, liseré) |
| Brand Yellow | `#FCD116` | Logo, accents décoratifs de marque |

## Mode sombre des surfaces sombres existantes

Les sidebars/headers sombres ne sont **pas** un "dark mode" au sens
produit (le reste de l'app reste clair) — ce sont des zones "Accent" fixes.
Un vrai mode sombre pour toute l'application est explicitement hors
périmètre de cette mission (voir `10_UI_ROADMAP.md`) ; les tokens
ci-dessus sont néanmoins nommés de façon à rendre cette évolution possible
plus tard sans renommage (ex. `Surface` pourrait devenir `#111111` en dark
mode sans changer son rôle).

## Règles d'usage

1. **Jamais de couleur brute dans une page.** Toute couleur doit se
   justifier par un des tokens ci-dessus — si aucun token ne convient, la
   question à se poser est "quel token manque", pas "quelle valeur je
   choisis pour cette fois".
2. **Danger et Warning ne sont jamais des choix de goût.** Un bouton rouge
   signifie toujours une action destructive ou un état d'erreur — jamais
   une simple préférence visuelle pour "ce qui ressort bien".
3. **Le rouge/jaune de marque ne s'utilise jamais en dehors du logo et de
   ses accents directs.** Un badge de statut "refusé" utilise Danger
   (`#DC2626`), jamais Brand Red (`#CE1126}`) — même si visuellement
   proches, ce sont deux décisions différentes.
4. **Contraste minimum AA** (voir `08_ACCESSIBILITY.md`) — vérifié pour
   chaque paire texte/fond de cette palette : Text Primary sur Background
   (18.9:1), Text Secondary sur Background (4.6:1), blanc sur Primary
   (3.4:1 — suffisant pour du texte large/bold uniquement, jamais pour du
   texte de corps sur fond Primary).
