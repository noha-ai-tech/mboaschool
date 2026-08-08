# 02 — Page d'accueil (`src/app/page.tsx`)

Détail par élément demandé par la mission. Constats transverses (SEO, performance, accessibilité, responsive)
détaillés dans les documents dédiés — ce fichier se concentre sur les spécificités de la page d'accueil.

---

## ✔ Hero

- Formulaire de recherche mis en avant visuellement (bordure dégradée rouge/jaune), carrousel d'images en
  colonne de droite (masqué sous `lg`, voir `07_RESPONSIVE.md` §2).
- **Images du hero = photos stock Unsplash**, pas des photos d'établissements camerounais réels (`HERO_IMAGES`,
  lignes 38-43). Un visiteur voit des salles de classe/enfants qui ne représentent aucune école réellement
  présente sur la plateforme — décalage entre promesse visuelle et contenu réel.
- Le bloc "Pour votre école — Votre page visible dans tout le Cameroun" (CTA "Inscrire") n'existe que dans la
  colonne image, donc **invisible sous 1024px** (voir `07_RESPONSIVE.md`).

## ✔ Moteur de recherche

- Champ texte libre + sélecteurs Catégorie / Ville / Rayon + bouton "Me localiser". Couvre une partie des
  critères demandés par la mission (nom, ville, catégorie) mais **aucun filtre région, sous-système
  (francophone/anglophone/bilingue) ni public/privé** — ces critères, explicitement listés dans le périmètre de
  test de la mission (section 2 "Recherche"), n'existent tout simplement pas dans l'interface actuelle.
- Le bouton "Rechercher" du hero ne lance pas une recherche sur place : c'est un `<Link href="/categorie/garderie">`
  qui redirige systématiquement vers la catégorie "garderie" en réinitialisant les filtres actifs
  (`onClick={() => { setActiveCategory("all"); setActiveSubcategory("all"); }}`), **quels que soient les filtres
  renseignés dans le formulaire juste au-dessus**. Un visiteur qui tape "Douala" puis clique "Rechercher" atterrit
  sur la liste des garderies, pas sur une recherche filtrée par Douala — comportement très probablement non
  intentionnel, à confirmer et corriger.
- Détail sur l'absence de reflet des filtres dans l'URL : voir `05_SEO.md` §10 et `03_SEARCH.md`.

## ✔ Catégories

Cinq catégories fixes (`garderie`, `primaire`, `secondaire`, `superieur`, `autres`), chacune avec des
sous-catégories codées en dur (`categories`, lignes 47-78). Cohérent avec `main_category` en base. Le menu
déroulant desktop n'est accessible qu'au survol souris (voir `08_ACCESSIBILITY.md` §1).

## ✔ CTA

- "Inscrire mon école" (header + hero) → `/auth/inscription` : cohérent.
- "Me localiser" → déclenche `navigator.geolocation` puis ouvre la modale carte : fonctionnel.
- "Rechercher" (hero) → voir bug ci-dessus (redirection fixe vers "garderie").
- Connexion / Inscription en header : cohérents.

## ✔ Responsive

Voir `07_RESPONSIVE.md` §1-2. Résumé : header et hero ont des points de rupture explicites et cohérents ;
absence de test visuel réel effectué dans cet audit.

## ✔ Performances

Voir `06_PERFORMANCE.md`. Résumé : une seule requête Supabase (bon point), 100 % Client Component (impact SEO et
temps avant contenu visible), toutes les images en `<img>` natif.

## ✔ SEO / métadonnées / OpenGraph / favicon / title / description / sitemap / robots

Voir `05_SEO.md` pour le détail complet. Résumé pour l'accueil spécifiquement :

- `<title>`/`<meta description>` corrects et statiques (hérités du layout racine — adapté pour une page unique).
- **Pas de `<h1>` identifié dans le hero** (le titre visuel "Trouvez l'école idéale près de chez vous" est un
  `<h2>`) — à vérifier, une page d'accueil sans `<h1>` explicite est un gap SEO classique.
- Compteur "🎓 46 établissements déjà référencés" (bannière défilante, ligne 721) **codé en dur**, alors que
  `seed_schools.sql` contient 40 fiches — le nombre affiché publiquement ne correspond à aucune donnée réelle et
  divergera immédiatement de la réalité en production.
- Favicon, sitemap, robots.txt : absents au niveau du site entier (voir `05_SEO.md`).

## Données

- `HERO_IMAGES` : 4 URLs Unsplash statiques, données fictives par construction (marketing, pas des écoles
  réelles) — acceptable en soi pour un hero marketing, mais à assumer explicitement plutôt que laisser
  l'ambiguïté avec de vraies photos d'établissements.
- Compteur d'établissements codé en dur (voir ci-dessus) — donnée fictive présentée comme un fait.
- La requête charge `couleur_primaire`/`couleur_secondaire`/`emoji_logo`/`quartier` — colonnes **[DÉRIVE]** non
  versionnées dans les migrations (déjà documenté dans `docs/00_CURRENT_STATE_AUDIT/05_DATABASE_CURRENT_STATE.md`),
  directement consommées par cette page publique — confirme que la dette de schéma déjà connue affecte
  concrètement la page la plus visible du produit.
