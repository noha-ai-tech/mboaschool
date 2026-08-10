# 15 — Visual Hierarchy

## Le test des 3 secondes

Chaque écran doit pouvoir être résumé par un utilisateur qui ne l'a
regardé que 3 secondes, sans lire un mot. S'il ne peut répondre qu'à "à
quoi sert cette page" et pas "qu'est-ce qui compte le plus dessus", la
hiérarchie a échoué — c'est le seul critère qui compte réellement, avant
toute règle esthétique.

## Les 3 niveaux d'attention

Toute interface se lit selon 3 niveaux, jamais plus :

1. **Niveau 1 — ce qu'on voit sans effort** : 1 seul élément dominant par
   écran (un titre, un CTA, un chiffre clé). Sur un dashboard, c'est la
   liste "à traiter" ; sur une fiche école, la carte d'identité ; sur la
   landing page, le champ de recherche.
2. **Niveau 2 — ce qu'on voit en balayant** : 3 à 5 éléments secondaires
   (StatCard, sections de navigation, badges). Reconnaissables sans être
   dominants.
3. **Niveau 3 — ce qu'on trouve en cherchant** : tout le reste, accessible
   mais jamais imposé (paramètres, détails, historique).

L'audit (`11_UX_AUDIT.md`) montre que la faiblesse la plus fréquente du
produit actuel est un Niveau 1 qui n'existe pas — plusieurs éléments se
disputent la même importance visuelle (ex. Dashboard École : 4 widgets au
même poids).

## Comment un niveau se construit (par ordre d'efficacité)

1. **Taille** — l'outil le plus fort, à utiliser en premier. Un titre H1
   à 32px domine naturellement un corps de texte à 14px sans effort
   supplémentaire.
2. **Position** — ce qui est en haut à gauche (lecture FR de gauche à
   droite, de haut en bas) est lu en premier ; ce qui est isolé dans un
   coin est lu en dernier.
3. **Contraste de couleur** — Text Primary contre Text Secondary,
   jamais une couleur vive ajoutée seulement pour "faire ressortir" un
   élément qui n'a pas d'importance sémantique réelle (violerait
   `02_COLOR_SYSTEM.md` règle 2).
4. **Espace blanc autour** — un élément entouré de plus d'espace paraît
   plus important, sans qu'aucune de ses propriétés visuelles ne change.
   C'est l'outil le plus sous-utilisé dans le produit actuel (audit :
   écrans "trop chargés" cités 8 fois sur 12).
5. **Poids de police** — 800/700 vs 400/500, jamais plus de 3 poids
   simultanés sur un même écran (`03_TYPOGRAPHY.md`).

Le produit actuel utilise presque exclusivement les leviers 3 et 5
(couleur et gras) — d'où des écrans où "tout est en gras et en vert" et où
plus rien ne ressort vraiment. La priorité de la prochaine itération est
de réintroduire massivement les leviers 1, 2 et 4.

## Pattern de lecture par type d'écran

- **Pages publiques (landing, annuaire, fiche école)** : pattern en Z —
  l'œil va du logo (haut-gauche) au CTA principal (haut-droite ou centre),
  puis descend en diagonale vers le contenu, puis balaie le bas de page.
  Le CTA de conversion doit toujours être sur cette diagonale.
- **Dashboards** : pattern en F — l'œil balaie horizontalement en haut
  (bandeau contexte + StatCard), puis verticalement le long de la colonne
  de gauche (widget principal). La colonne de droite (Quick Actions,
  `05_LAYOUT.md`) est structurellement en Niveau 2, jamais 1.
- **Formulaires** : lecture strictement verticale, un champ à la fois —
  aucun pattern en Z ou F ne s'applique, d'où la règle "un champ dominant
  par écran d'étape" (`12_SCREEN_BLUEPRINTS.md` §Préinscription).

## Densité maximale par écran

| Type d'écran | Éléments de Niveau 1 | Éléments de Niveau 2 max |
|---|---|---|
| Landing / marketing | 1 | 5 |
| Dashboard (tout rôle) | 1 (la liste/file prioritaire) | 4 (StatCard) |
| Fiche détail (école, dossier) | 1 (carte d'identité) | 4-6 (sections en onglets) |
| Formulaire | 1 (le champ en cours) | 0 (pas de compétition visuelle pendant la saisie) |
| Liste/tableau | 1 (l'action de tri/filtre actif) | N lignes, mais chaque ligne a sa propre micro-hiérarchie (titre > métadonnées) |

Dépasser ces plafonds est le signal exact identifié dans l'audit comme
"trop chargé" — la limite n'est pas arbitraire, elle est directement dérivée
des scores les plus bas (Module Pro à 12 items à plat, Administration à 8
StatCard).
