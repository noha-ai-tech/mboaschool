# 17 — Landing Page Blueprint

Vision d'ensemble de la refonte. Détail par domaine dans les 5 documents
compagnons : `18_LANDING_COPYWRITING.md` (textes réels), `19_LANDING_LAYOUT.md`
(structure/grille), `20_LANDING_COMPONENTS.md` (composants Design System V2
utilisés), `21_LANDING_ANIMATIONS.md`, `22_LANDING_RESPONSIVE.md`.

**Aucun code n'est modifié par ce document.** Conformément à la consigne,
le développement n'commence qu'après validation explicite d'Eddy de ce
blueprint.

## Ce qu'on ne fait plus

La landing actuelle (auditée en `11_UX_AUDIT.md`, score 58/100) ouvre sur un
formulaire de recherche à 4 champs avant tout résultat, répète son CTA
principal jusqu'à 3 fois, et mélange contenu marketing et outil de recherche
dans une seule section dense. Cette refonte ne "customise" pas l'existant —
elle repart de la promesse produit et reconstruit chaque section autour
d'elle.

## Les 10 sections, en une phrase chacune

| # | Section | Rôle en une phrase |
|---|---|---|
| 1 | Hero | Une promesse claire + preuve visuelle immédiate, 2 CTA maximum |
| 2 | Pourquoi Écoles237 | 3 bénéfices, pas une liste de fonctionnalités |
| 3 | Comment ça fonctionne | Trouver → Comparer → S'inscrire, en 3 étapes visuelles |
| 4 | Recherche des écoles | L'outil réel, mis en scène comme un produit fini, pas un formulaire administratif |
| 5 | Pour les établissements | Bascule d'audience (parent → école), 1 CTA dédié |
| 6 | Module Pro | Teaser discret, jamais une page produit complète |
| 7 | Statistiques | Preuve sociale sobre, uniquement des données réelles |
| 8 | Témoignages | 2-3 citations, jamais un carrousel |
| 9 | FAQ | 6 questions maximum, lève les dernières objections |
| 10 | Footer | Sobre, jamais un plan de site complet |

## Décision structurante : deux publics, une seule page

La landing sert deux audiences avec des intentions opposées (un parent
cherche, une école veut être trouvée) sur une seule page continue plutôt que
deux landing séparées. La Section 1 à 4 parle au parent, la Section 5 bascule
explicitement vers l'école ("Pour les établissements"), la Section 6 reste
volontairement en retrait (Module Pro = fonctionnalité avancée, pas un
argument de première visite). Ce séquençage évite de diluer l'un des deux
messages en les mélangeant.

## Point ouvert nécessitant votre arbitrage avant développement

Deux sections (**7 — Statistiques** et **8 — Témoignages**) demandent des
données que je ne peux ni inventer ni garantir disponibles :

- **Statistiques** : seul le nombre réel d'établissements référencés est
  aujourd'hui une donnée fiable et déjà interrogée par le produit (l'accueil
  actuel l'affiche déjà). "Parents", "Élèves" et "Régions" nécessitent soit
  une vraie requête sur des données qui existent réellement en base, soit
  d'être retirés de la V1 de cette section plutôt que d'afficher un chiffre
  inventé — voir `18_LANDING_COPYWRITING.md` pour le détail exact par
  métrique.
- **Témoignages** : aucune donnée de témoignage n'existe dans le produit
  actuel (pas de système d'avis construit à ce jour). Cette section ne peut
  être développée avec du contenu réel qu'une fois que vous m'aurez fourni
  de vraies citations, ou qu'un mécanisme de collecte existera. Le blueprint
  prévoit la section ; son contenu reste à trancher avec vous avant tout
  développement de cette partie spécifiquement.

Le reste du blueprint (Sections 1-6, 9-10) ne dépend d'aucune donnée non
disponible et peut être développé sans arbitrage supplémentaire une fois
validé.

## Ce que la refonte réutilise sans le refaire

- Design System V2 (`01`–`10`) : palette, typographie Manrope, tokens
  d'espacement/motion, composants.
- Branding V1 : `Logo` (`variant="light"`, la landing est un fond clair) et
  `Favicon` déjà en place — aucun ancien logo, confirmé absent du dépôt.
- Les données déjà interrogées par la page actuelle (établissements, filtres
  de catégorie/ville) — la refonte change la présentation, pas la source de
  données.
