# 06 — Performance

Audit de performance de l'annuaire public. Méthode : lecture du code, recherche de conventions Next.js
(`loading.tsx`, `error.tsx`, `Suspense`), analyse des requêtes Supabase par page, analyse de l'usage d'images.
**Aucun outil de mesure réel (Lighthouse, WebPageTest) n'a pu être exécuté depuis cet environnement** — voir
limite méthodologique en fin de document. Aucune modification effectuée.

---

## 1. Images lourdes

- **Aucune page de l'annuaire n'utilise `next/image`** — confirmé par recherche exhaustive (`from "next/image"` :
  0 occurrence dans tout `src/`). Toutes les images passent par des balises `<img>` natives.
- Conséquence directe : aucune optimisation automatique (redimensionnement serveur, format moderne AVIF/WebP,
  `srcset` responsive, lazy-loading natif géré par Next). Confirmé par `next lint` (avertissement
  `@next/next/no-img-element` sur chaque occurrence — 13 occurrences relevées dans un audit précédent sur
  l'ensemble du dépôt, dont plusieurs dans les pages auditées ici : `src/app/page.tsx` (hero + cartes résultat),
  `src/app/categorie/[slug]/page.tsx` (carrousel vedettes), `src/app/ecole/[id]/page.tsx` (galerie, hero).
- Les images du hero (`HERO_IMAGES`, `src/app/page.tsx`) sont chargées depuis `images.unsplash.com` en
  paramètres `w=800`/`w=900` — raisonnable en taille demandée, mais sans `loading="lazy"` explicite sur la
  plupart des occurrences (seule l'image du carrousel principal de la fiche école déclare
  `loading={i === 0 ? "eager" : "lazy"}`, un bon point isolé, pas généralisé).
- Les photos réelles d'établissement (`school_images`, uploadées via Supabase Storage) ne subissent **aucun**
  traitement de redimensionnement à l'upload (confirmé dans l'audit précédent, `dashboard/ecole/galerie/page.tsx`)
  — une photo uploadée en haute résolution est servie telle quelle sur la fiche publique.

## 2. Server Components vs Client Components

**Constat central** : `/`, `/categorie/[slug]` et `/ecole/[id]` sont **entièrement des Client Components**
(`"use client"` en première ligne de chaque fichier). Le seul code Server Component de tout l'annuaire public est
`src/app/ecole/[id]/layout.tsx` (utilisé uniquement pour `generateMetadata`, ne rend aucun contenu visible
lui-même — `return <>{children}</>`).

Conséquence :

- Chaque visite déclenche un cycle complet : HTML quasi-vide → hydratation JS → requête(s) Supabase côté
  navigateur → rendu du contenu réel. Le "First Contentful Paint" utile (le moment où l'utilisateur voit
  réellement la liste d'écoles) dépend donc d'un aller-retour réseau supplémentaire après le chargement du
  bundle JS, alors qu'un Server Component aurait pu inclure les données dès le HTML initial.
- Aucune des données de l'annuaire (nom, ville, frais, infrastructures) n'est disponible sans exécution
  JavaScript complète côté client.

## 3. Requêtes réseau

| Page | Requêtes Supabase | Constat |
|---|---|---|
| `/` | 1 requête `select` unique avec jointures imbriquées (`fees`, `infrastructures`, `school_images`) | Bon point : pas de N+1, tout chargé en un seul aller-retour |
| `/categorie/[slug]` | 1 requête `select` avec jointure `fees` | Bon point, idem |
| `/ecole/[id]` | 4 requêtes en parallèle (`Promise.all` : `establishments`, `fees`, `infrastructures`, `school_images`) | Correct — parallélisées, pas séquentielles ; aurait pu être une seule requête avec jointures comme `/`, mais 4 requêtes parallèles restent raisonnables pour une seule visite de page |

**Aucune requête N+1 constatée** dans les trois pages auditées — point positif à ne pas perdre en corrigeant le
reste.

## 4. Chargement de la totalité des données

`/` et `/categorie/[slug]` chargent **l'intégralité** des établissements de la catégorie/de la base en une seule
requête, sans pagination ni limite (`select` sans `.range()`/`.limit()`), puis filtrent côté client en JavaScript
(`schools.filter(...)`). Sans risque à l'échelle actuelle (dizaines d'écoles), ce pattern ne passera pas à
l'échelle visée par la mission ("le plus grand annuaire scolaire du Cameroun") — chaque centaine d'écoles
supplémentaire alourdit directement le payload initial et le temps de filtrage côté client.

## 5. Suspense / Loading / Error Boundary

- **Aucun `loading.tsx`** dans `src/app/` (recherche exhaustive, 0 résultat) — Next.js App Router ne peut donc
  afficher aucun état de chargement automatique au niveau route. Chaque page gère son propre état `loading` de
  façon ad hoc via `useState`, avec des rendus squelettes différents d'une page à l'autre (cohérence visuelle
  non garantie).
- **Aucun `error.tsx`** dans `src/app/` — aucune limite d'erreur (error boundary) au niveau route. Une exception
  non interceptée dans un composant client de l'annuaire (ex. donnée malformée renvoyée par Supabase) provoque
  l'écran blanc générique de React/Next plutôt qu'un message d'erreur produit.
- `<Suspense>` : une seule occurrence dans tout l'annuaire, dans `src/app/categorie/[slug]/page.tsx` (englobant
  le composant qui utilise `useSearchParams`, requis par Next.js pour ce hook) — usage technique minimal, pas un
  usage de Suspense pour améliorer le chargement progressif du contenu.

## 6. Carte Leaflet

`LocalSchoolMap` est chargé via `next/dynamic` avec `ssr: false` — bonne pratique, évite d'alourdir le bundle
serveur avec une librairie qui dépend de `window`. Le composant s'affiche uniquement dans une modale déclenchée
par l'utilisateur (`mapModalOpen`), donc son coût n'impacte pas le chargement initial de la page — bon point.

## 7. Bannière défilante (marquee)

Animation CSS en boucle infinie (`animate-marquee`) sur la page d'accueil, active en permanence tant que la page
reste ouverte. Coût de performance mineur (animation CSS, pas de JS), mais consomme un cycle de rendu continu —
non critique, mentionné pour complétude.

---

## Limite méthodologique

Aucun outil de mesure de performance réel (Lighthouse, PageSpeed Insights, WebPageTest) n'a été exécuté : cet
environnement d'audit n'a pas de navigateur instrumenté disponible. Tous les constats ci-dessus proviennent d'une
lecture directe du code source, pas d'une mesure de temps de chargement réel. Une mesure Lighthouse réelle (sur
un déploiement Vercel de prévisualisation, par exemple) est recommandée avant toute décision de priorisation
finale — voir `09_ACTION_PLAN.md`.
