# 08 — UX/UI Audit

Évaluation basée sur la lecture du code (structure JSX, classes Tailwind, libellés) — pas sur une session de test utilisateur réelle. Les constats "fonctionnels" (boutons morts, liens `#`) sont vérifiés dans le code ; les constats esthétiques sont explicitement présentés comme des préférences, pas des défauts.

## Expérience Parent (visiteur public)

**Ce qui fonctionne bien**
- Parcours cohérent : accueil → catégorie ou recherche → fiche établissement → préinscription, sans rupture de navigation.
- États de chargement (squelettes) et états vides ("Aucun résultat", icône + texte) présents sur toutes les listes.
- Carte interactive et géolocalisation intégrées directement dans la recherche rapide de l'accueil.
- Fiche établissement bien structurée en onglets (Général, Galerie, Documents, Annonces, Espace parent).

**Problèmes fonctionnels constatés**
- Le bouton "Revendiquer cette page" (visible sur chaque carte d'école non revendiquée, `src/app/page.tsx`) ne mène à aucun flux de revendication réel — il ouvre le formulaire de création de compte générique. Un directeur d'école qui clique dessus en pensant "réclamer" sa fiche existante se retrouvera avec un **doublon** après l'onboarding. C'est le problème UX le plus grave de tout le parcours public, car il touche directement la confiance des écoles pilotes.
- L'onglet "Espace parent" de la fiche publique (`ecole/[id]/page.tsx`, fonction `ParentTab`) présente des fonctionnalités ("Dossier de l'enfant", "Classe assignée"…) qui n'existent pas encore — c'est présenté comme une roadmap plutôt que comme un écran d'erreur, ce qui est une bonne pratique, mais un parent non averti pourrait croire que ces informations sont accessibles quelque part.
- Le badge "Premium" affiché sur les fiches (`school.subscription_plan === "premium"`) n'a aucun flux de paiement associé pour le devenir — incohérence entre ce qui est montré et ce qui est activable.

## Expérience Établissement (dashboard école)

**Ce qui fonctionne bien**
- Navigation latérale claire, cohérente sur toutes les sous-pages du dashboard.
- Formulaires avec retours visuels systématiques (spinner de sauvegarde, confirmation "Modifications sauvegardées").
- La bannière "Écoles237 Pro" en haut du tableau de bord s'adapte correctement selon que l'école a le forfait Pro ou non (verrouillée avec icône cadenas sinon) — bon exemple de cohérence entre UI et donnée réelle.

**Problèmes fonctionnels constatés**
- `/dashboard/ecole/paiements` est un écran "Prochainement" sans aucune fonctionnalité — cohérent avec l'affichage (pas trompeur), mais présent dans la navigation principale au même niveau que des fonctionnalités réelles, ce qui peut créer une attente.
- `/dashboard/ecole/onboarding` ne prévient jamais l'utilisateur s'il possède déjà un établissement — un directeur qui recommence le flux (ex. après une déconnexion mal comprise) peut créer une deuxième fiche sans avertissement.
- `/dashboard/ecole/selection` existe dans l'arborescence mais ne fait qu'une redirection silencieuse — page fantôme sans utilité visible pour l'utilisateur (pas nécessairement un problème si elle n'est jamais liée depuis l'interface, à confirmer).

## Expérience Administrateur plateforme

**Ce qui fonctionne bien**
- Vue d'ensemble claire avec statistiques agrégées (établissements, premium, vérifiés, sponsorisés).
- Recherche instantanée par nom/ville/catégorie.

**Problèmes fonctionnels constatés**
- Le bouton "Ajouter" (un établissement) dans `dashboard/admin/page.tsx` n'a **aucun gestionnaire de clic** (`onClick` absent) — bouton visuellement actif mais totalement inerte.
- Dans `dashboard/admin/ecoles/[id]/page.tsx`, les liens rapides "Documents" et "Galerie" pointent vers `href="#"` — inertes également.
- Comme détaillé dans `06_SECURITY_AUDIT.md` (R-001), le formulaire d'édition d'établissement peut échouer silencieusement sans message d'erreur visible si la policy RLS bloque la mise à jour — l'administrateur n'aurait aucun moyen de savoir pourquoi ses changements ne sont pas pris en compte.

## Expérience Enseignant

- Espace séparé et fonctionnel (`/enseignant/mon-espace`), avec sélection multi-établissement bien pensée pour les enseignants qui interviennent dans plusieurs écoles.
- Le lien "Déconnexion" dans l'en-tête (`enseignant/layout.tsx`) pointe vers une route inexistante (`/auth/signout`) — un enseignant ne peut pas se déconnecter depuis cette barre (il devrait fermer sa session autrement). Problème fonctionnel direct, pas esthétique.

## Cohérence visuelle et de marque

- Palette et typographie cohérentes sur l'ensemble du produit (noir `#0a0a0a`, vert émeraude, fond crème `#f9f7f2`), utilisation répétée du triptyque vert/rouge/jaune du drapeau camerounais dans le logo — identité visuelle claire et bien maintenue à travers les 8 réimplémentations indépendantes du composant Logo (voir `07_CODE_QUALITY.md` pour la duplication de code sous-jacente).
- Aucune occurrence visuelle du nom "MboaSchool" trouvée — le renommage est visuellement complet (voir `10_RENAME_MBOASCHOOL_TO_ECOLES237.md`).
- Le titre de page et les métadonnées Open Graph (`src/app/layout.tsx`) sont cohérents avec "Écoles237" et localisés en français camerounais (`locale: "fr_CM"`).

## Responsive et accessibilité de base

- Classes Tailwind responsives (`sm:`, `lg:`) présentes systématiquement sur les grilles et les menus (menu mobile dédié dans le header de l'accueil).
- NON VÉRIFIÉ DANS LE CODE : contrastes de couleurs exacts, navigation clavier, attributs ARIA — aucun attribut `aria-*` ni `role` trouvé en dehors des `aria-label` sur quelques boutons d'icônes (carrousel, filtres). Pas d'audit d'accessibilité formalisable sans outil de test en conditions réelles.

## Formulaires et messages d'erreur

- Validation manuelle cohérente (mots de passe ≥ 8 caractères, confirmation de mot de passe, champs requis natifs HTML `required`).
- Messages d'erreur génériques mais présents pour l'authentification ("Email ou mot de passe incorrect"). Les erreurs Supabase brutes ne sont presque jamais affichées telles quelles à l'utilisateur (bonne pratique côté UX, mais rend le diagnostic plus difficile pour l'équipe support sans les logs serveur).

## Synthèse

| Problème | Type | Sévérité |
|---|---|---|
| "Revendiquer cette page" ne revendique rien | Fonctionnel | Élevée |
| Bouton "Ajouter" (admin) inerte | Fonctionnel | Moyenne |
| Liens "Documents"/"Galerie" (admin) inertes (`#`) | Fonctionnel | Moyenne |
| Déconnexion enseignant cassée | Fonctionnel | Moyenne |
| Onboarding sans garde-fou anti-duplication | Fonctionnel | Moyenne |
| Échec silencieux possible de la sauvegarde admin | Fonctionnel | Élevée (lié à R-001) |
| Duplication du composant Logo (8 fichiers) | Qualité, pas UX visible | Faible |
| Accessibilité non auditée en conditions réelles | Non vérifiable | — |
