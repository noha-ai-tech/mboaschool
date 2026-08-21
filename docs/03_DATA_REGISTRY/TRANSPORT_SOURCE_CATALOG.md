# Transport Source Catalog

## Addendum TRANSPORT-A.1 (2026-08-21) — mis à jour après ce sprint, voir en bas de fichier

Un second sprint READ-ONLY (TRANSPORT-A.1, même jour) a repris cette
recherche avec un outillage PDF récupéré et une recherche élargie. Voir
la section **« TRANSPORT-A.1 — Addendum »** tout en bas de ce fichier
pour le détail complet. Résumé : toujours AUCUNE source nominative
officielle trouvée (CAM-TVET définitivement écarté comme hors-périmètre
transport, lien mort confirmé irrécupérable via Wayback Machine,
TRANSTAT MINT 2025 confirmé agrégat pur grâce à une extraction PDF
désormais réussie), mais 10 noms réels d'auto-écoles/institutions
maritime/aviation identifiés via annuaires privés et sites institutionnels
tiers (Tier 3, jamais gouvernemental) — voir
`reports/registry/transport-a1-*.{json,csv}`.

---

SPRINT TRANSPORT-A, 2026-08-21. Opérateur : jean-merlain. READ-ONLY —
découverte et audit de sources uniquement, aucun import, aucune écriture
staging, aucune promotion, aucun pilote lancé. Toutes les pages
consultées l'ont été par `WebFetch`/`WebSearch` bruts (jamais un résumé
IA pris comme extraction primaire pour compter des lignes), conformément
à `REGISTRY_EXTRACTION_SAFETY.md`. MINSANTE reste en pause
(`BLOCKED_PENDING_HUMAN_DOCUMENTARY_VALIDATION`) — non touché.

## 0. Deux domaines à distinguer immédiatement

```
mintransports.cm   → domaine OFFICIEL du Ministère des Transports du Cameroun.
                     Contenu réel (actualités, PDF, communiqués) confirmé
                     accessible ce sprint (HTTP 200 sur plusieurs pages/PDF).

mintransports.net  → DOMAINE SQUATTÉ/PARKING. Au moment de ce sprint,
                     héberge du contenu commercial de paris en ligne
                     (plateforme "1Win", contenu Côte d'Ivoire), SANS
                     RAPPORT avec le ministère. Un résultat de recherche
                     avait indexé une ancienne URL de ce domaine
                     ("liste-des-auto-ecoles-appelees-a-regulariser...")
                     qui répond aujourd'hui HTTP 404 — soit contenu
                     supprimé, soit lien d'indexation obsolète d'avant le
                     rachat du domaine. NE JAMAIS traiter mintransports.net
                     comme une source officielle, même si un ancien lien
                     y pointait. Précédent direct avec le pattern déjà vu
                     sur MINEFOP-A.1 (domaine parqué minefop.gov.cm).
```

Toute future collecte doit exclure `mintransports.net` de toute
allow-list de domaine.

---

## Source A — mintransports.cm (portail officiel) — PARTIELLEMENT EXPLOITABLE

```
SOURCE NAME:           Portail officiel du Ministère des Transports (MINT)
AUTHORITY:             MINT (Ministère des Transports)
URL:                   https://mintransports.cm/
SOURCE TYPE:           Portail institutionnel + dépôt de PDF (actualités,
                       communiqués, statistiques, décrets)
DATE:                  Consulté 2026-08-21
TIER:                  1 (autorité officielle confirmée, domaine actif,
                       HTTPS valide, contenu réel vérifié)
COVERAGE:              Page d'accueil accessible ; rubrique dédiée
                       "auto-écoles" avec liste consultable NON localisée
                       ce sprint malgré recherche ciblée (menu
                       "Documentations" > "Textes" présent mais lien non
                       fonctionnel au moment du test)
NATIONAL/REGIONAL:     National, avec structure PDF organisée par
                       région/ville pour au moins un type de document
                       (voir dossier `/images/Permis/<date>/<région>/`)
PUBLIC/PRIVATE:        N/A (portail institutionnel)
ENTITY TYPES:          Le portail couvre transport routier, aérien,
                       maritime/fluvial et sécurité routière — cohérent
                       avec le mandat légal du ministère
REGIONS:               Structure de dossier confirmée par région pour les
                       PDF "Permis" (ex. `Sud-ouest/LIMBE 25-01-2025.pdf`)
EXPECTED COUNT:        Non observé directement (aucune page de liste
                       atteinte avec un total explicite)
IDENTIFIER PRESENT:    Non confirmé pour les auto-écoles — PDF testés
                       illisibles avec les outils disponibles ce sprint
                       (voir NOTES)
DOWNLOADABLE:          PDF individuels oui quand l'URL exacte est connue
                       (plusieurs confirmés HTTP 200 : rapports
                       statistiques, décret, documents "Permis" par
                       région/ville)
STRUCTURED:            Portail de type site vitrine, pas d'API structurée
                       identifiée
SOURCE TIER:           1 pour l'autorité, mais NON EXPLOITÉ comme registre
                       nominatif ce sprint faute d'avoir localisé la page
                       de liste elle-même
EXTRACTION METHOD:     Aucune — lecture de pages/PDF individuels
                       uniquement, jamais un résumé IA compté comme
                       extraction de registre
NOTES:                 Deux catégories de PDF distinctes repérées sous
                       `/images/` :
                       (1) `/images/news/pdfs/...` — rapports/statistiques/
                       décrets (ex. "TRANSTAT-MINT-2025-FR-Ok.pdf",
                       "decret-n-2023-434-du-04-10-2023.pdf") ;
                       (2) `/images/Permis/<AAAA-MM-JJ>/<Région>/<VILLE
                       date>.pdf` — nature exacte NON déterminée ce
                       sprint : le fichier testé (LIMBE 25-01-2025.pdf,
                       1.4 Mo) contient une image JPEG intégrée non
                       décodable par les outils disponibles (pas de rendu
                       PDF local — `pdftoppm`/poppler absent de
                       l'environnement, et l'extraction texte via
                       WebFetch échoue sur ce fichier). Le nom du dossier
                       ("Permis") suggère fortement des résultats/listes
                       liés aux PERMIS DE CONDUIRE par session d'examen —
                       PAS un registre d'auto-écoles au sens strict. RISQUE
                       PII ÉLEVÉ NON ÉVALUÉ si ce sont des résultats
                       nominatifs de candidats (voir §16 du contrat) —
                       AUCUNE tentative d'extraction plus poussée faite ce
                       sprint, conformément à la politique OCR
                       prudente déjà appliquée en MINEFOP-A.1 (Source H).
                       Les deux PDF "news" testés (TRANSTAT, décret) sont
                       également restés illisibles avec les outils
                       disponibles (contenu majoritairement image/police
                       intégrée) — à retenter avec un outil d'extraction
                       PDF texte natif (`pdftotext`) dans un futur sprint
                       si ce ministère est réactivé.
```

