# 09 — Action Plan

Consolidation de tous les constats de `02` à `08`. Classement CRITIQUE / IMPORTANT / CONFORT. **Aucune
correction n'a été appliquée** — ce document est un plan proposé, l'ordre d'exécution revient à l'architecte
(ChatGPT) et au fondateur.

Estimation : S = quelques heures, M = 0,5-1,5 jour, L = 2+ jours ou nécessite une décision produit préalable.

---

## CRITIQUE

### C-01 — Le bouton "Rechercher" du hero ignore les filtres saisis
- **Fichier** : `src/app/page.tsx` (bouton "Rechercher" du formulaire hero)
- **Composant** : Formulaire de recherche hero
- **Cause** : `<Link href="/categorie/garderie">` codé en dur au lieu de construire une URL/état à partir de `query`, `activeCategory`, `city`, `radius`
- **Solution** : Faire pointer le bouton vers une URL de résultats construite dynamiquement à partir des filtres (dépend de C-03/C-08 ci-dessous pour une vraie URL de recherche)
- **Impact** : CTA principal de la page d'accueil qui trompe l'utilisateur — le point d'entrée n°1 du produit ne fait pas ce qu'il promet
- **Estimation** : S (correctif isolé) à M (si couplé à la refonte URL de recherche)

### C-02 — Aucune page publique n'est rendue côté serveur
- **Fichier** : `src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/app/ecole/[id]/page.tsx`
- **Composant** : Toutes les pages de l'annuaire public
- **Cause** : Les trois pages sont des Client Components (`"use client"`) avec chargement de données via `useEffect` + Supabase côté navigateur
- **Solution** : Convertir au moins la récupération de données initiale en Server Component (fetch serveur, hydratation avec les données déjà présentes), en gardant l'interactivité (filtres, onglets) dans des sous-composants clients
- **Impact** : Directement contraire à l'objectif SEO n°1 de la mission ("Écoles237 doit apparaître pour une recherche de nom d'école") — le contenu réel n'existe pas dans le HTML initial
- **Estimation** : L — refonte architecturale, à planifier avec l'architecte

### C-03 — Aucun sitemap
- **Fichier** : absent (convention attendue : `src/app/sitemap.ts`)
- **Composant** : SEO global
- **Cause** : Fichier jamais créé
- **Solution** : Générer un sitemap dynamique listant `/`, `/categorie/[slug]` (5 catégories) et `/ecole/[id]` (toutes les écoles publiées)
- **Impact** : Découverte des pages par Google ralentie et moins fiable, en particulier pour chaque nouvelle fiche école
- **Estimation** : S

### C-04 — Aucun robots.txt
- **Fichier** : absent (convention attendue : `src/app/robots.ts`)
- **Composant** : SEO global
- **Cause** : Fichier jamais créé
- **Solution** : Créer un `robots.ts` autorisant l'indexation et déclarant l'emplacement du sitemap
- **Impact** : Absence de signal explicite aux robots, pas de découverte facilitée du sitemap
- **Estimation** : S

### C-05 — Aucune donnée structurée (schema.org / JSON-LD)
- **Fichier** : aucun — absent de tout `src/`
- **Composant** : `/ecole/[id]` en priorité (type `EducationalOrganization`), `/categorie/[slug]` (`BreadcrumbList`)
- **Cause** : Jamais implémenté
- **Solution** : Ajouter un bloc `<script type="application/ld+json">` par fiche école avec nom, adresse, téléphone, URL
- **Impact** : Opportunité perdue de rich snippets Google (étoiles, adresse, téléphone directement dans les résultats de recherche) — pertinent pour l'objectif business de visibilité
- **Estimation** : M

### C-06 — `/categorie/[slug]` sans métadonnées dynamiques
- **Fichier** : `src/app/categorie/[slug]/page.tsx` (manque un `layout.tsx` associé)
- **Composant** : Pages catégorie
- **Cause** : Page 100 % client, aucun `layout.tsx` dans `src/app/categorie/`, contenu de `CAT_META` (déjà écrit dans le code) jamais branché sur `generateMetadata`
- **Solution** : Créer `src/app/categorie/[slug]/layout.tsx` avec `generateMetadata` réutilisant `CAT_META[slug].label`/`.description`
- **Impact** : 5 pages à fort potentiel SEO (une par catégorie) partagent toutes le même titre générique de la page d'accueil
- **Estimation** : S — le contenu existe déjà, il ne manque que le branchement

