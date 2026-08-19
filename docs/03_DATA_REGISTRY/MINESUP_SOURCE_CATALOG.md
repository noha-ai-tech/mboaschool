# MINESUP Source Catalog

SPRINT MINESUP-A, 2026-08-19. Opérateur : jean-merlain. READ-ONLY —
découverte et audit de sources, aucun import. Toutes les pages listées ont
été récupérées par `fetch()` brut (jamais un résumé IA) pour compter et
vérifier la structure directement, conformément à
`REGISTRY_EXTRACTION_SAFETY.md`.

## Légitimité d'accès

`https://www.minesup.gov.cm/robots.txt` → `"User-agent: *\n"` — aucune
ligne `Disallow`, accès automatisé non restreint. Aucune authentification,
CAPTCHA ni protection technique rencontrée sur les pages consultées.

---

## Source A — Institutions Universitaires d'État (menu officiel)

```
SOURCE NAME:        Menu "Institutions Universitaires" du portail MINESUP
AUTHORITY:           MINESUP
URL:                 https://www.minesup.gov.cm/ (nav, section "Universités d'Etat")
SOURCE TYPE:          Liste nominative avec liens externes (pas un tableau structuré)
DATE:                  Consulté 2026-08-19
LAST UPDATED:          Inconnu — pas de date affichée sur cette section
COVERAGE:              Universités d'État uniquement
PUBLIC / PRIVATE:      PUBLIC
INSTITUTION TYPES:     Université d'État
REGIONS:               Implicite par nom de ville (Bamenda, Bertoua, Buea, Douala,
                       Dschang, Ebolowa, Garoua, Maroua, Ngaoundéré, Yaoundé I, Yaoundé II)
EXPECTED COUNT:        Non annoncé explicitement
COUNT EXPLICIT:        NON
IDENTIFIER PRESENT:    NON — aucun identifiant MINESUP visible, seulement un
                       nom + un lien EXTERNE vers le site propre de chaque université
IDENTIFIER TYPE:       N/A
NAME:                  OUI (nom complet de l'université)
CITY:                  Implicite (dans le nom, pas un champ séparé)
REGION:                Non fourni directement par cette source
ADDRESS:               NON
PHONE:                 NON
EMAIL:                 NON
WEBSITE:               OUI (lien vers le site propre de chaque université — ex.
                       https://www.univ-douala.cm/, https://uniba.cm/)
ACCREDITATION / AUTHORIZATION: Implicite (université d'État = statut public de fait,
                       aucun document d'autorisation cité sur cette page)
PROGRAMS:              NON (sur cette page — potentiellement sur le site propre de
                       chaque université, hors périmètre MINESUP)
CAMPUS:                NON distingué par MINESUP sur cette page (chaque université =
                       une entrée, "Yaoundé I" et "Yaoundé II" déjà deux entrées
                       distinctes — granularité déjà au niveau souhaité, voir §12)
PAGINATION:            N/A — liste statique complète sur une page
DOWNLOADABLE:          NON (HTML seulement)
STRUCTURED:            FAIBLE — liste de liens, pas un tableau/JSON
SOURCE TIER:           TIER 2 (institution publique officielle listant ses propres
                       entités, mais aucune donnée structurée par établissement)
EXTRACTION METHOD:      Extraction de liens (`extractSelectOptionPairs`-like, à
                       adapter — ce n'est pas un `<select>`, un nouvel extracteur de
                       liste `<li><a>` serait nécessaire, réutilisable pour d'autres ministères)
NOTES:                 11 universités d'État trouvées (Bamenda, Bertoua, Buea, Douala,
                       Dschang, Ebolowa, Garoua, Maroua, Ngaoundéré, Yaoundé I, Yaoundé II).
                       Chaque lien pointe vers le site PROPRE de l'université (domaine
                       différent de minesup.gov.cm) — toute donnée détaillée (adresse,
                       facultés, contact) devrait venir de CES sites-là, chacun avec
                       sa propre structure, pas d'un format commun MINESUP. Risque de
                       fragmentation technique réel si on veut plus que le nom.
```