## Source B — Cadre légal : Arrêté N°00406/A/MINT/DTT du 28 avril 2000 — TIER 1 (texte, pas liste)

```
SOURCE:                Arrêté N°00406/A/MINT/DTT du 28 avril 2000 portant
                       réglementation du permis de conduire et des
                       auto-écoles
PUBLISHER:             Ministère des Transports (texte cité de façon
                       cohérente par plusieurs sources secondaires
                       indépendantes — camerlex.com, 237online.com)
AUTHORITY:             TIER 1 pour le texte lui-même (base légale
                       officielle citée par son numéro complet), TIER 3
                       pour les canaux d'accès utilisés ce sprint (aucun
                       PDF officiel du texte intégral atteint directement
                       — reconstruit par citation croisée, pas lu en
                       version primaire)
DATE:                  28 avril 2000
FORMAT:                Texte réglementaire (non atteint en version
                       primaire ce sprint)
COVERAGE:              Cadre national — procédure d'agrément en 2 niveaux :
                       chef de service PROVINCIAL/DÉPARTEMENTAL des
                       Transports Terrestres instruit le dossier (délai 15
                       jours, Art. 5), transmission à la DIRECTION DES
                       TRANSPORTS TERRESTRES (DTT), agrément tacite après
                       60 jours sans réponse
ENTITY TYPE:           Auto-école (transport routier)
IDENTIFIER:            Confirme qu'un agrément individuel est délivré par
                       établissement, mais ne fournit ni format normalisé
                       ni liste de numéros — AUCUN format inventé ici
NATIONAL/REGIONAL:     Instruction régionale/départementale, DÉCISION
                       finale au niveau ministériel (national) — cohérent
                       avec le principe "agrément national" (par
                       opposition à une délivrance purement locale)
COMPLETENESS:          N/A — texte réglementaire, pas un registre
PII:                   Aucune (texte de portée générale)
STATUS:                Existence confirmée par citation croisée
                       indépendante (2 sources secondaires distinctes,
                       même numéro d'arrêté cité), texte primaire non
                       localisé ce sprint
NOTES:                 Confirme la DIRECTION DES TRANSPORTS TERRESTRES
                       (DTT) comme service gestionnaire pour les
                       auto-écoles — nom de service directement
                       réutilisable si un futur registre d'identifiants
                       est modélisé (cf. §12 du contrat).
```

## Source C — Presse (Cameroon Tribune, 237online, journalducameroun, etc.) — DISCOVERY / AGGREGATE ONLY

```
SOURCE TYPE:           Articles de presse rapportant des chiffres et
                       événements ministériels sur les auto-écoles
EXEMPLES:
  - "166 auto-écoles agréées" (Cameroon Tribune, article ~2015, domaine
    d'archive ct2015.cameroon-tribune.cm — domaine non résolvable ce
    sprint, DNS en échec)
  - "Plus de 450 auto-écoles enregistrées, seulement 102 autorisées"
    (chiffre rapporté sans date précise identifiée avec certitude ce
    sprint)
  - "250 auto-écoles clandestines recensées" (237actu.com)
  - "Près de 50 auto-écoles suspendues" (journalducameroun.com)
  - Suspension d'un an de la délivrance de nouveaux agréments, décision
    attribuée au ministre Robert Nkili (cameroun24.net)
TIER:                  3 / DISCOVERY ONLY — presse, jamais une source
                       primaire
DATE:                  Hétérogène, non datée avec précision pour
                       plusieurs articles — AUCUN chiffre ci-dessus ne
                       doit être traité comme un expected_count actuel
COUNT EXPLICIT:        Plusieurs chiffres contradictoires selon l'année/
                       l'article (166 / 450 / 102 / 250 / ~50 suspendues)
                       — signal cohérent avec un secteur MOUVANT
                       (créations, suspensions, retraits répétés), PAS
                       une preuve de registre stable
IDENTIFIER PRESENT:    NON — jamais de numéro d'agrément individuel cité
                       dans ces articles
EXTRACTION POSSIBLE:   NON — aucune liste nominative, uniquement des
                       totaux et des événements
PII:                   Aucune détectée dans les extraits consultés
                       (agrégats et déclarations institutionnelles)
NOTES:                 Confirme la RÉALITÉ d'un cycle recensement/
                       sanction récurrent piloté par le ministère
                       (cohérent avec l'existence d'une liste interne
                       tenue par la DTT), mais AUCUNE de ces sources ne
                       constitue elle-même un registre exploitable. Utile
                       uniquement comme corroboration contextuelle de
                       l'existence d'un processus d'agrément actif.
```

