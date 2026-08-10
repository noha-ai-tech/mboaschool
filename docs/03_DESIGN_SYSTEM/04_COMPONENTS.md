# 04 — Components

Spécification de référence. Aucun de ces composants n'est implémenté par
cette mission (architecture uniquement, voir `10_UI_ROADMAP.md` pour l'ordre
de construction recommandé). Tous les rayons/couleurs/durées cités renvoient
aux tokens définis dans `02_COLOR_SYSTEM.md`, `05_LAYOUT.md` et `06_MOTION.md`.

Convention commune à tous les composants interactifs : `focus` = anneau
`2px solid Primary` + décalage `2px` (`outline-offset`), jamais seulement un
changement de couleur de bordure (insuffisant en accessibilité, voir
`08_ACCESSIBILITY.md`). `disabled` = opacité 45% + `cursor-not-allowed`,
jamais un simple changement de couleur seul.

## Button

| Aspect | Spécification |
|---|---|
| Variants | `primary` (fond Primary, texte blanc), `secondary` (fond Surface, bordure Border, texte Text Primary), `ghost` (transparent, texte Text Primary, fond Muted au hover), `danger` (fond Danger, texte blanc), `link` (pas de fond, soulignement au hover) |
| Sizes | `sm` (32px hauteur, 13px texte), `md` (40px, 14px — défaut), `lg` (48px, 15px) |
| Radius | `10px` (unifie `rounded-md/lg/xl` concurrents relevés en Phase 1) |
| Hover | Assombrit de 8% (`primary`/`danger`) ou fond Muted (`secondary`/`ghost`) |
| Press | Scale `0.98`, 100ms |
| Loading | Spinner 16px remplace l'icône gauche, texte conservé, bouton désactivé |
| Icône | Optionnelle à gauche ou droite, jamais les deux sauf `IconButton` dédié |

## IconButton

| Aspect | Spécification |
|---|---|
| Variants | `default` (transparent, Text Secondary), `subtle` (fond Muted), `danger` (Danger au hover) |
| Sizes | `sm` (28px), `md` (36px — défaut), `lg` (44px, cible tactile minimale mobile) |
| Radius | `8px` |
| Obligatoire | `aria-label` toujours requis (aucune exception — voir `08_ACCESSIBILITY.md`, faille déjà trouvée en Mission 09) |

## Input

| Aspect | Spécification |
|---|---|
| États | `default`, `hover` (bordure Text Secondary), `focus` (anneau Primary), `error` (bordure + texte Danger, message sous le champ), `disabled` (fond Muted), `filled` |
| Sizes | `sm` (36px), `md` (40px — défaut), `lg` (48px) |
| Radius | `10px` |
| Label | Toujours au-dessus, jamais en placeholder seul (faille déjà trouvée en Mission 09 — labels non associés) |
| Icône | Optionnelle à gauche (recherche, téléphone) ou droite (validation, œil mot de passe) |

## Select

Mêmes états/tailles qu'Input. Chevron `16px` fixe à droite, jamais le
chevron natif du navigateur (incohérent entre OS). Menu ouvert = Surface
Elevated, `max-height` avec scroll, item actif = fond Primary Light.

## Textarea

Mêmes états qu'Input. Redimensionnement vertical uniquement, jamais
horizontal (`resize-y`). Hauteur minimale 3 lignes.

## Checkbox

| Aspect | Spécification |
|---|---|
| États | `unchecked`, `checked` (fond Primary, coche blanche), `indeterminate`, `disabled` |
| Taille | 18px, cible tactile étendue à 44px via padding invisible |
| Animation | Coche en `scale` 150ms à l'apparition |

## Switch

| Aspect | Spécification |
|---|---|
| États | `off` (fond Muted), `on` (fond Primary), `disabled` |
| Taille | 40×22px, poignée 18px |
| Animation | Translation poignée 150ms ease-out |

## Card

| Aspect | Spécification |
|---|---|
| Variants | `default` (Surface + bordure Border), `interactive` (+ hover : ombre `elevation-1`, translation -2px), `flat` (sans bordure, sur fond Muted) |
| Radius | `16px` |
| Padding | `24px` (desktop) / `16px` (mobile — voir `07_RESPONSIVE.md`) |

## StatCard

Card + structure fixe : icône (24px, cerclée Primary Light) → valeur (H2,
tabular-nums) → label (Small, Text Secondary) → variation optionnelle
(badge vert/rouge avec flèche). Jamais de valeur sans libellé, jamais de
libellé tronqué sans `title` HTML.

## Table

| Aspect | Spécification |
|---|---|
| Structure | En-tête sticky, ligne = 56px min (cible tactile), zébrage optionnel via Muted |
| Tri | Icône chevron sur l'en-tête cliquable, jamais de tri sans indicateur visuel de la colonne active |
| Ligne vide | État `EmptyState` dédié (voir `09_BRANDING.md`), jamais un tableau vide sans message |
| Mobile | Bascule automatique en liste de Cards en dessous de `md` (voir `07_RESPONSIVE.md`) — jamais de scroll horizontal forcé |

## Badge

