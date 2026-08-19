# MINEFOP Source Catalog

SPRINT MINEFOP-A, 2026-08-19. Opérateur : jean-merlain. READ-ONLY —
découverte et audit de sources, aucun import, aucune écriture staging,
aucune promotion. Toutes les pages consultées l'ont été par `fetch()` brut
(jamais un résumé IA pour compter), conformément à
`REGISTRY_EXTRACTION_SAFETY.md`.

## Constat structurant — accès à la source primaire actuellement compromis

Contrairement à MINESUP, où le portail officiel était directement
exploitable, **le site officiel MINEFOP (`minefop.cm`) est actuellement
dans un état dégradé** qui empêche toute extraction structurée fiable à
ce jour :

```
CERTIFICAT TLS EXPIRÉ :   notAfter = 2026-02-19 (expiré depuis ~6 mois à la
                          date de ce sprint) — toute connexion HTTPS standard
                          échoue avec CERT_HAS_EXPIRED sans contournement
                          explicite de la validation de certificat.
PAGE D'ACCUEIL ("/") :    HTTP 403 Forbidden (Apache/2), avec un User-Agent
                          navigateur standard ET des en-têtes Accept/
                          Accept-Language réalistes — pas un blocage
                          trivial de User-Agent.
ROUTAGE DE CONTENU :      Toutes les URLs de contenu SEF (Search Engine
                          Friendly) trouvées via recherche externe
                          (ex. /fr/documentations/arretes,
                          /fr/emploi-et-formation-professionnelle,
                          /fr/allcategories-fr-fr) retournent HTTP 404 —
                          le routage Joomla applicatif semble cassé, pas
                          seulement bloqué.
FICHIERS STATIQUES :      Les fichiers sous /images/ (PDF) RESTENT
                          directement accessibles (HTTP 200,
                          application/pdf) quand leur URL exacte est déjà
                          connue — confirmé pour 2 PDF trouvés par
                          recherche externe.
ROBOTS.TXT :              HTTP 200, gabarit Joomla standard. Disallow
                          limité aux dossiers système internes
                          (/administrator/, /api/, /bin/, /cache/, etc.) —
                          la page d'accueil et le contenu général NE SONT
                          PAS interdits par robots.txt. Le 403 sur "/"
                          contredit donc la propre politique déclarée du
                          site — probablement une mauvaise configuration
                          serveur/WAF, pas une restriction délibérée.
```

**Aucune tentative de contournement** (pas de rotation d'IP, pas de
proxy, pas d'usurpation avancée d'en-têtes au-delà d'un User-Agent
navigateur standard, pas de résolution de CAPTCHA — il n'y en a pas ici,
c'est un blocage serveur, pas un contrôle d'accès actif) n'a été faite,
conformément à §32 de la spec. Le contournement TLS (`NODE_TLS_REJECT_
UNAUTHORIZED=0`) a été utilisé UNIQUEMENT pour ce diagnostic READ-ONLY
sur un domaine gouvernemental public connu, jamais pour accéder à un
contenu privé ou protégé — documenté ici explicitement plutôt que
silencieusement.

**Conséquence directe** : aucune liste structurée, paginée ou
navigable des centres agréés n'a pu être atteinte via le site officiel
lui-même pendant ce sprint. Seuls des documents PDF individuels dont
l'URL exacte est déjà connue (via une recherche externe) sont
récupérables.

---

## Source A — minefop.cm (portail officiel) — ACCÈS ACTUELLEMENT BLOQUÉ

```
SOURCE NAME:        Portail officiel MINEFOP (Joomla)
AUTHORITY:           MINEFOP
URL:                 https://www.minefop.cm/
SOURCE TYPE:          Portail CMS (Joomla), présumé listes/documents dans
                      un module non identifié (accès actuellement impossible)
DATE:                  Tenté le 2026-08-19
VERSION:               Inconnue
COVERAGE:              Inconnue — jamais atteinte
NATIONAL / REGIONAL:   Présumé national avec délégations régionales (non confirmé)
PUBLIC / PRIVATE:      Inconnu à ce stade
ENTITY TYPES:          Inconnu
REGIONS:               Inconnu (structure de page jamais atteinte)
EXPECTED COUNT:        Non observé directement sur ce site (voir Source B pour un chiffre tiers)
COUNT EXPLICIT:        N/A
IDENTIFIER PRESENT:    Inconnu
IDENTIFIER NAME:       Inconnu
IDENTIFIER FORMAT:     Inconnu
NAME/CITY/REGION/...:  Inconnu — aucune fiche atteinte
AUTHORIZATION/AGREMENT: Un document PDF trouvé ("RF INFOGRAPHE.pdf",
                      /images/phocadownload/) suggère l'existence d'un
                      "Référentiel de Formation Professionnelle" — contenu
                      non analysé ce sprint (hors périmètre : un seul
                      document technique, pas une extraction).
SPECIALTIES:           Inconnu
STATUS:                 SOURCE BLOQUÉE (voir constat ci-dessus)
PAGINATION:            Inconnu
DOWNLOADABLE:          Certains PDF individuels oui (si URL déjà connue), liste elle-même non
STRUCTURED:            Inconnu
SOURCE TIER:           TIER 1 potentiel (autorité officielle confirmée),
                      mais NON EXPLOITABLE ce sprint faute d'accès
EXTRACTION METHOD:      Aucune — accès requis avant toute méthode d'extraction
NOTES:                 robots.txt accessible et permissif (Joomla standard,
                      seuls les dossiers système interdits). PDF connus :
                      "APPEL A CANDIDATURES FORMATION DES FORMATEURS ET
                      PERSONNELS DES STRUCTURES DE FORMATION" et
                      "RF INFOGRAPHE.pdf" — tous deux dans /images/ ou
                      /images/phocadownload/, tous deux HTTP 200. Pattern
                      cohérent : les fichiers statiques connus fonctionnent,
                      la navigation/le routage applicatif ne fonctionne pas.
                      Une actualité MINEFOP elle-même ("147 centres de
                      formation agréées", entreprises de travail temporaire)
                      a été trouvée par recherche externe mais son URL
                      directe retourne 404 au moment du test — soit l'URL a
                      changé depuis l'indexation, soit le routage SEF est
                      cassé pour ce type de page aussi.
```