## Source D — TRANSTAT MINT 2025 (annuaire statistique) — TIER 1, AGRÉGAT PROBABLE

```
SOURCE:                "TRANSTAT MINT 2025" — annuaire statistique des
                       transports
URL:                   https://mintransports.cm/images/news/pdfs/8368812b20a3de079c5a52ba2aea30f1-TRANSTAT-MINT-2025-FR-Ok.pdf
PUBLISHER:             Ministère des Transports (hébergé sur le domaine
                       officiel)
AUTHORITY:             TIER 1 — document officiel MINT
DATE:                  2025 (édition)
FORMAT:                PDF (7.2 Mo) — contenu textuel NON extrait avec
                       succès ce sprint (police/image intégrée, outils
                       disponibles insuffisants — pas de `pdftotext`
                       local)
COVERAGE:              Présumée nationale (par analogie avec le titre et
                       la mention presse d'un tableau "auto-écoles créées
                       par sexe et département, 2018-2022" dans un
                       document apparenté "Sur la route de l'émergence")
ENTITY TYPE:           Statistiques transport toutes filières (probable :
                       auto-écoles, permis délivrés, parc automobile,
                       transport aérien/maritime)
COUNT:                 NON EXTRAIT ce sprint (échec technique, pas un
                       échec de recherche — le document existe et est
                       accessible en HTTP 200)
IDENTIFIER:            Présumé absent (annuaire statistique = agrégats,
                       cohérent avec le pattern déjà observé pour
                       l'annuaire ONEFOP/MINEFOP équivalent, Source D de
                       MINEFOP-A.1)
EXTRACTION POSSIBLE:   NON ce sprint — À RETENTER avec un outil
                       d'extraction PDF texte natif (`pdftotext`/poppler)
                       dans un futur sprint technique. Ne pas confondre
                       "non extrait par manque d'outil" avec "source
                       inexistante" — la distinction est documentée ici
                       explicitement pour ne pas ressaisir la même
                       recherche inutilement.
PII:                   Improbable (document statistique agrégé), non
                       vérifié directement
STATUS:                ACCESSIBLE (HTTP 200), techniquement non lu ce
                       sprint
```

## Source E — DAMVN (Direction des Affaires Maritimes et des Voies Navigables) — cadre légal / autorité

```
SOURCE:                Page organigramme MINT — direction DAMVN
AUTHORITY:             MINT
TIER:                  2/3 (existence confirmée par résultat de recherche
                       pointant vers une page d'organigramme officielle,
                       contenu détaillé non lu directement ce sprint)
COVERAGE:              Confirme que la DAMVN est responsable de la
                       politique transport maritime/fluvial/lacustre, de
                       la réglementation du secteur maritime, et de
                       l'étude des dossiers d'agrément des sociétés
                       opérant dans le secteur maritime
ENTITY TYPE:           Autorité (direction ministérielle), pas un
                       établissement
IDENTIFIER:            N/A
EXTRACTION POSSIBLE:   NON — page d'organigramme, pas un registre
NOTES:                 Nom de direction directement réutilisable comme
                       `authority`/service émetteur si un futur registre
                       maritime est modélisé. Confirme le CHEVAUCHEMENT
                       DE COMPÉTENCE avec l'IMO (Organisation Maritime
                       Internationale) pour la certification STCW des
                       gens de mer — un rapport IMO trouvé séparément
                       confirme qu'un audit de mise en œuvre de la
                       convention STCW 1978 a eu lieu au Cameroun,
                       identifiant des lacunes/besoins d'assistance
                       technique pour la délivrance de certificats et
                       diplômes maritimes — signal que le dispositif
                       national de certification maritime n'est
                       peut-être pas encore pleinement mature/documenté
                       publiquement.
```

## Source F — Écoles de formation maritime nommées (EMIPAC et autres) — DISCOVERY, non corroboré officiellement

```
INSTITUTIONS REPÉRÉES (par recherche, jamais un registre officiel) :
  - École Maritime Industrielle et Portuaire de l'Afrique Centrale
    (EMIPAC), Douala — école privée, délivre des formations/diplômes en
    marine marchande, plusieurs filières citées (maritimafrica.com,
    site propre camariners.com apparenté au même écosystème)
  - Centre d'Instruction Maritime et Portuaire — cité comme conforme aux
    standards de formation OMI (Organisation Maritime Internationale)
  - Centre de formation professionnelle maritime "Le Paquebot", Douala —
    concours d'entrée annuel mentionné (candidats camerounais/étrangers,
    17-42 ans)
  - Filière maritime et portuaire à ISETAG (Douala) — IPES déjà
    potentiellement dans le périmètre MINESUP (chevauchement possible,
    non vérifié ce sprint — aucune correspondance nominative trouvée dans
    les données MINESUP déjà collectées par Écoles237, voir §9 du
    contrat)
TIER:                  3 / DISCOVERY ONLY pour toutes — aucune de ces
                       institutions n'a été trouvée sur une page/liste
                       émise directement par le MINT ou la DAMVN ce
                       sprint. Existence réelle probable (plusieurs
                       sources indépendantes convergentes pour EMIPAC),
                       mais AUCUNE preuve d'agrément officiel MINT/DAMVN
                       localisée — ne pas confondre "existe et opère"
                       avec "figure sur un registre officiel"
IDENTIFIER:            Aucun numéro d'agrément trouvé pour aucune de ces
                       institutions
PII:                   Aucune donnée personnelle collectée (noms
                       d'institutions et de villes uniquement)
EXTRACTION POSSIBLE:   NON — discovery only, aucune tentative de
                       collecte structurée
```

