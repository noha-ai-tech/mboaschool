# 05 — SEO

Audit du référencement naturel de l'annuaire public. Méthode : lecture du code (`src/app/layout.tsx`,
`src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/app/ecole/[id]/page.tsx` + `layout.tsx`),
recherche exhaustive de fichiers `sitemap`/`robots`/`icon`/`favicon` dans le dépôt, recherche de `schema.org`/
`JSON-LD`/`metadataBase`/`alternates` dans tout `src/`. Aucune modification effectuée.

**Objectif rappelé par la mission** : quand quelqu'un tape "Lycée Bilingue Deido", Écoles237 doit apparaître.

---

## 1. Title

| Page | Constat |
|---|---|
| `/` (accueil) | Titre hérité du layout racine : "Écoles237 — Trouver et inscrire dans une école au Cameroun". Correct, un seul titre pour toute la page d'accueil. |
| `/categorie/[slug]` | **Aucun titre dédié.** Page `"use client"`, aucun `layout.tsx` dans `src/app/categorie/`, aucun `generateMetadata`. Le `<title>` réellement servi est celui du layout racine (générique), alors que le contenu (`CAT_META[slug].label`, ex. "École Primaire") existe déjà dans le code mais n'est jamais branché sur le système de métadonnées de Next.js. |
| `/ecole/[id]` | Titre dynamique correct via `src/app/ecole/[id]/layout.tsx` : `${nom} — ${ville} \| Écoles237`. C'est la seule page de l'annuaire à avoir un titre par établissement. |

## 2. Description

Même constat que pour le titre : uniquement `/` et `/ecole/[id]` ont une description dédiée. `/categorie/[slug]`
hérite de la description générique du layout racine.

## 3. Slug / URLs

- `/ecole/[id]` utilise un **UUID** comme identifiant d'URL (`school.id`), pas un slug lisible. La colonne `slug`
  existe pourtant dans `establishments` (`schema.sql`) et est même générée par les scripts de seed
  (`seed_schools.sql`) — mais elle n'est utilisée nulle part dans le routing. Une URL `/ecole/lycee-bilingue-deido`
  serait significativement meilleure pour le SEO qu'une URL `/ecole/3f9a2b7e-...`.
- `/categorie/[slug]` utilise bien un slug lisible (`primaire`, `secondaire`, ...) — bon point.
- Aucune URL indexable pour une recherche filtrée (voir §7 URLs de recherche).

## 4. OpenGraph

| Page | Constat |
|---|---|
| Layout racine | `openGraph.title`/`description`/`type`/`locale`/`siteName` présents. **Aucune `images`** — un partage sur WhatsApp/Facebook/LinkedIn n'affichera aucune vignette. |
| `/ecole/[id]` | `openGraph` présent avec titre/description dynamiques. **Aucune `images` non plus** — une fiche école partagée sur WhatsApp (canal de communication n°1 au Cameroun) n'affichera pas la photo de couverture de l'école, alors que `cover_image_url`/`school_images` existent en base et seraient l'image OG naturelle. |
| `/categorie/[slug]` | Aucun OpenGraph dédié (hérite du générique, sans image). |

## 5. Twitter Card

Layout racine : `card: "summary_large_image"` déclaré, mais sans image associée nulle part dans le code — la
carte "large image" n'aura donc jamais d'image à afficher. `/ecole/[id]` déclare `card: "summary"` (plus petite),
incohérent avec le racine, et là aussi sans image.

## 6. Canonical

**Absent partout.** Recherche exhaustive de `alternates` dans `src/` : aucune occurrence. Aucune page ne déclare
d'URL canonique explicite.

## 7. Schema.org / JSON-LD