## Source B — Instituts Privés d'Enseignement Supérieur (IPES), page agrégée

```
SOURCE NAME:        "Instituts Privés d'Enseignement Supérieur (IPES)"
AUTHORITY:           MINESUP
URL:                 https://www.minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/
SOURCE TYPE:          Page WordPress, listes `<ul><li>` groupées par région
DATE:                  Consulté 2026-08-19
LAST UPDATED:          Inconnu — pas de date de dernière modification affichée
COVERAGE:              IPES (établissements privés d'enseignement supérieur), 10 régions
PUBLIC / PRIVATE:      PRIVATE (exclusivement)
INSTITUTION TYPES:     "Institut Supérieur", "Institut Universitaire", "École Supérieure",
                       "Higher Institute" — dénominations très variées, pas de taxonomie
                       fermée visible (voir MINESUP_IMPORT_CONTRACT.md §Taxonomy)
REGIONS:               10 régions confirmées présentes comme en-têtes de section :
                       Adamaoua, Centre, EST, Extrême-Nord, Littoral, Nord, Nord-Ouest,
                       Ouest, Sud, Sud-Ouest
EXPECTED COUNT:        "environ 430" — texte explicite de la page :
                       « L'Enseignement Supérieur compte environ 430 Instituts Privés
                       d'Enseignement Supérieur répartis comme suit ». APPROXIMATIF, pas
                       un compteur exact — ne peut PAS servir de SOURCE_EXPLICIT_COUNTER
                       au sens strict de REGISTRY_EXTRACTION_SAFETY (§6/§8 de ce sprint).
COUNT EXPLICIT:        PARTIEL — "environ" seulement, pas un total exact
IDENTIFIER PRESENT:    NON sur cette page-liste — chaque entrée est un simple nom (+ un
                       lien interne `minesup.gov.cm/?page_id=NNNN`, voir Source C pour ce
                       que révèle une page de détail)
IDENTIFIER TYPE:       N/A sur cette page
NAME:                  OUI
CITY:                  NON sur cette page (seulement la région, par section)
REGION:                OUI — implicite par section, pas un champ par ligne (extraction
                       par segmentation d'en-tête nécessaire, comme
                       `segmentByHeading()` déjà utilisé pour Osidimbea/R.2-SAFETY)
ADDRESS:               NON sur cette page
PHONE:                 NON sur cette page
EMAIL:                 NON sur cette page
WEBSITE:               NON sur cette page (le lien `page_id` mène à une fiche MINESUP,
                       pas au site propre de l'institut)
ACCREDITATION / AUTHORIZATION: NON sur cette page (voir Source C)
PROGRAMS:              NON sur cette page (voir Source C)
CAMPUS:                Non applicable — aucune mention de campus multiples pour un IPES
                       dans l'échantillon consulté
PAGINATION:            Aucune — page statique unique agrégeant les 10 régions
DOWNLOADABLE:          NON (HTML seulement)
STRUCTURED:            MOYEN — `<ul><li>` groupé par en-tête de région, mais structure
                       HTML **incohérente entre régions** (voir NOTES)
SOURCE TIER:           TIER 2 (page officielle MINESUP, mais liste seulement — pas un
                       registre structuré avec identifiants par ligne)
EXTRACTION METHOD:      Segmentation par en-tête de région (`<p><strong>Région...`) +
                       extraction `<li>` — PROTOTYPE validé dans ce sprint (voir §29),
                       jamais exécuté en collecte réelle
NOTES:                 **Complétude non prouvée.** Extraction déterministe de cette
                       page : 304 institutions (10 régions), contre les "~430" annoncés
                       en préambule — écart réel de ~126 (~30%), non expliqué avec
                       certitude par ce sprint. Deux causes possibles identifiées mais
                       NON confirmées : (a) le chiffre "environ 430" est une estimation
                       de communication, pas un total machine-vérifiable ; (b) les pages
                       DÉDIÉES par région (menu séparé, ex.
                       `/index.php/centre/`) contiennent potentiellement plus
                       d'établissements que leur section correspondante sur cette page
                       agrégée — vérifié pour Centre uniquement (~102-103 sur la page
                       dédiée contre 100 sur la page agrégée, écart mineur pour cette
                       région spécifiquement, n'explique pas l'essentiel du delta
                       national). **STRUCTURE HTML INCOHÉRENTE CONSTATÉE** : la section
                       "Région de l'Adamaoua" est encapsulée dans un `<div
                       class="wp-block-freeform">` supplémentaire absent des autres
                       régions — une première extraction par regex rigide a
                       silencieusement raté cette région entière (10 institutions) avant
                       correction. Leçon directement applicable à
                       REGISTRY_EXTRACTION_SAFETY : ne jamais supposer qu'une structure
                       WordPress est uniforme sur toute une page, même au sein d'un même
                       document.
```