| Aspect | Spécification |
|---|---|
| Variants sémantiques | `success` (Primary Light / Primary), `warning` (Warning Light / Warning), `danger` (Danger Light / Danger), `neutral` (Muted / Text Secondary), `info` (Blue Light / Blue — nouveau, absent de la palette actuelle car jamais nécessaire jusqu'ici) |
| Taille unique | 24px hauteur, `11px` texte, `full` radius |
| Règle | Une palette de statuts unique et documentée par domaine (admission, ticket, vérification...) — plus de palette réinventée à chaque écran (faille Phase 1) |

## Tabs

Soulignement animé (`translateX`/`width` 200ms) sous l'onglet actif plutôt
que fond plein — cohérent avec l'esthétique "calme" (`01_DESIGN_PRINCIPLES.md`).
Compteur optionnel en badge `neutral` à droite du libellé.

## Modal

| Aspect | Spécification |
|---|---|
| Tailles | `sm` (400px), `md` (560px — défaut), `lg` (720px), `full` (mobile uniquement) |
| Overlay | Token `Overlay` (voir `02_COLOR_SYSTEM.md`), fermeture au clic extérieur + `Esc` |
| Animation | Fade overlay + scale contenu `0.96 → 1`, 200ms (voir `06_MOTION.md`) |
| Focus trap | Obligatoire — premier élément focusable au montage, retour au déclencheur à la fermeture |

## Drawer

Variante de Modal ancrée à droite (LTR), largeur `420px` desktop / `100%`
mobile. Remplace les 3 implémentations dupliquées trouvées en Phase 1
(admissions, support admin, support école). Animation : `translateX(100% → 0)`
250ms.

## Toast

| Aspect | Spécification |
|---|---|
| Variants | `success`, `error`, `info` — mêmes couleurs sémantiques que Badge |
| Position | Bas-droite desktop, pleine largeur bas mobile |
| Durée | 4s par défaut, action "annuler" prolonge à 8s, jamais de fermeture auto sur erreur critique |
| Animation | Slide-in bas + fade, 200ms |

## Alert

Bandeau inline (pas de position fixe, contrairement à Toast). Variants
identiques à Badge. Utilisé pour les messages de formulaire (remplace les
implémentations incohérentes relevées en Phase 1 : bandeau haut vs texte
sous champ vs rien).

## Avatar

| Aspect | Spécification |
|---|---|
| Sizes | `xs`(24) `sm`(32) `md`(40) `lg`(56) `xl`(80) |
| Fallback | Initiales sur fond généré depuis le nom (palette fixe de 6 teintes dérivées de Primary — jamais aléatoire à chaque rendu) |
| Forme | `full` (personnes), `xl` radius (établissements — cohérent avec Card) |

## Skeleton

Fond Muted, animation `shimmer` (gradient qui traverse, 1.5s, `ease-in-out`
infini) plutôt que `pulse` (le `animate-pulse` actuel de Tailwind, jugé trop
brusque pour l'esthétique "calme"). Toujours calqué sur la forme exacte du
contenu réel (mêmes dimensions), jamais un bloc générique.

## Tooltip

Apparition différée 400ms (évite le clignotement au survol rapide),
disparition immédiate. Fond Accent, texte blanc, `8px` radius, flèche
directionnelle. Jamais de Tooltip contenant une information essentielle non
disponible ailleurs (règle d'accessibilité — inutilisable au tactile).

## Pagination

Boutons numérotés + précédent/suivant, état actif = fond Primary Light. Sur
mobile : uniquement précédent/suivant + "Page X sur Y" (jamais la liste
complète de numéros, illisible en dessous de 375px).

## SearchBar

Icône loupe fixe à gauche, `Escape` vide le champ, `Cmd/Ctrl+K` ouvre la
recherche globale si présente sur la page (raccourci réservé, cohérent avec
Stripe/Linear/Notion). Debounce 300ms avant déclenchement réseau.

## Metric

Version compacte de StatCard sans carte englobante — utilisée en ligne dans
un en-tête de page (ex. "24 écoles · 3 en attente"). Séparateur `·`, jamais
de bordures verticales entre métriques.

## ChartCard

Card contenant un graphique (barres/lignes) + légende. Aucune librairie de
graphique n'est choisie par cette mission (décision technique, hors
périmètre "architecture UI" — voir `10_UI_ROADMAP.md`) ; la spec visuelle
seule est fixée ici : axes en Text Secondary, série principale en Primary,
grille en Border à 40% d'opacité, jamais plus de 2 couleurs de série sans
légende explicite.

## HeroCard

Card `flat` pleine largeur avec dégradé de marque (Accent → Primary, angle
135°) — remplace les dégradés ad hoc déjà présents sur l'accueil (Phase 1).
Utilisée pour les bandeaux d'accroche (accueil, onboarding).

## SchoolCard

| Aspect | Spécification |
|---|---|
| Structure | Image (ratio 4:3, `Muted` en fallback) → nom + badges (vérifié/Pro) → localisation → catégorie → CTA |
| Hover | Élévation `elevation-1` + translation -2px (identique à Card `interactive`) |
| Skeleton | Version dédiée pendant le chargement de liste (remplace les 6 skeletons génériques dupliqués trouvés en Phase 1) |

## Dark mode

Aucun composant ci-dessus ne définit de variante "dark mode" complète dans
cette mission — seuls les tokens `Accent`/`Overlay` existent déjà pour les
zones sombres fixes (sidebars). Un vrai mode sombre applicatif (bascule
utilisateur) est explicitement reporté (voir `10_UI_ROADMAP.md`), mais
chaque composant ci-dessus est nommé/structuré pour ne pas bloquer cette
évolution : aucune couleur n'est codée en dur dans la spec, tout référence
un token de `02_COLOR_SYSTEM.md`.
