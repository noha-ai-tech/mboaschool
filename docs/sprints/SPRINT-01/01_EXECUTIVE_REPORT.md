# 01 — Executive Report — SPRINT 01 : Audit Annuaire National V1

**Branche analysée** : `chore/upgrade-next-security`
**Date de l'audit** : 2026-08-08
**Périmètre** : annuaire public uniquement (`/`, `/categorie/[slug]`, `/ecole/[id]`, `LocalSchoolMap`). Module Pro,
dashboards, authentification, sécurité déjà validée : **non touchés, non réaudités** (hors périmètre demandé).
**Règle appliquée** : diagnostic uniquement, **aucune correction effectuée**, aucune table Supabase modifiée.

---

## 1. Ce qui a été vérifié

- Lecture complète de `src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/app/ecole/[id]/page.tsx` +
  `layout.tsx`, `src/components/LocalSchoolMap.tsx`, `src/app/layout.tsx`, `next.config.js`.
- Recherche exhaustive dans tout le dépôt de : sitemap, robots.txt, favicon/icon, `metadataBase`, `alternates`,
  `schema.org`/JSON-LD, `loading.tsx`/`error.tsx`.
- Recensement des critères de recherche demandés par la mission face à ce qui existe réellement dans le code et
  le schéma `establishments`.

## 2. Ce qui n'a PAS été vérifié (limites méthodologiques)

- **Aucun test visuel réel** (navigateur redimensionné, device physique) aux points de rupture demandés — voir
  `07_RESPONSIVE.md`.
- **Aucun outil de mesure de performance réel** (Lighthouse, PageSpeed) — voir `06_PERFORMANCE.md`.
- **Aucun test avec lecteur d'écran réel ni outil d'audit automatisé** (axe, WAVE) — voir `08_ACCESSIBILITY.md`.
- Ces trois limites viennent de l'absence de navigateur instrumenté dans l'environnement d'exécution de cet
  audit, pas d'un choix de ne pas les faire. Elles sont documentées explicitement dans chaque document concerné
  et doivent être traitées comme un point de suivi, pas comme une case cochée.

## 3. Chiffres

| Catégorie | Nombre |
|---|---|
| Problèmes CRITIQUE | 9 |
| Problèmes IMPORTANT | 14 |
| Problèmes CONFORT | 9 |
| **Total** | **32** |

Détail complet, avec fichier/cause/solution/impact/estimation pour chacun : `09_ACTION_PLAN.md`.

## 4. Constat central