**Absent partout.** Recherche exhaustive de `schema.org`, `application/ld+json`, `JsonLd` dans `src/` : aucune
occurrence. Pour un annuaire d'établissements, les types `EducationalOrganization` (fiche école, avec `name`,
`address`, `telephone`, `url`) et `BreadcrumbList` (fil d'Ariane catégorie → école) seraient les cibles naturelles
— aucun n'est implémenté.

## 8. Robots

- **`robots.txt` absent du dépôt** (recherche `**/robots*` sans résultat, y compris `src/app/robots.ts`, la
  convention Next.js App Router). Sans ce fichier, aucune directive explicite pour les robots d'indexation
  (aucun blocage non plus, mais aucune orientation vers le sitemap).
- Le layout racine déclare `robots: { index: true, follow: true }` au niveau metadata — cohérent avec l'intention
  d'indexation, mais ne remplace pas un `robots.txt` (qui sert aussi à déclarer l'emplacement du sitemap).

## 9. Sitemap

**Absent du dépôt.** Recherche `**/sitemap*` sans résultat, y compris `src/app/sitemap.ts` (convention Next.js
App Router pour générer un sitemap dynamique). Sans sitemap, Google découvre les pages `/ecole/[id]` uniquement
par exploration de liens internes — plus lent, moins fiable, surtout pour un catalogue de plusieurs dizaines
d'établissements en croissance rapide.

## 10. URLs de recherche — non indexables

La page d'accueil gère **tous** les filtres (recherche texte, catégorie, ville, rayon géographique) en état React
pur (`useState`), jamais reflétés dans l'URL (`window.location`/`useSearchParams`/`router.push` absents de cette
logique dans `src/app/page.tsx`). Conséquence directe sur l'objectif SEO n°1 de la mission : il n'existe **aucune
URL indexable** correspondant à une recherche du type "écoles à Douala" ou "écoles primaires bilingues" —
seule `/categorie/[slug]` produit une URL par catégorie (sans filtre ville). C'est la limite la plus directement
contraire à l'objectif business énoncé par la mission.

## 11. Rendu — contenu 100 % client

Les trois pages publiques auditées (`/`, `/categorie/[slug]`, `/ecole/[id]`) sont toutes des **Client Components**
(`"use client"` en tête de fichier). Le contenu réel (liste d'écoles, nom, description, frais...) n'est jamais
présent dans le HTML servi par le serveur — il est chargé après hydratation via une requête Supabase côté
navigateur (`useEffect` + `supabase.from(...).select(...)`). Voir `06_PERFORMANCE.md` §2 pour le détail technique
; conséquence SEO directe : les moteurs de recherche qui n'exécutent pas pleinement le JavaScript (ou l'exécutent
avec un délai/budget limité) verront une page largement vide au premier passage. Les métadonnées `<title>`/
`<meta description>`/OpenGraph, elles, restent correctement servies côté serveur (via `generateMetadata` /
`export const metadata`) puisqu'elles sont gérées séparément du corps de page — c'est un point positif distinct
à ne pas confondre avec le contenu visible.

## 12. Favicon

**Absent.** Aucun `favicon.ico`, aucun `icon.tsx`/`icon.png` (convention App Router), et **aucun dossier `public/`
n'existe dans ce dépôt**. Le site n'a donc aucune icône d'onglet navigateur ni d'icône d'accueil mobile.

## 13. `metadataBase`

**Non défini** dans `src/app/layout.tsx`. Next.js recommande explicitement de définir `metadataBase` dès qu'on
utilise des URLs relatives dans `openGraph`/`twitter` (images notamment) — actuellement sans conséquence visible
car aucune image OG n'est définie, mais deviendra un problème dès qu'une image sera ajoutée (résolution d'URL
relative imprévisible en production selon le domaine réel).

---

## Résumé des manques SEO

| Élément demandé par la mission | Statut |
|---|---|
| Title | Partiel — seul `/ecole/[id]` a un titre vraiment dynamique |
| Description | Partiel — idem |
| Slug | Partiel — colonne `slug` existante mais non utilisée dans le routing des fiches école |
| OpenGraph | Partiel — présent sans image nulle part |
| Twitter | Partiel — présent sans image, incohérent entre racine et fiche école |
| Canonical | **Absent** |
| Schema.org / JSON-LD | **Absent** |
| Robots (fichier) | **Absent** |
| Sitemap | **Absent** |
| URLs (recherche indexable) | **Absent** |
| Favicon | **Absent** |
