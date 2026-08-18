# SPRINT R.2-A2 — Investigation de sources, villes Priorité 1

Opérateur : jean-merlain. Date : 2026-08-18. Portée : recherche de sources Tier 1/2 exploitables
en LIST COMPLETENESS pour les 8 villes Priorité 1 (Bafoussam, Bamenda, Buea, Limbe, Kumba, Garoua,
Maroua, Ngaoundéré), avant toute extraction. Aucune écriture staging n'a été effectuée — voir
conclusion.

## Ce qui a fonctionné pour Douala/Yaoundé (rappel, non reproduit ici)

Le réseau `memoire<région>0.jimdofree.com` ("Osidimbea — La Mémoire du Cameroun") couvrait
Littoral et Centre avec des tables HTML à 3 colonnes uniformes, sectionnées par arrondissement —
exactement le format qui a rendu possible l'extraction déterministe du pilote.

## Sources vérifiées pour l'expansion Priorité 1 — aucune adaptée

### 1. `memoire<région>0.jimdofree.com` pour les 8 autres régions

Recherche web ciblée (plusieurs requêtes, y compris essais directs de noms de sous-domaine) : aucun
sous-domaine jimdofree équivalent trouvé pour Ouest, Nord-Ouest, Sud-Ouest, Nord, Extrême-Nord,
Adamaoua, Est, Sud. Le réseau `mystory-medical.jimdofree.com` existe mais couvre les hôpitaux, pas
l'éducation.

### 2. `osidimbea-edu.cm/secondaire-1/<région>/` — site canonique national

Existe et couvre bien les 10 régions dans sa navigation. Vérification directe (fetch brut, pas de
résumé IA) :

- **Ouest** (`/secondaire-1/ouest/`) — page de profil de délégation régionale (délégués successifs,
  liste des départements, offre de formation, statistiques générales). 5 `<table>` présentes mais
  aucune n'est une liste d'établissements — ce sont des tableaux de statistiques/historique.
- **Extrême-Nord / Diamaré** (`/secondaire-1/extreme-nord/diamare/`) — page trouvée via un lien de
  navigation régional, mais son contenu réel est vide : uniquement le menu du site répété, 0 table,
  aucun texte propre à Diamaré. Couvre Maroua (chef-lieu du département) en théorie, mais aucune
  donnée n'y est actuellement publiée.
- **Littoral** — structuré différemment des autres régions (sous-pages par année scolaire, ex.
  `littoral-2023-2024`), confirmant que la structure du site n'est PAS uniforme d'une région à
  l'autre — chaque région nécessiterait sa propre investigation, pas un seul parseur réutilisable.

Conclusion : ce site est peu ou pas peuplé en dehors de Littoral/Centre au moment de cette
investigation.

### 3. `ecolesaucameroun.com` — répertoire département/arrondissement

Piste prometteuse initialement (`departement.php?id=46-departement-de-la-mifi`,
`arrondissement.php?id=285-arrondissement-de-bafoussam-i`) — mais vérification du HTML brut de la
page arrondissement de Bafoussam I révèle :