## Source G — Cameroon Civil Aviation Authority (CCAA) — cadre légal / autorité, chevauchement de tutelle

```
SOURCE:                Site officiel CCAA (ccaa.aero) + profil ICAO iGAT
AUTHORITY:             CCAA — établissement public sous tutelle technique
                       du MINT (autorité de l'aviation civile, distincte
                       administrativement du ministère mais rattachée à
                       son secteur)
TIER:                  2 (site officiel d'une autorité publique
                       apparentée, pas le ministère lui-même)
COVERAGE:              Aucune page listant des organismes de formation
                       aéronautique APPROUVÉS (ATO tiers) localisée ce
                       sprint — le site met en avant la propre école de
                       formation de la CCAA :
                       - "École de Formation (EFO)" — Yaoundé, ouverte au
                         public depuis mars 2016, y compris formations
                         ICAO (formateurs, concepteurs de cours)
                       - Un centre de formation CCAA à Douala également
                         mentionné
ENTITY TYPE:           EFO = institution publique de formation rattachée
                       à un régulateur (CCAA), pas une école privée
                       indépendante — classification proposée : TRAINING_
                       ESTABLISHMENT si elle admet des inscriptions
                       ouvertes au public au-delà du seul personnel CCAA
                       (à confirmer), sinon ADMINISTRATIVE_SERVICE/
                       organe de formation interne d'un régulateur —
                       AMBIGU, non tranché ce sprint faute de détail
                       suffisant sur l'admission
IDENTIFIER:            N/A trouvé
EXTRACTION POSSIBLE:   NON
PII:                   Aucune
NOTES:                 Confirme le chevauchement de tutelle attendu par
                       le brief (§6) : la CCAA, pas directement le MINT,
                       est l'interlocuteur technique le plus probable
                       pour toute future collecte aviation. Aucune preuve
                       trouvée d'un registre camerounais d'organismes de
                       formation aéronautique agréés distinct de la CCAA
                       elle-même — à réévaluer si CAFAC (Commission
                       Africaine de l'Aviation Civile, partenaire cité
                       par la page Wikipédia du ministère) publie un
                       registre régional incluant le Cameroun.
```

## Source H — CAM-TVET / traininginformation.cm — PISTE PROMETTEUSE, NON EXPLOITÉE (limite technique)

```
SOURCE:                CAM-TVET — "plateforme numérique sur les
                       opportunités de formation technique et
                       professionnelle au Cameroun"
URL:                   https://traininginformation.cm/home/eftp
                       (paramètre observé : `?tutelleSigle=MINEFOP` dans
                       un résultat de recherche indexé, suggérant un
                       filtre par ministère de tutelle)
AUTHORITY:             TIER 1/2 potentiel — plateforme à vérifier (nom de
                       domaine institutionnel plausible, non confirmé
                       comme émanation directe d'un ministère précis ce
                       sprint)
TIER:                  Non déterminé — POTENTIEL FORT mais NON VÉRIFIÉ
COVERAGE:              Inconnue — la plateforme est une application web
                       dynamique (rendu JavaScript côté client) ; les
                       outils disponibles ce sprint (`WebFetch`) ne
                       peuvent récupérer que la coquille HTML statique
                       (titre + référence de logo), aucun contenu
                       listant des établissements n'a pu être observé
ENTITY TYPE:           Inconnu — si le filtre `tutelleSigle` accepte une
                       valeur transport (MINT/MINTRANSPORT, non confirmé
                       existant), ce serait potentiellement une source
                       structurée par ministère de tutelle couvrant
                       plusieurs filières professionnelles, y compris
                       transport
IDENTIFIER:            Inconnu
EXTRACTION POSSIBLE:   NON ce sprint — nécessiterait soit un rendu
                       JavaScript (navigateur headless), soit la
                       découverte d'une API JSON sous-jacente (non
                       recherchée ce sprint, hors périmètre d'un audit
                       documentaire read-only). PISTE À REPRENDRE dans un
                       futur sprint technique, pour TOUT ministère (pas
                       seulement Transport) — potentiellement pertinente
                       aussi pour MINEFOP.
PII:                   Non évalué (contenu non atteint)
STATUS:                Accessible en tant que coquille HTML, contenu réel
                       non observé
```

## Domaines à écarter explicitement

```
mintransports.net    → domaine squatté (contenu de paris en ligne),
                      jamais une source officielle malgré une ancienne
                      indexation de recherche pointant vers ce domaine —
                      voir §0.
ct2015.cameroon-tribune.cm → sous-domaine d'archive, DNS non résolvable
                      ce sprint (échec ENOTFOUND) — contenu de l'article
                      "166 auto-écoles agréées" connu uniquement par
                      extrait de recherche, jamais lu en version
                      primaire.
```

