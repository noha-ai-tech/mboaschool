# RELEASE-CONSOLIDATION-07A.1 — Rapport de consolidation

Date : 2026-09-03  
Branche : `integration/final-platform-consolidation`  
Base : `db7ad55`  
Déploiement production : **non exécuté**

## Résultat

- La page d’accueil utilise désormais une route serveur dédiée qui parcourt le registre par pages de 1 000 lignes et demande le total exact à Postgres. La limite implicite de 1 000 lignes du client navigateur ne peut plus fausser les compteurs.
- Valeurs observées pendant la QA locale : 2 255 établissements, 10 régions, 1 029 villes distinctes et 5 catégories représentées.
- Les comptes par catégorie proviennent du même registre réel.
- Le composant de marque partagé utilise les assets validés `logo-light.png` et `logo-dark.png`. Le favicon reste inchangé.
- La recherche d’accueil propose Toutes les catégories, Toutes les régions et Toutes les villes. La liste des villes dépend de la région, et les paramètres `categorie`, `region` et `ville` sont transmis à `/recherche`.
- Une autocomplétion temporisée apparaît après deux caractères sur l’accueil et dans l’annuaire. Elle propose des villes et des écoles réelles ; une ville applique le filtre et une école ouvre directement sa destination publique appropriée.
- Guyskull (`a4cc4966-0d85-4c63-9c24-0538b8d5133b`) est placé en première position dans « Établissements à la une », sans doublon. Les places restantes conservent la requête générique `is_featured` et le nombre total est plafonné à 10.
- Les surfaces SEO de RELEASE-07 sont inchangées : metadata SSR, canonical, JSON-LD, sitemap, robots et OpenGraph.

## Vérifications

- TypeScript (`tsc --noEmit`) : réussi.
- Lint : réussi, aucune erreur. Quatre avertissements préexistants restent hors périmètre (hooks dans trois écrans existants et balise `img` existante dans l’annuaire).
- Tests ciblés 07A.1 + SEO : 10/10 réussis.
- Suite complète : 358/358 réussis.
- Build Next.js production local : réussi, 95 pages générées.
- API locale : `/api/homepage` renvoie les quatre statistiques ci-dessus et cinq cartes vedettes, Guyskull en première position ; `/api/search-suggestions?q=guy` renvoie Guyskull/Douala.
- QA responsive : 1440, 1024, 768 et 390 px réussis ; logo, recherche et Guyskull visibles, aucun débordement horizontal.
- Navigation testée : `categorie=primaire`, `region=Littoral`, `ville=Douala` correctement propagés vers l’annuaire.
- Audit npm : lancé sans modification de dépendances, mais le registre npm n’a produit aucune réponse dans le délai de contrôle et la commande a été arrêtée. Cet échec réseau n’affecte ni les tests ni le build.

## Limites et décisions

- Aucune migration, écriture Supabase ou modification de données n’a été effectuée.
- Aucun `vercel --prod` ni autre déploiement n’a été exécuté.
- Les statistiques reflètent exactement les valeurs lisibles dans le registre au moment de chaque requête ; elles ne sont pas codées en dur.