### C-07 — Compteur d'établissements codé en dur et inexact
- **Fichier** : `src/app/page.tsx`, ligne ~721 (bannière défilante)
- **Composant** : Bannière défilante d'annonces
- **Cause** : Texte statique "46 établissements déjà référencés" au lieu d'un décompte réel
- **Solution** : Calculer le nombre réel depuis `schools.length` (déjà chargé) ou une requête `count`
- **Impact** : Donnée publique fausse, visible sur toutes les pages — risque de crédibilité dès qu'un visiteur compare le chiffre annoncé au nombre réel de fiches
- **Estimation** : S

### C-08 — Aucune URL indexable pour une recherche filtrée
- **Fichier** : `src/app/page.tsx`
- **Composant** : Moteur de recherche accueil
- **Cause** : Filtres (`query`, `activeCategory`, `city`, `radius`) en `useState` pur, jamais reflétés dans l'URL
- **Solution** : Migrer les filtres vers `useSearchParams`/`router.push` (pattern déjà utilisé partiellement dans `categorie/[slug]` pour `?sous=`)
- **Impact** : Aucun lien de recherche partageable, aucune URL de résultats indexable par Google — contraire à l'objectif SEO n°1 de la mission
- **Estimation** : M

### C-09 — Aucun favicon, aucun dossier `public/`
- **Fichier** : absent — aucun `public/`, aucun `src/app/icon.*`
- **Composant** : Site entier
- **Cause** : Jamais créé
- **Solution** : Ajouter un favicon (`icon.png`/`icon.tsx`) a minima, idéalement une déclinaison complète (apple-touch-icon, manifest)
- **Impact** : Absence d'icône d'onglet navigateur — signal de sérieux/finition manquant pour un produit destiné au grand public
- **Estimation** : S

---

## IMPORTANT

### I-01 — Aucune balise canonical
- **Fichier** : tout `src/app` (aucun `alternates.canonical`)
- **Solution** : Ajouter `alternates: { canonical: ... }` dans chaque `generateMetadata`/`metadata`, nécessite d'abord `metadataBase` (voir I-02)
- **Impact** : Risque de contenu dupliqué non résolu — **Estimation** : S, une fois `metadataBase` posé

### I-02 — `metadataBase` non défini
- **Fichier** : `src/app/layout.tsx`
- **Solution** : `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ecoles237.cm")`
- **Impact** : Résolution d'URL relative imprévisible pour OG/canonical dès qu'une image sera ajoutée — **Estimation** : S

### I-03 — Aucune image OpenGraph/Twitter nulle part
- **Fichier** : `src/app/layout.tsx`, `src/app/ecole/[id]/layout.tsx`
- **Solution** : Ajouter `openGraph.images`/`twitter.images` — image générique pour le layout racine, `cover_image_url`/première `school_images` pour chaque fiche
- **Impact** : Aucune vignette lors d'un partage WhatsApp/Facebook — canal de partage n°1 au Cameroun sans aperçu visuel — **Estimation** : M

### I-04 — URL fiche école en UUID plutôt qu'en slug
- **Fichier** : `src/app/ecole/[id]/page.tsx`, routing
- **Solution** : Utiliser la colonne `slug` déjà existante en base pour construire l'URL (`/ecole/lycee-bilingue-deido` plutôt que `/ecole/3f9a...`), avec redirection depuis l'ancien format si nécessaire
- **Impact** : URLs illisibles, moins bon signal SEO qu'une URL contenant le nom de l'établissement — **Estimation** : M

### I-05 — Aucune pagination (accueil + catégorie)
- **Fichier** : `src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`
- **Solution** : Pagination serveur (`.range()`) une fois le catalogue significativement plus grand qu'aujourd'hui
- **Impact** : Non bloquant à l'échelle actuelle (dizaines d'écoles), deviendra un problème de performance à quelques centaines — **Estimation** : M, non urgent tant que le volume reste faible

### I-06 — Toutes les images en `<img>` natif
- **Fichier** : `src/app/page.tsx`, `categorie/[slug]/page.tsx`, `ecole/[id]/page.tsx`
- **Solution** : Migrer vers `next/image`, avec `remotePatterns` pour le domaine Supabase Storage réel (actuellement seul `images.unsplash.com` est autorisé dans `next.config.js`)
- **Impact** : Pas d'optimisation automatique (format, taille, lazy-loading) — **Estimation** : M

### I-07 — Aucun `loading.tsx`/`error.tsx` au niveau route
- **Fichier** : `src/app/` (absents partout)
- **Solution** : Ajouter `loading.tsx` pour chaque route de l'annuaire, `error.tsx` a minima au niveau racine
- **Impact** : Pas d'état de chargement automatique cohérent, erreur non interceptée = écran blanc générique — **Estimation** : S par route