## Source C — Fiche de détail d'un institut (échantillon technique unique)

```
SOURCE NAME:        Fiche institution individuelle MINESUP (ex. page_id=8051)
AUTHORITY:           MINESUP
URL:                 https://minesup.gov.cm/?page_id=8051 (motif — un identifiant
                     WordPress interne par institution, pas un identifiant officiel)
SOURCE TYPE:          Page de détail structurée (template commun)
DATE:                  Consulté 2026-08-19 — UN SEUL échantillon (Institut Universitaire
                       Catholique de Bertoua), conformément à l'interdiction de collecte
                       massive de ce sprint (§27)
LAST UPDATED:          Inconnu
COVERAGE:              Une institution par page — ~292-430 pages au total si généralisé
                       (NON fait, hors périmètre de ce sprint)
PUBLIC / PRIVATE:      PRIVATE (échantillon pris dans la liste IPES)
INSTITUTION TYPES:     Institut universitaire (voir modèle de champs ci-dessous, générique)
REGIONS:               1 par fiche (champ "Région" rempli : "EST" dans l'échantillon)
EXPECTED COUNT:        N/A (fiche unique)
COUNT EXPLICIT:        N/A
IDENTIFIER PRESENT:    OUI — **"Arrêtés portant création"** (ex. "07/0140/MINESUP du 21
                       Septembre 2007") est le SEUL identifiant officiel réellement
                       présent. Le `page_id` de l'URL est un identifiant CMS interne au
                       site MINESUP, PAS un identifiant officiel — ne jamais le
                       confondre avec un matricule (§9 de la spec : "ne pas supposer
                       qu'un numéro d'arrêté est un identifiant établissement" — analysé
                       ci-dessous §Identifier Analysis).
IDENTIFIER TYPE:       Référence d'arrêté ministériel (numéro + date), format textuel
                       libre observé sur cet échantillon unique — format général NON
                       confirmé sur un corpus plus large dans ce sprint.
NAME:                  OUI ("Nom de l'institution")
CITY:                  Champ "Site de localisation" présent MAIS VIDE dans l'échantillon
REGION:                OUI, rempli ("EST")
ADDRESS:               Champ "Adresse postale" présent, seulement "B.P. :333" (pas
                       d'adresse physique complète)
PHONE:                 OUI, rempli (+237 696 874 205)
EMAIL:                  Champ présent mais VIDE dans l'échantillon
WEBSITE:                Champ présent mais VIDE dans l'échantillon
ACCREDITATION / AUTHORIZATION: Section dédiée "INFORMATIONS SUR LE STATUT
                       D'ACCRÉDITATION" avec "Arrêtés portant création" ET
                       "Autorisation d'ouverture" (ce second champ vide dans
                       l'échantillon — les deux ne sont PAS automatiquement synonymes,
                       à traiter comme deux concepts distincts, cohérent avec §15 de la
                       spec : ne jamais inventer un statut absent)
PROGRAMS:              OUI — section "FILIÈRES, SPÉCIALITÉS ET DIPLÔMES AUTORISÉES"
                       détaillée (7+ filières listées pour cet échantillon) — donnée
                       RICHE mais **ne doit jamais devenir une ligne establishment par
                       filière** (§19 de la spec)
CAMPUS:                Pas de section dédiée distincte observée sur cet échantillon —
                       une seule adresse/localisation par fiche
PAGINATION:            N/A (fiche unique)
DOWNLOADABLE:          NON (HTML seulement)
STRUCTURED:            FORT — template de champs nommés cohérent, idéal pour extraction
                       déterministe SI généralisé (non vérifié sur plusieurs échantillons)
SOURCE TIER:           TIER 2 (page officielle MINESUP, contenu détaillé mais non
                       téléchargeable en masse, un seul échantillon vérifié)
EXTRACTION METHOD:      Extraction de champs nommés (regex sur libellés "Nom de
                       l'institution :", "Région :", etc.) — PROTOTYPE non généralisé,
                       nécessiterait une validation sur un échantillon plus large avant
                       toute collecte réelle (risque réel : champs vides traités comme
                       absents plutôt qu'inventés, déjà le comportement observé/souhaité)
NOTES:                 **DONNÉE SENSIBLE REPÉRÉE** : champ "Nom du promoteur" — nom
                       d'une personne physique (représentant légal de l'institution).
                       Recommandation ferme (§36 minimisation) : NE PAS collecter ni
                       stocker ce champ dans un futur import Écoles237, même s'il est
                       publiquement affiché par MINESUP — aucun besoin produit identifié
                       pour l'afficher, et ce n'est pas une donnée sur l'établissement
                       lui-même. Visiter systématiquement ~300-430 fiches individuelles
                       pour un import complet constituerait une collecte massive —
                       explicitement hors périmètre de ce sprint (§27), à planifier
                       comme un futur MINESUP-B avec ses propres garanties de politesse
                       réseau (délai, retries — `lib/politeFetch.ts` déjà disponible).
```

