# 03 — Recherche

Couvre le moteur de recherche de la page d'accueil (`src/app/page.tsx`) et le filtrage de
`src/app/categorie/[slug]/page.tsx`. Tests demandés par la mission : nom, ville, région, catégorie, sous-système,
public/privé, niveau, combinaison de filtres, performance, pagination, ordre, URL, états vides, messages.

---

## Critères de recherche — couverture réelle

| Critère demandé | Statut sur `/` | Statut sur `/categorie/[slug]` |
|---|---|---|
| Nom | ✅ Champ texte libre (`query`), recherche sur `name` | ✅ Champ texte libre équivalent |
| Ville | ✅ Sélecteur dérivé des villes présentes en base | ❌ Absent |
| Région | ❌ Absent — colonne `region` existe en base mais n'est lue par aucune des deux pages | ❌ Absent |
| Catégorie | ✅ Sélecteur `main_category` | N/A (la page est déjà scopée à une catégorie) |
| Sous-catégorie | ✅ Réinitialisé au changement de catégorie | ✅ Via `?sous=` dans l'URL (bon point, seul filtre réellement dans l'URL) |
| Sous-système (francophone/anglophone/bilingue) | ❌ Absent — aucune colonne ni concept de sous-système dans le schéma actuel | ❌ Absent |
| Public / Privé | ❌ Absent — colonne `ownership_type` existe en base mais n'est lue par aucune des deux pages, jamais affichée ni filtrable | ❌ Absent |
| Niveau | Partiel — capturé implicitement via `main_category`/`sub_category`, pas un filtre "niveau" dédié | Idem |
| Combinaison de filtres | ✅ Fonctionnelle (catégorie + ville + rayon + texte, tous combinables en `AND`) | ✅ Fonctionnelle (sous-catégorie + texte) |
| Rayon géographique | ✅ (2/5/10/20 km, actif seulement si géolocalisation activée) | N/A |

**Trois des sept critères explicitement listés par la mission n'existent pas dans l'annuaire actuel : région,
sous-système, public/privé.** Ce n'est pas un bug (rien n'est cassé), c'est une fonctionnalité absente à
trancher comme décision produit avant la V1 — le mapping de champs préparé dans la mission DATA-REGISTRY-01
(`docs/03_DATA_REGISTRY/FIELD_MAPPING.md`) anticipe déjà `subsystem` et `ownership` comme axes de classification
nationale, cohérent avec ce manque.

## Performance de la recherche

Filtrage 100 % côté client sur la totalité des enregistrements chargés (voir `06_PERFORMANCE.md` §4) — rapide à
l'échelle actuelle (quelques dizaines d'écoles), dégradation attendue en linéaire avec la croissance du catalogue
puisque chaque frappe dans le champ texte relance un `.filter()` sur l'ensemble des données déjà en mémoire côté
navigateur (pas de nouvelle requête réseau, donc pas de latence réseau par frappe, mais un coût de calcul
côté client qui grandit avec le volume).

## Pagination

**Aucune pagination.** `/` limite l'affichage à 3 éléments par catégorie uniquement dans le mode "groupé par
catégorie" (`groupedByCategory`, `.slice(0, 3)`, actif seulement quand `activeCategory === "all"`) ; dès qu'une
catégorie précise est sélectionnée, ou sur `/categorie/[slug]`, la liste complète filtrée est rendue sans limite
ni bouton "voir plus"/pagination numérotée.

## Ordre des résultats

- `/` : `.order("is_featured", { ascending: false })` au niveau de la requête Supabase — les établissements
  "mis en avant" apparaissent en premier, pas d'ordre secondaire explicite (ex. alphabétique, date, distance)
  pour les établissements non mis en avant.
- `/categorie/[slug]` : même logique (`is_featured` décroissant).
- Aucun tri par pertinence de recherche texte (une correspondance dans le nom n'est pas priorisée par rapport à
  une correspondance dans la ville, par exemple) — recherche par inclusion de sous-chaîne simple, pas de
  scoring.

## URL

Voir `05_SEO.md` §10 pour le détail SEO. Résumé fonctionnel : aucun filtre de la page d'accueil (texte, ville,
catégorie, rayon) n'est reflété dans l'URL — un utilisateur qui affine une recherche puis partage le lien, ou
appuie sur "Précédent" dans le navigateur, perd son état de recherche. Seule `/categorie/[slug]?sous=...` reflète
partiellement un filtre dans l'URL.

## États vides et messages

- Recherche accueil : à vérifier dans le rendu de la grille de résultats — le code lu ne montre pas de message
  "Aucun résultat" dédié distinct pour le cas `filtered.length === 0` dans la portion inspectée (les deux modes
  de rendu — groupé par catégorie et grille plate — dépendent tous deux de `filtered`/`groupedByCategory`, sans
  qu'un message d'état vide explicite ait été identifié pendant cette lecture ciblée) — **à vérifier
  précisément avant la V1**, un annuaire sans message clair en cas de recherche infructueuse ("Aucune école ne
  correspond à votre recherche, essayez d'élargir le rayon") dégrade directement l'expérience du parcours
  business prioritaire de la mission (le parent qui cherche une école).
- `/categorie/[slug]` : état de chargement géré (squelettes `animate-pulse`), état "catégorie introuvable" géré
  proprement (`!meta`) avec lien de retour à l'accueil — bon point pour ce cas précis.

## Bug identifié — CTA "Rechercher" du hero

Voir `02_HOME.md` : le bouton "Rechercher" du formulaire de recherche du hero est un lien statique vers
`/categorie/garderie`, indépendant des filtres réellement saisis (nom, catégorie, ville, rayon). C'est le point
d'entrée principal du moteur de recherche affiché en priorité sur la page d'accueil — son comportement actuel
contredit l'intention affichée du formulaire.