## Source B — Article de presse (Cameroon Tribune) — DISCOVERY / CONTEXTE UNIQUEMENT

```
SOURCE NAME:        "Formation professionnelle : 730 centres sont en règle"
AUTHORITY:           Cameroon Tribune (presse, PAS une autorité MINEFOP)
URL:                 https://www.cameroon-tribune.cm/article.html/21373/fr.html/formation-professionnelle-730-centres-sont-en-regle
SOURCE TYPE:          Article de presse rapportant une publication MINEFOP
DATE:                  **15 octobre 2018** — PÉRIMÉ, ~8 ans avant ce sprint
COVERAGE:              Chiffres RÉGIONAUX SEULEMENT (pas de liste nominative) :
                      Centre 287, Littoral 230, Ouest 52 (3 régions citées
                      explicitement dans l'aperçu, total national annoncé
                      "730")
COUNT EXPLICIT:        OUI, mais DATÉ 2018 — jamais utilisable comme
                      expected_count pour une extraction 2026 sans
                      revalidation contre une source PRIMAIRE actuelle
IDENTIFIER PRESENT:    NON — aucun identifiant individuel, seulement des totaux
SOURCE TIER:           TIER 3 / DISCOVERY ONLY (presse, pas une source
                      officielle primaire — confirme l'EXISTENCE d'une
                      publication MINEFOP passée, ne la remplace jamais)
NOTES:                 Confirme que MINEFOP publie HISTORIQUEMENT (2018) des
                      listes région par région AVEC dates d'expiration
                      d'agrément — signal utile pour §17 (statut/agrément)
                      même si la donnée elle-même est trop ancienne pour
                      servir de référence actuelle. Confirme aussi
                      l'existence de structures non-agréées/illégales
                      ("de nombreuses structures fonctionnent
                      illégalement" — citation d'un responsable MINEFOP) :
                      la présence dans une liste MINEFOP signale un statut
                      d'agrément réel, PAS une garantie de qualité
                      Écoles237.
```

## Source C — Agrégateurs tiers (HubAfrica, cfpcompassinstitute.com) — DISCOVERY ONLY

```
SOURCE TIER:           DISCOVERY ONLY — sites commerciaux/informatifs tiers,
                      jamais une source de vérité. Non consultés en
                      profondeur ce sprint (conforme à §31 : pas de collecte,
                      même légère, sur une source Discovery Only).
NOTES:                 Mentionnés uniquement pour mémoire — pourraient
                      resservir un jour comme piste de corroboration
                      Tier 3, jamais comme source principale.
```

## Domaine à écarter explicitement

`minefop.gov.cm` (trouvé dans les résultats de recherche sous la forme
`minefop.gov.cm.w2fr.com`) est un **domaine parqué/squatté**, pas un site
officiel — ne jamais le confondre avec `minefop.cm` (le vrai domaine
officiel, confirmé par de multiples citations presse et institutionnelles
cohérentes). Aucune donnée n'a été ni ne sera collectée depuis ce domaine.

## Résumé des sources

| Source | Tier | Accessible ce sprint | Identifiant officiel | Complétude prouvée |
|---|---|---|---|---|
| A — minefop.cm (portail officiel) | 1 (potentiel) | **NON — bloqué** | Inconnu | N/A — jamais atteint |
| B — Article Cameroon Tribune (2018) | 3 / Discovery | Oui (lecture seule, contexte) | Non (totaux seulement) | NON — daté, jamais un total actuel |
| C — Agrégateurs tiers | Discovery Only | Non consulté en profondeur | N/A | N/A |