## Sources DISCOVERY ONLY consultées sans approfondissement

```
kamerpower.com, osidimbea.cm, x.com/camertrans, tresorpublic.cm,
africannuaire.com, road-safety-charter.ec.europa.eu (page profil
individuel d'une auto-école, hors périmètre — plateforme européenne),
france-education-international.fr/enic-naric-bdd (fiche pays générique,
non approfondie).
```

## Résumé des sources

| Source | Tier | Accessible ce sprint | Nominatif | Identifiant officiel | Utilisable comme registre |
|---|---|---|---|---|---|
| A — mintransports.cm (portail) | 1 | Partiel (pages oui, liste auto-écoles non localisée) | Non confirmé | Non confirmé | NON ce sprint |
| B — Arrêté N°00406/A/MINT/DTT (2000) | 1 (texte) | Non (citation croisée seulement) | N/A (texte réglementaire) | Confirme le principe, pas le format | NON — cadre légal seulement |
| C — Presse (plusieurs articles) | 3 / Discovery | Oui (lecture) | NON | NON | NON — agrégats contradictoires |
| D — TRANSTAT MINT 2025 | 1 | Oui (HTTP 200), non lu (échec technique) | Probablement NON (agrégat) | Inconnu | NON ce sprint — à retenter avec pdftotext |
| E — DAMVN (organigramme) | 2/3 | Partiel | N/A | N/A | NON — autorité, pas registre |
| F — Écoles maritimes nommées (EMIPAC, etc.) | 3 / Discovery | Oui (sites tiers) | Oui (noms), non corroboré officiellement | NON | NON |
| G — CCAA (aviation) | 2 | Oui | N/A | NON | NON |
| H — CAM-TVET / traininginformation.cm | Non déterminé | Coquille seulement (JS) | Inconnu | Inconnu | NON ce sprint — limite technique, piste à reprendre |

**Constat global** : aucune source NOMINATIVE officielle, structurée et
directement exploitable n'a été confirmée accessible avec les outils de
ce sprint. Le ministère (MINT) et ses directions (DTT pour les
auto-écoles, DAMVN pour le maritime) sont clairement identifiés et
actifs, le cadre légal existe et est citable, mais la LISTE elle-même
(ou son format d'identifiant réel) n'a pas pu être atteinte — soit par
lien mort (Source A), soit par limite technique d'extraction PDF/JS
(Sources D et H). Voir `TRANSPORT_IMPORT_CONTRACT.md` §20 pour la
recommandation de pilote (aucun ce sprint) et §23 pour la décision
finale.

---

## TRANSPORT-A.1 — Addendum (2026-08-21, même opérateur, sprint READ-ONLY distinct)

Reprise de la recherche avec (1) un outil d'extraction PDF texte natif
désormais disponible et (2) une recherche élargie sur 8 familles de
sources. AUCUNE écriture staging/promotion/pilote. Voir
`reports/registry/transport-a1-source-search.json` pour le détail
complet et `reports/registry/transport-a1-run-summary.json` pour la
synthèse chiffrée.

### Outillage PDF — RÉCUPÉRÉ

`pdftotext` (poppler 4.00) est en réalité déjà disponible nativement
via l'installation Git for Windows (`C:\Program Files\Git\mingw64\bin\
pdftotext.exe`) — contrairement à la conclusion de TRANSPORT-A
("poppler absent de l'environnement"). `pdfjs-dist` est également déjà
présent dans `scripts/school-registry/node_modules`. Deux des PDF
identifiés en TRANSPORT-A ont été relus avec succès (extraction
déterministe, `pdftotext -layout`, JAMAIS un résumé IA) :

- **TRANSTAT MINT 2025** (118 pages, SHA256
  `dc608374b54f8631a283dcedf3e58f7f679c196c77bf89ec8602b588f8b1f977`) :
  confirme que le "Graphique 14 : Auto-écoles nouvellement créées par
  sexe, 2018-2022" est un **AGRÉGAT STATISTIQUE PUR** ("en moyenne,
  environ 50 nouvelles auto-écoles sont créées chaque année") — AUCUN
  nom d'établissement, AUCUN identifiant, ZÉRO occurrence de "DTT"
  dans tout le document. Source des données citée pour ce graphique :
  **"DTR"**, pas "DTT" — divergence d'acronyme non résolue (DTT =
  Direction des Transports Terrestres selon l'Arrêté 2000 ; DTR
  pourrait être une renomination "Direction des Transports Routiers"
  ou une direction distincte — à clarifier dans un futur sprint, ne
  pas supposer). Excerpt brut conservé dans
  `data/registry/raw/transport-a1/transtat-mint-2025-autoecoles-excerpt.txt`.
- **decret-n-2023-434-du-04-10-2023.pdf** : hors périmètre transport —
  concerne l'organisation des Écoles Normales d'Instituteurs
  (MINESEC), document mal classé ou hébergé pour une raison non
  déterminée sous le dossier PDF du MINT.