- Exactement 10 entrées, toutes des écoles **primaires** ("Ecole Publique...", "Ecole Primaire
  Publique Bilingue...") — aucun établissement secondaire.
- Aucun marqueur de pagination (`page=`, lien "suivant") trouvé dans le HTML.
- Un établissement secondaire confirmé réel de cet arrondissement, "Lycée Classique de Bafoussam"
  (`ecole.php?id=4065-...`, trouvé indépendamment par recherche), **n'apparaît pas** dans cette
  liste de 10 — alors qu'il devrait y figurer si la liste était complète.
- Conclusion : cette page affiche un flux "derniers ajouts" (tri par identifiant décroissant), pas
  un inventaire complet de l'arrondissement. Extraire à partir de cette page produirait exactement
  le sous-comptage silencieux que le framework R.2-SAFETY interdit — non utilisée.

**Alerte méthodologique constatée en direct** : le résumé WebSearch/IA de cette même page a
affirmé "Bafoussam I a 47 écoles, Bafoussam II 26, Bafoussam III 30" — chiffres qu'aucune
vérification du HTML brut ne confirme (10 entrées visibles, aucun total affiché nulle part sur la
page). Exemple concret de l'incident R.2 Yaoundé qui se reproduirait si ces chiffres avaient été
utilisés sans vérification déterministe.

### 4. `cartescolaire.cm/minesec` — portail officiel MINESEC

Confirmé officiel (portail national de vérification de matricule MINESEC). Contient un menu
déroulant `<select name="school_code">` avec **5313 options** (nom + code matricule), compté
directement dans le HTML brut — pas un résumé IA. C'est significativement plus grand que les 1938
établissements MINESEC actuellement en production, donc potentiellement une source de grande
valeur pour un futur sprint de re-collecte MINESEC.

Limite constatée : ce menu déroulant appartient à un formulaire (`search-form` →
`https://cartescolaire.cm/get-matricule`, méthode GET) qui exige aussi un champ `student_name`
(obligatoire) et transporte un jeton CSRF (`_token`) lié à une session. **Ce n'est pas un outil de
recherche d'établissement — c'est un outil de vérification du matricule d'un ÉLÈVE**, où
`school_code` sert seulement à indiquer l'établissement de l'élève recherché. Aucune région/ville
par établissement n'est exposée nulle part sur cette page, et il n'existe aucune page de
navigation par région/département sur ce site (menu limité à `/verify-payment`, `/pay-fees`,
`/faq`, `/whistleblow`, `/login`).

Interroger cet endpoint avec des noms d'élèves fabriqués pour sonder la structure de réponse a été
jugé inapproprié : c'est un service gouvernemental de vérification/paiement en production, pas un
bac à sable, et rien n'indique que la réponse contiendrait de toute façon la ville/région de
l'établissement (la question porte sur l'élève, pas sur l'établissement). Non tenté.

### 5. PDF officiels MINESEC

`minesec.gov.cm/web/index.php/fr/carte-scolaire/extrants` (page "Annuaire Statistique et Rapport
d'Analyse") vérifiée directement — 0 lien PDF sur la page au moment de cette investigation. Le seul
document PDF trouvé par recherche web, "Panorama de la Carte Scolaire du MINESEC 2015-2016", est
un document statistique agrégé (comptages par catégorie/région), pas une liste nominative
d'établissements, et daté de 2015-2016 (obsolète).

## Conclusion

Aucune source Tier 1/2 permettant une extraction déterministe LIST COMPLETENESS n'a été trouvée
pour Bafoussam (et par extension, probablement les 7 autres villes Priorité 1 partageant le même
paysage de sources) dans le temps de cette investigation. Le seul candidat sérieux
(`cartescolaire.cm`, 5313 établissements) manque la dimension géographique nécessaire à la mission
"grandes villes" et n'est pas exploitable sans requêtes massives inappropriées vers un service
gouvernemental de paiement/vérification.

**Aucune ligne n'a été ajoutée à `establishment_import_staging` pendant SPRINT R.2-A2.** Voir
`reports/registry/major-cities-a2-summary.json` (compteurs à 0) et
`reports/registry/major-cities-a2-approval.json` (snapshot vide).

## Piste pour un futur sprint

La liste nationale de 5313 matricules MINESEC (`cartescolaire.cm/minesec`) mérite un sprint dédié
de re-collecte MINESEC (pas Major Cities) : comparaison NOM + official_id contre
`data/registry/master/minesec-national-v1-final.json` (1942 matricules) pour quantifier l'écart,
sans dépendre d'une attribution ville/région par entrée. Nécessiterait une décision produit sur la
légitimité d'utiliser ce portail comme source (c'est un outil de vérification de paiement, pas un
registre public documenté comme tel) avant toute collecte à cette échelle.
