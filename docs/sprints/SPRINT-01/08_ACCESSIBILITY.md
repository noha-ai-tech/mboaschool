# 08 — Accessibilité

Audit d'accessibilité de l'annuaire public. Méthode : lecture du code, recherche exhaustive d'attributs ARIA
(`role=`, `aria-label`, `aria-expanded`, `aria-selected`, `aria-hidden`) et de balises sémantiques dans
`src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/app/ecole/[id]/page.tsx`,
`src/components/LocalSchoolMap.tsx`. **Aucun test avec un lecteur d'écran réel (NVDA, VoiceOver) ni aucun outil
automatisé (axe, Lighthouse Accessibility) n'a pu être exécuté depuis cet environnement** — voir limite
méthodologique en fin de document. Aucune modification effectuée.

---

## 1. Navigation au clavier

- **Menu déroulant des catégories (header desktop, `src/app/page.tsx`)** : ouvert uniquement au survol de la
  souris (`group-hover:opacity-100 group-hover:visible`), **sans équivalent focus clavier**
  (`group-focus-within` absent). Un utilisateur naviguant au clavier (Tab) ne peut jamais ouvrir ce menu ni
  accéder aux sous-catégories qu'il contient — seul le lien "Tout voir" de chaque catégorie reste atteignable
  indirectement via le lien de catégorie principal, mais les sous-catégories listées dans le menu restent
  invisibles et donc inatteignables au clavier.
- Bouton hamburger du menu mobile (`<button className="lg:hidden ml-auto p-2" onClick={...}>`) : atteignable au
  clavier (élément `<button>` natif, bon point), mais sans `aria-expanded` pour indiquer son état ouvert/fermé
  aux technologies d'assistance.

## 2. Boutons icône sans libellé accessible

Plusieurs boutons composés uniquement d'une icône (`lucide-react`) n'ont pas d'`aria-label`, donc annoncés comme
"bouton" sans description par un lecteur d'écran :

| Fichier | Élément | Constat |
|---|---|---|
| `src/app/page.tsx` | Bouton fermeture de la modale carte (`<X size={20} />`) | Pas d'`aria-label` |
| `src/app/page.tsx` | Bouton suppression du filtre ville (`<X size={13} />`) | Pas d'`aria-label` |
| `src/app/page.tsx` | Bouton menu hamburger | Pas d'`aria-label` (voir §1) |
| `src/app/categorie/[slug]/page.tsx` | Flèches du carrousel vedettes (`ChevronLeft`/`ChevronRight`) | Pas d'`aria-label` |

**Contre-exemple positif** : les points de pagination du carrousel hero (`src/app/page.tsx`,
`aria-label={\`Image ${i + 1}\`}`) et les points de la fiche école (`src/app/ecole/[id]/page.tsx`,
`aria-label={\`Photo ${i + 1}\`}`) sont correctement libellés — la pratique existe déjà dans le code, elle n'est
simplement pas appliquée partout.

## 3. Onglets de la fiche école — sémantique manquante

`src/app/ecole/[id]/page.tsx` implémente les onglets "Général / Galerie / Documents / Annonces / Espace parent"
avec de simples `<button>` stylés conditionnellement (`activeTab === tab.id`). Aucun rôle ARIA `tablist`/`tab`/
`tabpanel`, aucun `aria-selected`, aucun `aria-controls`. Un lecteur d'écran annonce une liste de boutons
génériques, sans indiquer qu'il s'agit d'un jeu d'onglets ni lequel est actuellement actif.

## 4. Carte Leaflet — inaccessible par nature sans compensation

`src/components/LocalSchoolMap.tsx` : **aucun attribut ARIA sur le conteneur de carte** (`<div ref={containerRef}
className="w-full h-full" />` — pas d'`aria-label`, pas de `role`). Une carte interactive Leaflet est par nature
peu accessible (rendu canvas/SVG dynamique) ; la pratique recommandée est a minima un `aria-label` décrivant le
contenu ("Carte des établissements à proximité") et, idéalement, une alternative textuelle (liste des
établissements affichés) — cette dernière existe déjà indirectement dans `nearbySchools`, mais n'est jamais
rendue sous forme de liste accessible en complément de la carte.

## 5. Images — attribut `alt`

- Photos d'établissement (galerie, cartes résultat) : `alt={s.name}` ou équivalent — **correct**.
- Images du hero (`HERO_IMAGES`, `src/app/page.tsx`) : `alt=""` — acceptable si l'intention est purement
  décorative, mais l'intention n'est pas confirmée par un `aria-hidden="true"` complémentaire sur le conteneur,
  laissant l'ambiguïté entre "décoratif volontaire" et "alt oublié".

## 6. Contraste des couleurs

Analyse de code uniquement (pas de mesure colorimétrique réelle) : plusieurs textes secondaires utilisent des
teintes claires sur fond clair ou moyen (ex. `text-slate-400` sur `bg-white`, `text-white/60`/`text-white/70` sur
fond dégradé sombre du hero). Ces combinaisons sont **à vérifier avec un outil de contraste réel** (non fait ici)
— certaines paraissent à risque de ne pas atteindre le ratio WCAG AA (4.5:1 pour le texte normal) sans mesure
précise, notamment le texte `text-slate-400` utilisé de façon récurrente pour les métadonnées secondaires
(ville, téléphone) sur les trois pages auditées.

## 7. Mouvement et animation

Aucune media query `prefers-reduced-motion` détectée dans `globals.css` ni dans les classes Tailwind utilisées.
La bannière défilante (`animate-marquee`, boucle infinie) et les transitions de carrousel (hero, fiche école)
s'exécutent inconditionnellement, sans réduction pour les utilisateurs ayant activé la préférence système
"réduire les animations".

## 8. Structure sémantique

- `<h1>` unique et correctement utilisé sur `/ecole/[id]` (nom de l'école) et `/categorie/[slug]` (nom de la
  catégorie) — bon point.
- La page d'accueil (`/`) n'a pas de `<h1>` visible identifié dans la zone hero (le titre de recherche
  "Trouvez l'école idéale près de chez vous" est un `<h2>`, sans `<h1>` de niveau supérieur sur la page) —
  à vérifier, une page d'accueil sans `<h1>` clair est un gap SEO et accessibilité classique.
- Utilisation cohérente de `<nav>`, `<main>`, `<header>`, `<aside>` sur les pages auditées — bon point structurel.

---

## Limite méthodologique

Aucun test réel avec un lecteur d'écran (NVDA, JAWS, VoiceOver) ni aucun outil automatisé (axe-core, Lighthouse
Accessibility, WAVE) n'a été exécuté — cet environnement d'audit n'a pas de navigateur instrumenté disponible.
Les constats ci-dessus sont fondés sur une lecture du code (présence/absence d'attributs ARIA, structure des
balises), pas sur une expérience de navigation assistée réelle. Un passage manuel avec un lecteur d'écran et un
audit `axe` automatisé sont recommandés avant toute communication publique sur la conformité accessibilité du
site.