## Sources écartées / non retenues comme prioritaires

- **Réseaux sociaux MINESUP** (Twitter/X `@MINESUPOfficiel`, Facebook) — DISCOVERY ONLY,
  jamais une source de vérité pour une liste d'établissements (cohérent avec la
  politique déjà établie SPRINT R.2 §18).
- **Kamerpower.com, camerounweb.com** — sites tiers/annuaires, DISCOVERY ONLY. Un
  résultat de recherche a mentionné "Liste des établissements reconnus par le MINESUP
  Cameroun IPES" sur Kamerpower — **non consulté comme source de vérité**, uniquement
  comme indice que la question de "reconnaissance officielle" est un sujet réel et
  parfois contesté (un autre résultat de recherche, "IAI-Cameroun reconnu par le
  MINESUP : le démenti officiel 2026", confirme concrètement que des institutions
  peuvent revendiquer une reconnaissance MINESUP de façon contestée — renforce la
  consigne §14 : ne jamais transformer "présent dans une liste tierce" en statut vérifié).
- **PDF/arrêtés téléchargeables en masse** — recherche effectuée, aucun document PDF
  consolidé (liste complète + numéros d'agrément) trouvé publiquement à ce jour. Les
  arrêtés existent (confirmé par la fiche de détail, Source C) mais semblent publiés
  au cas par cas dans les actualités du site, pas consolidés en un registre
  téléchargeable unique.

## Résumé des sources

| Source | Tier | Structuré | Identifiant officiel | Complétude prouvée |
|---|---|---|---|---|
| A — Universités d'État (nav) | 2 | Faible | Non | N/A (11 universités, liste fermée connue par ailleurs) |
| B — IPES agrégé | 2 | Moyen | Non (liste seule) | NON — 304 trouvés vs "~430" annoncé, écart non résolu |
| C — Fiche détail IPES | 2 | Fort | OUI (arrêté) | N/A (1 seul échantillon vérifié) |
