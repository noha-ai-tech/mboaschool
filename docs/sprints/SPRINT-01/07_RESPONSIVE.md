# 07 — Responsive

Audit responsive de l'annuaire public aux points de rupture demandés par la mission (320px, 375px, 768px,
1024px, 1440px). Méthode : analyse des classes Tailwind (préfixes `sm:`/`md:`/`lg:`/`xl:`) dans
`src/app/page.tsx`, `src/app/categorie/[slug]/page.tsx`, `src/app/ecole/[id]/page.tsx`. **Aucun test visuel réel
sur navigateur ou device n'a pu être exécuté depuis cet environnement** — voir limite méthodologique en fin de
document. Aucune modification effectuée.

---

## 1. Densité de points de rupture explicites par page

| Page | Occurrences `sm:`/`md:`/`lg:`/`xl:` | Constat |
|---|---|---|
| `src/app/page.tsx` (accueil) | 19 | Page la plus travaillée pour le responsive — header desktop/mobile distincts, grille hero adaptative (`lg:grid-cols-[0.9fr_1.4fr]`), image hero masquée sous `lg` (`hidden lg:block`) |
| `src/app/categorie/[slug]/page.tsx` | 4 | Peu de points de rupture explicites — la mise en page s'appuie largement sur des classes par défaut (mobile-first Tailwind) plutôt que sur des ajustements par palier |
| `src/app/ecole/[id]/page.tsx` | 8 | Grille de contenu `lg:grid-cols-[1fr_300px]` pour séparer contenu principal et barre latérale ; peu d'ajustements en dessous de `lg` |

Un faible nombre de points de rupture explicites n'est pas nécessairement un défaut (Tailwind est mobile-first :
les styles par défaut s'appliquent déjà aux petits écrans), mais il signale des zones qui n'ont **pas reçu
d'ajustement spécifique testé** pour les paliers intermédiaires (768px, 1024px) — à vérifier visuellement avant
de conclure à une absence de problème.

## 2. Page d'accueil — points spécifiques identifiés dans le code

- **Header** : navigation desktop cachée sous `lg` (`hidden lg:flex`), remplacée par un menu hamburger — bascule
  correcte en principe, comportement réel à confirmer à 1024px exactement (bascule `lg` = 1024px chez Tailwind
  par défaut, donc la zone 768–1023px utilise le menu mobile — cohérent avec la demande de test à 768px et
  1024px de la mission, ces deux paliers tombent de part et d'autre de la bascule).
- **Hero** : la colonne image (`hidden lg:block`) disparaît totalement en dessous de 1024px — à 768px et en
  dessous, seul le bloc de recherche est visible, ce qui est un choix de mise en page cohérent mais signifie que
  l'image d'illustration (et le lien "Inscrire" qu'elle contient) n'existe tout simplement pas sur mobile/tablette
  — pas un bug, mais une perte de contenu/CTA sur ces tailles à confirmer comme volontaire.
- **Grille de résultats** : nécessite une vérification visuelle directe du nombre de colonnes à chaque palier
  (classes de grille non entièrement tracées dans cet audit ciblé) — recommandé en suivi.

## 3. Fiche école — barre latérale

`grid lg:grid-cols-[1fr_300px]` : en dessous de `lg` (1024px), la grille passe probablement en une seule colonne
par défaut Tailwind (comportement standard en l'absence de classe `grid-cols-1` explicite avant `lg:`), plaçant
la barre latérale (CTA préinscription, contact) après le contenu principal plutôt qu'à côté. Comportement à
confirmer visuellement — un CTA de préinscription relégué en bas de page sur mobile serait un point d'attention
produit (conversion), pas seulement esthétique.

## 4. Carrousel de la page catégorie

`overflow-x-auto` avec `scrollbar-hide` (`src/app/categorie/[slug]/page.tsx`) : pattern de défilement horizontal
tactile, généralement fonctionnel sur mobile par défaut du navigateur (scroll natif), mais les boutons de
navigation `ChevronLeft`/`ChevronRight` (`scrollCarousel`) ne sont pas masqués sur mobile — leur utilité au
toucher (où le swipe natif suffit) est à vérifier, sans être un bug bloquant.

## 5. Carte Leaflet en modale

La modale carte (`src/app/page.tsx`, `mapModalOpen`) est dimensionnée `max-w-4xl h-[80vh]` sans classes
responsive dédiées visibles — à 320-375px, une modale à `h-[80vh]` avec padding (`p-4 lg:p-8`) doit être vérifiée
pour s'assurer qu'elle reste utilisable (la carte elle-même + son en-tête + bouton de fermeture) sans débordement.

---

## Limite méthodologique

**Aucun test visuel réel n'a été effectué** — ni navigateur redimensionné, ni device physique, ni outil de
capture d'écran automatisé (cet environnement d'audit n'a pas de navigateur instrumenté disponible pour cette
mission). Tous les constats ci-dessus sont des **déductions à partir des classes Tailwind présentes dans le
code**, pas des observations visuelles aux points de rupture demandés (320/375/768/1024/1440px). C'est la
limite la plus importante de cette section de l'audit : un passage visuel réel à chacun de ces cinq paliers,
sur les trois pages auditées, reste à faire avant de considérer le responsive comme validé pour la V1.
