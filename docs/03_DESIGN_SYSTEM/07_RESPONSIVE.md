# 07 — Responsive

## Stratégie : Mobile First, sans exception

La majorité des parents et une part significative des directeurs d'école
accèdent à Écoles237 depuis un smartphone d'entrée/milieu de gamme, souvent
en 3G. Toute conception démarre donc par l'écran le plus contraint (375px),
jamais l'inverse. Un écran qui "marche aussi sur mobile" après coup est un
échec de méthode, pas un détail à corriger plus tard.

## Breakpoints officiels

| Token | Largeur | Appareil de référence |
|---|---|---|
| `mobile` | 0–639px | Smartphone (test impératif à 320px et 375px) |
| `tablet` | 640–1023px | Tablette portrait, petit laptop fenêtré |
| `laptop` | 1024–1279px | Laptop standard |
| `desktop` | 1280–1919px | Écran desktop standard |
| `ultra-wide` | 1920px+ | Grand écran — le contenu ne s'étire jamais au-delà du conteneur max (`05_LAYOUT.md`), seul le fond peut occuper toute la largeur |

Correspondance directe avec les préfixes Tailwind déjà utilisés dans le
dépôt (`sm:`=tablet, `lg:`=laptop, `xl:`=desktop, `2xl:`=ultra-wide) — ce
document formalise des points de bascule déjà utilisés de fait, sans
introduire de nouveau système de breakpoints à migrer.

## Règles par composant transversal

- **Sidebar (dashboards)** : masquée en dessous de `laptop`, remplacée par
  un menu tiroir (`Drawer`, voir `04_COMPONENTS.md`) déclenché par une icône
  hamburger — comportement déjà en place sur `dashboard/ecole`, à
  généraliser aux 3 autres dashboards lors de leur reconstruction
  (`10_UI_ROADMAP.md`).
- **Table** : bascule en liste de Cards en dessous de `tablet` (voir
  `04_COMPONENTS.md` §Table) — jamais de scroll horizontal forcé, illisible
  au tactile.
- **StatCard rows** : 2 colonnes en `mobile`, 4 en `tablet` et au-delà.
- **Modal** : plein écran (`full`, voir `04_COMPONENTS.md`) en dessous de
  `tablet`, jamais une modale centrée avec marges minuscules sur petit
  écran.
- **Formulaires** : une seule colonne en `mobile`, deux colonnes à partir de
  `tablet` uniquement pour les champs courts (prénom/nom, ville/région) —
  jamais pour un champ de texte long.

## Cibles tactiles

Toute cible interactive (bouton, lien de navigation, case à cocher) mesure
au minimum **44×44px** en `mobile`/`tablet`, y compris quand l'élément
visuel est plus petit (padding invisible autour d'une icône 20px, par
exemple) — norme Apple HIG / WCAG 2.5.5, reprise ici car directement liée
au public cible (Phase 1 §6 des principes).

## Test obligatoire

Toute nouvelle page doit être vérifiée à 320px, 375px, 768px, 1024px et
1440px avant d'être considérée terminée (repris de la discipline déjà
appliquée en Mission 09 Phase 4, désormais formalisé comme référence
permanente plutôt qu'une vérification ponctuelle par mission).

## Ce qu'on évite

- Pas de media queries "entre deux" en dehors des 5 breakpoints officiels —
  toute exception ponctuelle (`min-width: 850px` par exemple) est un signal
  que le composant est mal conçu, pas que le système manque un palier.
- Pas de contenu qui n'existe QUE sur desktop (ex. une fonctionnalité
  cachée en `mobile`) sauf densité d'information réellement impossible à
  adapter (ex. un graphique complexe peut se simplifier, jamais disparaître
  totalement sans alternative).
