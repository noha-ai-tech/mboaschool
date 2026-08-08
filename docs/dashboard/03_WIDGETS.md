# 03 — Widgets

## Vue d'ensemble (`dashboard/ecole/page.tsx`) — étendue, pas réécrite

Conservé intégralement : stats candidatures (Demandes/En attente/Acceptées/Refusées), bannière module Pro,
liste des dernières préinscriptions, liste des classes, accès rapides.

Ajouté (Phase 3) :

| Carte | Donnée | Source | Honnêteté |
|---|---|---|---|
| Établissement publié | Statut statique "Publiée" | — | Le modèle de données actuel n'a pas de notion de brouillon/publié pour une fiche déjà liée à un propriétaire — une fiche avec `owner_id` est toujours visible publiquement (RLS `select using (true)`). Affiché comme un fait, pas un chiffre inventé. |
| Profil complété | `completionPct` calculé | Voir checklist ci-dessous | 100 % réel, recalculé à chaque chargement |
| Photos | `school_images` count | `count(*) where establishment_id = ...` | Réel |
| Dernière activité | Date la plus récente entre dernière candidature et dernière annonce | `applications.created_at`, `school_announcements.created_at` | Réel ; affiche "Aucune" si aucune donnée |

## Checklist de complétion (Phase 4)

Composant intégré à `dashboard/ecole/page.tsx` (pas un composant séparé — logique simple, colocalisée avec ses
données). 7 tâches, chacune vérifiée contre une donnée réelle :

| Tâche | Condition de complétion |
|---|---|
| Ajouter un logo | `establishments.logo_url` non nul |
| Ajouter des photos | `school_images` count > 0 |
| Renseigner les frais | `fees.tuition_fee` ou `fees.registration_fee` > 0 |
| Compléter les infrastructures | Au moins un booléen `true` dans `infrastructures` |
| Publier une annonce | Au moins une ligne dans `school_announcements` |
| Ajouter les contacts | `phone` ou `email` renseigné |
| Compléter la description | `description` non nulle et > 20 caractères |

`completionPct = (tâches complétées / 7) × 100`. La carte checklist ne s'affiche que si au moins une tâche est
incomplète (masquée automatiquement à 100 %).

## `NotificationBell` (`src/components/dashboard/NotificationBell.tsx`)

Nouveau composant partagé, monté dans `layout.tsx`. Une seule entrée est calculée depuis une donnée réelle
(candidatures `pending`) ; les quatre autres sont des emplacements architecturaux (Phase 6 : "ne pas connecter
un système réel"). Voir le composant lui-même pour le détail — chaque entrée est commentée sur ce qui est réel
vs. prévu.

## Statistiques (`dashboard/ecole/statistiques/page.tsx`) — nouvelle page

5 cartes : Visiteurs et Pages vues et Popularité affichent explicitement "Non disponible" (aucun outil de suivi
d'audience connecté — confirmé par l'audit précédent, aucun SDK de ce type dans les dépendances). Préinscriptions
et Demandes de contact utilisent la seule donnée réellement mesurée aujourd'hui (`applications`). Un graphique en
barres (8 dernières semaines, calcul pur JS, pas de librairie de graphiques ajoutée — cohérent avec Phase 10 "ne
réutiliser que l'existant") complète la vue.

## Mon établissement (`dashboard/ecole/etablissement/page.tsx`) — nouveau hub

Cartes de navigation vers Paramètres, Frais, Infrastructures, Classes, Paiements — aucune logique dupliquée,
uniquement des liens vers les pages existantes.

## Centre documentaire (`dashboard/ecole/centre-documentaire/page.tsx`) — nouveau hub (Phase 7)

Documents administratifs et Photos : compteurs réels (`school_documents`, `school_images`), liens vers les
pages de gestion existantes (inchangées). Logo : aperçu réel si `logo_url` existe, message honnête sinon (pas de
formulaire d'upload de logo dans ce dépôt — non développé ici, hors périmètre). Brochures et Téléchargements :
placeholders explicites "Bientôt disponible", bordure en pointillés pour les distinguer visuellement des
fonctionnalités actives.

## Support (`dashboard/ecole/support/page.tsx`) — nouvelle page

Architecture uniquement. Aucun email personnel codé en dur, aucun formulaire fonctionnel — conforme à "ne pas
connecter de système réel".

## Paramètres — sections additives (Phase 8)

Ajoutées **après** le formulaire existant (jamais à l'intérieur — le formulaire et sa fonction `save()` ne sont
pas touchés) : Abonnement (donnée réelle : `school.forfait`), Paiements (lien vers la page existante),
Responsables / Utilisateurs / Sécurité (placeholders "Bientôt disponible", bordure en pointillés).
