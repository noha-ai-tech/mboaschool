# 13 — UX Improvement Plan

Objectif : faire passer chaque écran de sa note actuelle (`11_UX_AUDIT.md`)
à 95+/100, en s'appuyant sur les blueprints de `12_SCREEN_BLUEPRINTS.md` et
les fondations déjà posées par le Design System (`01`–`10`). Ce plan n'est
pas exécuté par cette mission — il fixe l'ordre et la méthode pour la
prochaine mission d'implémentation.

## Pourquoi 95, pas 100

100/100 impliquerait qu'aucun compromis n'existe jamais entre richesse
fonctionnelle et simplicité — irréaliste pour une plateforme qui sert 4
publics différents (parent, école, enseignant, admin) sur un même socle
technique. 95+ est le seuil où plus aucune friction n'est *évitable*,
seulement des arbitrages assumés et documentés (voir `16_DESIGN_DECISIONS.md`).

## Les 3 leviers qui expliquent 90% de l'écart

Avant le détail par écran, trois causes reviennent sur presque tous les
scores sous 70 :

1. **Trop d'informations au même niveau visuel** (7 écrans sur 12
   concernés) — aucune priorité entre "il faut agir" et "c'est juste
   informatif". Résolu par la hiérarchie "cockpit" de `05_LAYOUT.md`.
2. **Duplication structurelle** (sidebar ×4, CTA répétés, doubles points
   d'entrée) — résolu par la factorisation en composants uniques
   (`10_UI_ROADMAP.md` Étape 1).
3. **Formulaires longs en une seule page** (préinscription, inscription) —
   résolu par le découpage en étapes, seul levier prouvé contre l'abandon
   sans retirer de champ.

Corriger ces 3 causes transversalement fait déjà remonter la moyenne de
~15 points avant même de traiter un écran individuellement.

## Plan par vague

### Vague 1 — Fondations transversales (impact sur les 12 écrans)
- Implémenter les composants `Button`/`Card`/`Badge`/`StatCard` du Design
  System (`10_UI_ROADMAP.md` Étape 1) — élimine la duplication qui plombe
  Sidebar, Dashboard École, Administration, Module Pro.
- Limiter à 4 le nombre de StatCard en première vue sur tout dashboard —
  règle mécanique, applicable immédiatement sans redesign complet.
- Un seul CTA principal par écran — audit de conformité systématique avant
  livraison de toute page (ajouté au processus de définition de "terminé",
  comme `08_ACCESSIBILITY.md`).

**Impact estimé** : Sidebar 64→80, Dashboard École 61→78, Administration
59→76, Module Pro 57→72 (regroupement en catégories à part, vague 3).

### Vague 2 — Parcours de conversion (impact revenu/acquisition direct)
- Landing Page : recherche à 1 champ + chips catégorie, suppression du
  méga-menu, CTA unique répété au maximum 2 fois.
- Fiche école : carte d'identité en haut + contenu détaillé en onglets.
- Annuaire : carte + liste combinées, filtre sticky unique.

**Impact estimé** : Landing Page 58→90, Fiche école 63→92, Annuaire 66→91.
Vague priorisée en 2 car ce sont les 3 écrans qui déterminent si un parent
va jusqu'à la préinscription — l'impact business dépasse l'impact purement
esthétique.

### Vague 3 — Formulaires et flux multi-étapes
- Préinscription : découpage en 3 étapes + suppression du champ dupliqué
  Âge/Date de naissance.
- Inscription : réduction aux champs de compte strict, reste vers
  l'onboarding déjà existant.

**Impact estimé** : Préinscription 67→94, Inscription 68→93.

### Vague 4 — Dashboards spécialisés et Module Pro
- Dashboard École et Administration : liste "à traiter aujourd'hui"
  unifiée (fusion admissions/tickets/CRM par urgence).
- Module Pro : regroupement des 12 items en 4 catégories + écran d'accueil
  dédié.
- Espace Enseignant : bandeau "Aujourd'hui" + suppression des sections
  placeholder.

**Impact estimé** : Dashboard École 78→95, Administration 76→95, Module
Pro 72→93, Espace Enseignant 65→92.

### Vague 5 — Polish final
- Navigation : recherche globale `Cmd/Ctrl+K`, suppression du survol comme
  seul déclencheur.
- Connexion : léger renforcement hiérarchique du CTA principal (déjà
  proche de la cible, ajustement mineur).

**Impact estimé** : Navigation 62→93, Connexion 82→96.

## Projection finale

| Écran | Actuel | Cible |
|---|---|---|
| Landing Page | 58 | 90 |
| Navigation | 62 | 93 |
| Sidebar | 64 | 80 → 95 (après Vague 1 + factorisation complète) |
| Dashboard École | 61 | 95 |
| Annuaire | 66 | 91 |
| Fiche école | 63 | 92 |
| Préinscription | 67 | 94 |
| Connexion | 82 | 96 |
| Inscription | 68 | 93 |
| Administration | 59 | 95 |
| Module Pro | 57 | 93 |
| Espace Enseignant | 65 | 92 |
| **Moyenne** | **64,3** | **93,3** |

La moyenne cible (93,3) reste légèrement sous 95 tant que Sidebar n'a pas
atteint sa factorisation complète en un composant unique partagé (dépend
d'une mission technique, pas seulement UX) — traité comme le seul écran à
convergence en 2 temps.

## Méthode de suivi

Chaque vague correspond à une mission distincte, testée et validée
individuellement (même discipline que Mission 09 : build/tsc/lint +
validation manuelle des parcours concernés) avant de passer à la suivante
— jamais les 5 vagues en une seule mission, conforme au principe "pas de
refactoring massif" déjà établi.