L'annuaire public est **visuellement soigné et fonctionnellement cohérent pour un usage manuel** (un visiteur qui
navigue à la souris trouve l'information, les frais, les infrastructures, et peut se préinscrire). Mais il n'est
**pas construit pour être trouvé** : c'est précisément l'objectif business n°1 de cette mission ("Écoles237 doit
apparaître" pour une recherche de nom d'école) qui est le plus en tension avec l'état réel du code.

Trois faits résument cette tension :

1. **Zéro rendu serveur** sur les trois pages publiques auditées — tout le contenu dépend d'un chargement
   JavaScript après coup, un frein direct à une indexation rapide et fiable.
2. **Zéro infrastructure SEO de base** — pas de sitemap, pas de robots.txt, pas de schema.org, pas de canonical,
   pas de favicon. Aucun de ces éléments n'existe, pas même une version minimale.
3. **Le principal bouton "Rechercher" de la page d'accueil ne fait pas ce qu'il affiche** (C-01) — il ignore les
   filtres saisis et redirige toujours vers la même catégorie fixe. C'est exactement le type de "faux bouton"
   que la mission demande explicitement de traquer.

À l'inverse, plusieurs fondations sont solides et ne doivent pas être perdues dans la correction : pas de requête
N+1, carte Leaflet correctement chargée en dynamique sans alourdir le rendu serveur, page fiche école avec le
seul vrai title/description dynamiques de tout l'annuaire, filtrage combinable fonctionnel, données de frais et
d'infrastructures complètement mappées.

## 5. SEO

**État : insuffisant pour l'objectif affiché.** Voir `05_SEO.md`. Sitemap, robots.txt, schema.org, canonical et
favicon sont tous les cinq absents simultanément — un site ne partant pas de zéro techniquement (le produit
existe, est fonctionnel, a des metadata partielles) mais partant de zéro sur les fondations SEO structurelles.
Seule la fiche école a un title/description vraiment dynamiques ; les pages catégorie (à fort potentiel de mots-
clés : "école primaire Douala") n'ont aucune métadonnée dédiée alors que le contenu existe déjà dans le code.

## 6. Performance

**État : correct pour le volume actuel, non préparé pour l'échelle visée.** Voir `06_PERFORMANCE.md`. Pas de
requête N+1, chargement parallélisé sur la fiche école — bons points. Mais 100 % Client Components, aucune image
optimisée (`next/image` jamais utilisé), aucune pagination, aucun `loading.tsx`/`error.tsx`. Fonctionnera sans
problème visible à quelques dizaines d'écoles ; nécessitera une refonte avant plusieurs centaines.

## 7. Responsive

**État : non vérifié visuellement — évalué par lecture de code uniquement.** Voir `07_RESPONSIVE.md`. La page
d'accueil a des points de rupture explicites et cohérents en apparence ; les pages catégorie et fiche école en
ont beaucoup moins, ce qui ne prouve pas un défaut mais signale une zone non testée. Un passage visuel réel aux
cinq paliers demandés par la mission reste à faire.

## 8. Accessibilité

**État : partielle, gaps concrets identifiés.** Voir `08_ACCESSIBILITY.md`. Bonnes pratiques déjà présentes par
endroits (labels sur les points de carrousel, structure sémantique `<nav>`/`<main>`/`<header>`) mais non
généralisées : menu déroulant inaccessible au clavier, plusieurs boutons icône sans libellé, onglets de la fiche
école sans sémantique ARIA, carte sans alternative accessible.

## 9. État général

L'annuaire fonctionne, est visuellement présentable, et couvre l'essentiel des besoins d'affichage d'une fiche
école (frais, infrastructures, galerie, contact, préinscription). Mais il n'a **aucune des fondations
techniques** qui permettraient à la mission d'atteindre son objectif business déclaré (être trouvé sur Google
pour le nom d'une école), et contient au moins un bouton dont le comportement contredit son intention affichée.

## 10. L'annuaire est-il prêt pour une V1 ?

## Réponse : **NON**

**Justification** : la mission fixe elle-même la barre — "aucune dette technique, aucun faux bouton, aucune
donnée cassée, toutes les pages publiques prêtes pour Google". Sur ces quatre critères explicites :

- **Aucun faux bouton** → échoue (C-01, le bouton "Rechercher" du hero).
- **Aucune donnée cassée** → échoue (C-07, compteur d'établissements codé en dur et inexact).
- **Toutes les pages prêtes pour Google** → échoue nettement (C-02 à C-06, C-08, C-09 : zéro rendu serveur,
  zéro sitemap, zéro robots.txt, zéro schema.org, catégories sans métadonnées dédiées, zéro URL de recherche
  indexable, zéro favicon).
- **Aucune dette technique** → échoue également au sens strict (14 items IMPORTANT documentés).

Aucun de ces manques n'est pour autant un défaut structurel profond ou un chantier de plusieurs mois : les 9
items CRITIQUE de `09_ACTION_PLAN.md` sont, à l'exception de la refonte Server Components (C-02, estimée L),
tous de taille S ou M et peuvent raisonnablement être traités en un sprint court dédié à la correction, une fois
priorisés par l'architecte. **Le produit est proche d'une V1 techniquement saine, pas prêt tel quel.**

---

## Documents de ce sprint

| Fichier | Contenu |
|---|---|
| `02_HOME.md` | Audit détaillé de la page d'accueil |
| `03_SEARCH.md` | Audit du moteur de recherche et des filtres |
| `04_SCHOOL_PAGE.md` | Audit détaillé de la fiche école |
| `05_SEO.md` | Audit SEO complet (title, description, OG, canonical, schema.org, sitemap, robots) |
| `06_PERFORMANCE.md` | Audit performance (images, Server/Client Components, requêtes, Suspense) |
| `07_RESPONSIVE.md` | Audit responsive aux 5 paliers demandés (limite méthodologique : pas de test visuel réel) |
| `08_ACCESSIBILITY.md` | Audit accessibilité (ARIA, clavier, contrastes, alt) |
| `09_ACTION_PLAN.md` | Plan d'action consolidé, 32 items classés CRITIQUE/IMPORTANT/CONFORT avec fichier/cause/solution/impact/estimation |
