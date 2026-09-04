# Refonte fiche école premium — moteur CMS partagé

## Passe de fidélité visuelle — 4 septembre 2026

La page d'accueil Guyskull dispose désormais d'une composition dédiée proche de la maquette validée : en-tête Écoles237, héros institutionnel, navigation secondaire, présentation, programmes, tableau de frais, galerie, performances et colonne d'actions/informations.

Les enrichissements éditoriaux et chiffrés restent strictement limités à l'UUID Guyskull et sont marqués comme contenus de démonstration. Les autres établissements continuent d'afficher uniquement leurs données publiées. Aucun changement n'a été appliqué à la base et aucun déploiement de production n'a été lancé.

Contrôles finaux : TypeScript réussi, lint sans erreur (4 avertissements préexistants), 361 tests généraux réussis, 3 tests visuels dédiés réussis, build de 95 pages réussi. QA navigateur réussie à 1440, 1024, 768 et 390 px, sans débordement horizontal ni écran d'erreur.

Date : 2026-09-03  
Branche : `integration/final-platform-consolidation`  
Référence visuelle : maquette Guyskull fournie par le fondateur  
Déploiement production : **non exécuté**

## Livraison

- Hero plus compact et immersif, avec logo d’établissement lorsqu’il existe, nom, devise, catégorie, localisation, badges autorisés et CTA réels.
- Accueil de fiche recomposé en deux colonnes sur ordinateur : contenu éditorial principal et panneau d’actions/informations pratiques persistant.
- Présentation, infrastructures, programmes/niveaux, frais, galerie, résultats, actualités, documents et liens continuent de dépendre des données et règles de visibilité du CMS.
- Guyskull exploite ses contenus de démonstration déjà publiés (tarifs, galerie conceptuelle, événements) avec les mentions de démonstration existantes.
- Les écoles réelles utilisent exactement les mêmes composants ; aucune valeur de la maquette (100 %, 98 %, Top 10, Bastos, tarifs ou contacts fictifs) n’a été injectée dans le code.
- Les cinq routes publiques et leurs cinq miroirs d’aperçu CMS sont préservés.
- Metadata SSR, canonical, JSON-LD, sitemap, robots et OpenGraph sont inchangés.

## Vérification

- TypeScript : réussi.
- Lint : réussi sans erreur ; quatre avertissements préexistants restent hors périmètre.
- Tests : 361/361 réussis.
- Build Next.js : réussi ; 95 pages générées.
- QA réelle Guyskull : hero, tarifs de démonstration, galerie, actualités, CTA et informations pratiques visibles.
- Responsive : 1440, 1024, 768 et 390 px, aucun débordement horizontal.

## Intentionnellement inchangé

- Aucune donnée Supabase n’a été créée ou modifiée.
- Aucun contenu fictif de la maquette n’a été appliqué aux écoles réelles.
- Aucun déploiement Vercel n’a été exécuté.