### I-08 — Filtres région/sous-système/public-privé absents
- **Fichier** : `src/app/page.tsx`, `categorie/[slug]/page.tsx`, schéma `establishments`
- **Solution** : Décision produit d'abord (ces critères sont-ils prioritaires pour la V1 ?), puis ajout des colonnes/filtres UI si oui
- **Impact** : Trois des sept critères de recherche explicitement demandés par la mission n'existent pas — **Estimation** : L, dépend d'une décision produit

### I-09 — Dropdown catégories accessible au survol seul
- **Fichier** : `src/app/page.tsx` (nav desktop)
- **Solution** : Ajouter `group-focus-within` en complément de `group-hover`
- **Impact** : Sous-catégories inatteignables au clavier — **Estimation** : S

### I-10 — Boutons icône sans `aria-label`
- **Fichier** : `src/app/page.tsx` (fermeture modale, suppression filtre, hamburger), `categorie/[slug]/page.tsx` (flèches carrousel)
- **Solution** : Ajouter `aria-label` explicite sur chaque bouton icône-seul, `aria-expanded` sur le hamburger
- **Impact** : Boutons annoncés sans description par un lecteur d'écran — **Estimation** : S

### I-11 — Onglets fiche école sans sémantique ARIA
- **Fichier** : `src/app/ecole/[id]/page.tsx`
- **Solution** : Ajouter `role="tablist"`/`role="tab"`/`aria-selected`/`role="tabpanel"`
- **Impact** : Navigation par onglets non annoncée comme telle aux technologies d'assistance — **Estimation** : S

### I-12 — Carte Leaflet sans alternative accessible
- **Fichier** : `src/components/LocalSchoolMap.tsx`
- **Solution** : `aria-label` sur le conteneur ; envisager une liste textuelle des établissements affichés en complément
- **Impact** : Contenu de la carte totalement inaccessible sans vision — **Estimation** : S (label) à M (liste alternative)

### I-13 — État "aucun résultat" à confirmer/renforcer
- **Fichier** : `src/app/page.tsx`
- **Solution** : Vérifier et, si nécessaire, ajouter un message explicite quand `filtered.length === 0`
- **Impact** : Expérience dégradée sur le parcours business prioritaire (recherche parent) — **Estimation** : S

### I-14 — Photos stock mélangées avec vraies photos sans distinction
- **Fichier** : `src/app/page.tsx` (hero), `categorie/[slug]/page.tsx` (placeholder carrousel)
- **Solution** : Décision produit — soit assumer explicitement le caractère illustratif (mention "Illustration"), soit remplacer par du contenu 100 % réel une fois assez de photos d'écoles disponibles
- **Impact** : Risque de confusion entre contenu marketing et contenu réel du catalogue — **Estimation** : S à M selon l'option choisie

---

## CONFORT

| ID | Constat | Fichier | Solution | Estimation |
|---|---|---|---|---|
| F-01 | `alt=""` sur images hero sans `aria-hidden` explicite | `src/app/page.tsx` | Ajouter `aria-hidden="true"` sur le conteneur si décoratif volontaire | S |
| F-02 | Pas de `prefers-reduced-motion` pour marquee/carrousels | `src/app/page.tsx`, `globals.css` | Media query désactivant/ralentissant les animations | S |
| F-03 | Pas de `<h1>` clair identifié sur l'accueil | `src/app/page.tsx` | Vérifier et ajouter un `<h1>` (visuellement discret si besoin) | S |
| F-04 | Twitter card incohérente entre racine (`summary_large_image`) et fiche école (`summary`) | `src/app/layout.tsx`, `ecole/[id]/layout.tsx` | Harmoniser une fois I-03 (images) réglé | S |
| F-05 | Logo affiché via emoji générique plutôt qu'un vrai `logo_url` | `src/app/ecole/[id]/page.tsx` | Décision produit — encourager l'upload d'un vrai logo | M, dépend adoption écoles |
| F-06 | Duplication du composant `Logo` (déjà TD-006) | 8 fichiers, dont `page.tsx` | Extraire `src/components/Logo.tsx` | S |
| F-07 | Peu de points de rupture responsive explicites sur `categorie/[slug]`/`ecole/[id]` | Ces deux fichiers | Test visuel réel puis ajustements ciblés | M |
| F-08 | Colonnes dérivées (`quartier`, couleurs, `emoji_logo`) non versionnées, consommées par l'annuaire public | `supabase/schema.sql` vs code | Rattraper en migration versionnée (déjà TD-001 de l'audit précédent) | L, hors périmètre annuaire seul |
| F-09 | `ownership_type`/`region` présents en base, jamais affichés/filtrables | `establishments` | Lié à I-08 — même décision produit | Voir I-08 |

---

## Total

- **CRITIQUE : 9**
- **IMPORTANT : 14**
- **CONFORT : 9**