Le dossier `/images/Permis/<date>/<région>/<ville>.pdf` (résultats
probables d'examen du permis) n'a délibérément PAS été testé même avec
l'outil désormais disponible — risque PII (candidats nommés) non
évalué, politique inchangée depuis TRANSPORT-A/MINEFOP-A.1.

### Lien mort — DÉFINITIVEMENT NON RÉCUPÉRABLE

Vérification via l'API Wayback Machine (`archive.org/wayback/
available`, hôte `archive.org` — `web.archive.org` lui-même est
inaccessible aux outils de ce sprint) : **AUCUN snapshot archivé**
n'existe ni pour l'URL exacte
(`mintransports.net/en/liste-des-auto-ecoles-appelees-a-regulariser-
leur-situation/`) ni pour le domaine racine `mintransports.net`. Aucune
page équivalente trouvée sur `mintransports.cm`. Conclusion upgradée
depuis TRANSPORT-A : ce n'est plus "non tenté", c'est **confirmé
irrécupérable** par toute méthode légitime disponible ce sprint.

### CAM-TVET — DÉFINITIVEMENT HORS PÉRIMÈTRE TRANSPORT

Investigation complète : la plateforme CAM-TVET
(traininginformation.cm) est opérée par **PADESCE**, qui déclare
explicitement les tutelles couvertes : *"Ces différentes offres de
formation sont dispensées par des structures sous tutelles du
MINEFOP, du MINESEC, du MINADER, du MINEPIA, du MINPROFF et du
MINJEC"* — **le MINT est absent de cette liste**. Un sous-domaine
`cncq-cameroun.traininginformation.cm` expose une structure PHP
(`carto_certification_detail_view.php?id=N`) mais concerne des fiches
de certification MINESEC (vérifié : CAP "Producteur de Volaille",
sans rapport transport). Conclusion : NON APPLICABLE, pas seulement
"techniquement bloqué" comme conclu en TRANSPORT-A — même avec un
accès JavaScript complet, cette plateforme ne couvrirait pas le
secteur transport par construction.

### Nouveaux sous-domaines MINT identifiés

`ssdtmint.cm` (services dématérialisés, confirmé actif — inclut
"autorisation auto-école" comme catégorie de document mais AUCUNE
fonction de recherche/liste publique), `badge.mintransports.cm`,
`cloud.mintransports.cm` (Nextcloud, lien "résultats d'examen" repéré
mais NON ouvert — risque PII), `concours.mintransports.cm`,
`mail.mintransports.cm` (sert aussi des PDF institutionnels).

### Auto-écoles — 10 noms réels trouvés (Tier 3, jamais gouvernemental)

Recherche élargie sur les 8 familles de sources du brief §7 — toutes
épuisées sans trouver de liste OFFICIELLE. En revanche, un annuaire
privé (`africannuaire.com`, éditeur SPHM Editions) et deux sites
individuels d'auto-écoles ont livré **10 noms réels** (AUTO ECOLE
ASTRALE/FRANCAISE/GERMANIA/LEO/TRECY/TURBO/TURBO NKOMKANA à Yaoundé et
Douala, AUTO ECOLE MONTHE, AUTO ECOLE "Apprendre & Aimer la
Conduite"), couvrant seulement 2 des 10 régions (Centre, Littoral).
AUCUN identifiant d'agrément trouvé pour aucune d'entre elles. Détail
complet avec provenance :
`reports/registry/transport-a1-autoecoles-sources.csv` et
`data/registry/normalized/transport-a1/discovery-institutions.json`.

**Garde-fou méthodologique important** : un premier résumé WebSearch
avait affirmé l'existence d'un identifiant
"Decision N° 000083/D/MINT/SG/DTR/SDPSR/SFCAM DU 05 MARS 2019" —
vérification directe de l'article source (237online.com) : ce numéro
**n'apparaît nulle part** dans le texte réel. Fabrication de la couche
de synthèse, REJETÉE et non utilisée. Documenté dans
`reports/registry/transport-a1-identifier-sample.csv` comme exemple de
vigilance requise.

### Maritime — 4 institutions Tier 3 + 2 signaux MINESUP (spécialité, pas institut dédié)

EMIPAC, IT2MIP (revendique une tutelle MINEFOP sur son propre site,
non corroborée), Centre "Le Paquebot", Centre d'Instruction Maritime
et Portuaire — toutes Tier 3, aucune corroboration MINT/DAMVN
officielle. Par ailleurs, deux IPES déjà présents dans les données
MINESUP collectées (`data/registry/raw/minesup-national-v1/
detail-139.html` = IUEs, `detail-080.html` = IUTESSA) proposent
"Technologies de la marine marchande" comme **une spécialité parmi
plusieurs** au sein d'une filière Génie mécanique et productique — ce
N'EST PAS un institut maritime dédié, à ne jamais confondre avec les 4
institutions ci-dessus. Ni IUEs ni IUTESSA ne sont actuellement promus
en `establishments` (vérifié live, 0 résultat). Détail :
`reports/registry/transport-a1-maritime-sources.csv`.

### Aviation — CCAA ne publie aucune liste ATO nominative

Page directe `ccaa.aero/.../organisme-de-formation` testée : HTTP 404.
Aucune liste d'organismes de formation aéronautique agréés publiée
publiquement. Deux institutions réelles documentées : **EFO**
(école propre du régulateur CCAA, Yaoundé + centre Douala — statut
admission public/interne toujours non tranché) et **IRDSM Aviation**
(organisme privé, Yaoundé + Douala, conformité CCAA auto-déclarée sur
son propre site, non confirmée sur une liste officielle). Détail :
`reports/registry/transport-a1-aviation-sources.csv`.

### Échantillon de matching exécuté (§12 du brief, ≥10 institutions réelles trouvées)

`scripts/school-registry/transport-a1-matching-sample.ts` — 10
candidats (5 auto-écoles / 2 maritime / 2 aviation / 1
transport-logistique) testés en lecture seule contre les 2248
établissements live. Résultat : `STRONG_MATCH`=1, `PROBABLE_MATCH`=4,
`AMBIGUOUS`=3, `NO_MATCH`=2, **`safeForAutoLink`=0 partout** (aucune
fusion automatique). Finding notable : **AUTO ECOLE LEO** (Yaoundé)
produit un `STRONG_MATCH` (100% chevauchement) contre la fiche seed
"Auto-École La Route Sûre" (Yaoundé) — signal de faux-positif potentiel
car le token "auto" n'est PAS dans `FUZZY_STOPWORDS` du moteur de
matching partagé (seul "école" l'est). Confirme concrètement le risque
déjà anticipé au §12 de `TRANSPORT_IMPORT_CONTRACT.md`. Moteur NON
modifié ce sprint (read-only) — recommandation à traiter avant tout
futur pilote réel. Rapport complet :
`reports/registry/transport-a1-matching-sample.csv`.

### Conclusion TRANSPORT-A.1

Malgré un outillage PDF récupéré et une recherche sensiblement plus
large que TRANSPORT-A, **aucune source gouvernementale nominative
n'a été trouvée**. Les gains de ce sprint sont : (1) la confirmation
DÉFINITIVE (pas juste probable) que TRANSTAT MINT 2025 est un agrégat
pur et que le lien mort est irrécupérable, (2) l'exclusion DÉFINITIVE
de CAM-TVET du périmètre transport, (3) 10 noms réels d'auto-écoles et
6 noms réels d'institutions maritime/aviation supplémentaires
(Tier 3), (4) une preuve concrète d'un risque de faux-positif dans le
moteur de matching partagé. DÉCISION : **C — sources discovery/agrégat
uniquement, TRANSPORT DEFERRED**. Voir
`reports/registry/transport-a1-run-summary.json` pour le détail
chiffré complet.

---

## TRANSPORT-A.1-T3 — Addendum (2026-08-21, sprint distinct : pipeline de découverte Tier 3)

Sprint distinct, même jour, opérateur jean-merlain, READ-ONLY vis-à-vis
de `establishments`/`establishment_import_staging`/
`establishment_registry_identifiers` (0 écriture réelle des trois
côtés, vérifié en direct au début ET à la fin du sprint — voir
`reports/registry/transport-tier3-summary.json`, section `database`).
Ne refait PAS la recherche de zéro : **structure et étend** les 17
institutions Tier 3 déjà trouvées en TRANSPORT-A.1 avec (1) un modèle
formel de sous-tiers T3-A/B/C/D, (2) une analyse d'indépendance des
sources, (3) un statut de corroboration multi-source, (4) un matching
live réel (moteur durci) et un contrôle inter-ministériel réel.

### Nouvelles sources vérifiées directement ce sprint (WebFetch, jamais un résumé IA compté comme extraction)

- **EMIPAC** obtient sa **première corroboration Tier 3 réelle et
  vérifiée** du programme Transport : `maritimafrica.com` (T3-C,
  article du 27-02-2020) ET `kamerpower.com` (T3-C, article concours)
  ont été récupérés directement, sont bien deux éditeurs distincts,
  sans texte partagé, avec une identité institutionnelle cohérente
  ("EMIPAC" / nom complet identique des deux côtés) et sans
  contradiction géographique (Douala confirmé par l'un, silencieux
  chez l'autre). Statut : `TIER3_CORROBORATED` — **reste
  human-review-only, jamais CLEAN_APPROVABLE** (règle absolue §0/§17
  du brief).
- **EFO (CCAA)** obtient une seconde source indépendante de niveau
  autorité : le catalogue de formation international de l'OACI/ICAO
  (`igat.icao.int`, "Legal Status: Governmental"), en plus du site
  propre de la CCAA déjà connu. Les deux sources sont au-dessus du
  Tier 3 (Tier 1/2) — étiqueté `ABOVE_TIER3_CORROBORATED` (label non
  standard, documenté explicitement plutôt que forcé dans le modèle du
  brief) plutôt que confondu avec une corroboration Tier 3 ordinaire.
  Ne résout PAS l'ambiguïté déjà connue sur l'ouverture au public de
  l'admission.
- **IT2MIP** : la page `kamerpower.com` déjà citée en TRANSPORT-A.1 a
  été relue directement ce sprint. **Second cas confirmé de
  fabrication par la couche de résumé IA d'un moteur de recherche** :
  un résumé WebSearch affirmait un numéro d'agrément
  "N°352/MINEFOP/SG/DFOP/SDGSF/SACD du 14-12-2022" — **absent du texte
  réel de la page** une fois celle-ci récupérée directement. REJETÉ,
  non utilisé. Précédent direct : le cas "Decision N° 000083/D/MINT/..."
  déjà attrapé en TRANSPORT-A.1. Deux occurrences confirmées du même
  mode de défaillance suffisent à établir une règle méthodologique
  permanente : **ne jamais persister un identifiant vu uniquement dans
  un résumé IA sans vérification directe de la page source**.
- **3 domaines "site propre" précédemment cités comme sources
  institutionnelles se révèlent morts** ce sprint (`emipac-cm.com`,
  `irdsm-aviation.com`, `groupe-dsm.net`) — confirmé par échec DNS
  direct, ET distingué d'une panne d'environnement générale en
  vérifiant que des domaines de contrôle (`kamerpower.com`,
  `africannuaire.com`) se chargent normalement dans la même session.
  Conséquence : le statut de corroboration d'IRDSM Aviation est
  **rétrogradé** en `T3_MULTI_SOURCE_WEAK` (au lieu d'un
  `TIER3_CORROBORATED` qui aurait semblé valide en se fiant seulement
  au rapport TRANSPORT-A.1 sans revérification).
- **Risque de collision de nom identifié** : "Le Paquebot" (centre de
  formation maritime, Douala) partage son nom avec un restaurant de
  fruits de mer bien connu et sans rapport à Douala — signalé
  explicitement comme un risque de désambiguïsation pour tout futur
  outillage de recherche automatisée, sans remettre en doute
  l'existence propre du centre de formation (page Facebook active
  distincte confirmée).

### Durcissement du moteur de matching — vocabulaire auto-école (§13-§14 du brief)

Root cause du faux-positif TRANSPORT-A.1 ("AUTO ECOLE LEO" vs
"Auto-École La Route Sûre", STRONG_MATCH à 100%) rejouée précisément :
une fois "ecole" retiré (déjà stopword) et "leo" éliminé par le filtre
de longueur (≤3 caractères), il ne restait plus qu'UN SEUL mot flou
côté candidat — "auto" — mécaniquement identique au problème
"sciences" déjà résolu en MINSANTE-G.2. Correctif appliqué (PAS un
stopword global aveugle, conformément à l'interdiction explicite du
brief) : `auto` et `autoecole` (forme collée) ajoutés à
`WEAK_GENERIC_TOKENS` dans `scripts/school-registry/lib/matching/engine.ts`
— réutilisation intégrale du mécanisme de pondération contextuelle
("distinctive overlap gate") déjà introduit pour "sciences", jamais
une nouvelle logique séparée. `conduite`/`permis`/`route` **non**
ajoutés, faute de faux positif réel observé sur le corpus disponible
(17 institutions) — décision documentée dans le commentaire de code,
pas seulement ici.

Résultat rejoué directement : `AUTO ECOLE LEO` vs `Auto-École La Route
Sûre` -> **NO_MATCH** après correctif (était STRONG_MATCH avant).
7 familles de tests A-G ajoutées
(`scripts/school-registry/lib/matching/__tests__/matching-transport-tier3.test.ts`),
**86/86 tests passent** au total (suite complète, aucune régression
MINSANTE/MINESUP) — voir `reports/registry/transport-tier3-summary.json`.

### Matching live réel (lecture seule, 2248 établissements)

Exécuté pour les 17 candidats via
`scripts/school-registry/transport-tier3-pipeline.ts` (clé anon,
lecture seule) : 0 `EXACT_IDENTIFIER`/`EXACT_IDENTITY`, 4
`PROBABLE_MATCH` (chevauchements réels mais faibles — ex. "AUTO ECOLE
FRANCAISE" vs "École Française de Douala – Pierre Loti" via le mot
distinctif partagé "française", pas un artefact du correctif
générique), 1 `AMBIGUOUS` (Fleet Management Academy, plusieurs cibles
à égalité), 12 `NO_MATCH`. **`safeForAutoLink`=false partout, 0 fusion
automatique.** Détail complet :
`reports/registry/transport-tier3-matching.csv`.

### Contrôle inter-ministériel (lecture seule, staging + live)

0 collision staging trouvée sur un filtre par mots-clés transport
large (auto/conduite/maritime/aviation/emipac/it2mip/paquebot/
fleet/irdsm + noms propres des 17 candidats). IT2MIP reste le seul cas
`AMBIGUOUS` (revendication MINEFOP auto-déclarée, non corroborée par
la source relue ce sprint). Fleet Management Academy confirmé `NEW`
du point de vue Transport (aucun établissement MINT/MINTRANSPORT à
dupliquer, 0 collision) tout en restant une institution MINEFOP par son
propre identifiant. Détail : `reports/registry/transport-tier3-cross-ministry-review.csv`.

### Dry-run staging (0 écriture réelle, classification uniquement)

`would_stage_total`=17 (dont `would_duplicate_review`=4,
`would_source_review`=13, `would_cross_ministry_review`=0 — voir la
note d'ordre de priorité des paniers dans
`reports/registry/transport-tier3-staging-dry-run.json`, IT2MIP compte
dans `would_duplicate_review` malgré son signal cross-ministère),
`would_out_of_scope`=0, `would_insert_clean_approvable`=0 (toujours 0,
règle absolue). **0 écriture staging réelle.**

### Décision TRANSPORT-A.1-T3

**A — TIER3_PIPELINE_VALIDATED.** Le pipeline de découverte/dry-run
fonctionne de bout en bout (extraction déterministe, snapshots SHA256,
classification T3-A/B/C/D, indépendance, corroboration, matching live
durci, contrôle inter-ministériel, dry-run staging, 0 PII, 0 écriture).
Un cas `TIER3_CORROBORATED` réel et vérifié existe désormais (EMIPAC).
**Ceci n'autorise PAS la promotion** — voir
`reports/registry/transport-tier3-summary.json` pour le détail
chiffré complet et `TRANSPORT_IMPORT_CONTRACT.md` §19 pour les
conditions d'un futur sprint `TRANSPORT-A.2-T3` de staging contrôlé.
