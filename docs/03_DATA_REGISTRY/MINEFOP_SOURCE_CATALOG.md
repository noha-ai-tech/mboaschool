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

---

# ALTERNATIVE SOURCE RECOVERY — MINEFOP-A.1

SPRINT MINEFOP-A.1, 2026-08-20. Opérateur : jean-merlain. READ-ONLY —
recherche de sources alternatives, aucun import, aucune écriture staging,
aucune promotion. Fait suite à MINEFOP-A (commit f30c3ea) qui a établi que
`minefop.cm` est inexploitable comme source structurée.

## 0. Retest minimal minefop.cm (§1 — ne pas répéter MINEFOP-A)

Un seul retest technique effectué (`fetch()` Node natif, sans contournement
TLS), un jour après MINEFOP-A :

```
https://www.minefop.cm/                          -> TLS error CERT_HAS_EXPIRED (identique à MINEFOP-A)
https://www.minefop.cm/fr/documentations/arretes -> échec réseau au niveau TLS avant même le routage HTTP
```

**Conclusion : situation strictement inchangée.** Pivot immédiat vers la
découverte de sources alternatives, conformément à la consigne du sprint.

## Source D — ONEFOP/MINEFOP — Annuaire Statistique de la Formation Professionnelle (édition 2020/2021) — MEILLEURE SOURCE ALTERNATIVE

```
SOURCE:              Annuaire Statistique de la Formation Professionnelle (ASFOP) — édition 2021 (couvre l'année de formation 2020/2021)
URL:                  https://ins-cameroun.cm/wp-content/uploads/2025/06/ANNUAIRE-STATISTIQUE-DE-LA-FOP-2020-2021-FINAL.pdf
PUBLISHER:            Observatoire National de l'Emploi et de la Formation Professionnelle (ONEFOP), Secrétariat Général du MINEFOP — publié/hébergé via l'Institut National de la Statistique (INS, ins-cameroun.cm), avec appui technique/financier UNESCO
AUTHORITY:            TIER 1 — document officiel MINEFOP (ONEFOP est un service statutaire du MINEFOP, créé par Arrêté n°007/PM du 13 février 2002), co-produit avec l'INS (institut statistique national), pas un tiers commercial
DATE:                 Édition 2021 (données année 2020-2021) ; fichier déposé sur ins-cameroun.cm en juin 2025 — série existe aussi pour 2016-2019 (ASFOP-FINAL-2016-a-2019-15FEV.pdf, même hébergeur) et 2019-2020 (orientation.cm, autre domaine institutionnel)
CURRENT/HISTORICAL:   Historique mais série continue et récente (dernière édition connue trouvée = 2020/2021 ; à vérifier si une édition plus récente existe lors d'un futur sprint)
TIER:                 1 (source primaire officielle — statistiques agrégées, PAS un registre nominatif)
FORMAT:               PDF texte natif (extractible, 70 pages, `pdftotext` fonctionne — contrairement au PDF scanné de la Source H)
COVERAGE:             NATIONALE, 10 régions, public ET privé
ENTITY TYPE:          CFP (Centre de Formation Professionnelle) au sens large — sous-types recensés : SAR/SM (Section Artisanale Rurale/Section Ménagère, public), CFPR/IVTC, CFPE/AVTC, CFM/TTC, INFFDP/NITTPD (institut national des formateurs), et privé Confessionnel/Laïc. AGRÉGATS SEULEMENT — aucune fiche nominative individuelle.
COUNT:                **1 761 CFP au total pour 2020-2021** (Tableau 22, p.25) — dont Public = 298 (1 CFPM + 5 CFPR + 3 CFPE + 1 INFFDP + 288 SAR/SM) et Privé = 1 463 (174 confessionnel + 1 289 laïc). Série historique (Tableau 1, p.10) : 1 591 (2016-17), 1 612 (2017-18), 1 321 (2018-19). Tableau 23 (p.25) précise en outre, POUR LE PRIVÉ SEULEMENT : 733 CFP privés avec agrément EN COURS DE VALIDITÉ vs 730 CFP privés NON agréés (total privé 1 463) — donnée directement comparable (en structure) au chiffre "730 en règle" de la Source B (2018), mais 2 ans plus récente et officielle plutôt que de presse. ATTENTION : ne pas confondre — le "730" de 2018 (Source B) désignait des centres "en règle" nationalement (public+privé non précisé), le "730" de 2020-2021 (Tableau 23, Source D) désigne des CFP PRIVÉS NON agréés — même valeur numérique, signification totalement différente, coïncidence pure.
IDENTIFIER:           AUCUN identifiant individuel dans ce document (agrégats uniquement) — voir Source G pour le format d'identifiant découvert séparément
REGIONS:               Répartition complète des 10 régions disponible pour le nombre de CFP (Tableau 22) et pour les effectifs apprenants/formateurs (Tableau 3) — Centre (691 CFP), Littoral (412), Ouest (158), Extrême-Nord (89), Adamaoua (66), Est (55), Nord (54), Nord-Ouest (95), Sud (72), Sud-Ouest (69)
PUBLIC/PRIVATE:        Distingué explicitement partout (voir COUNT ci-dessus)
EXTRACTION POSSIBLE:   NON pour des établissements individuels — le document est un annuaire STATISTIQUE (agrégats), pas un répertoire nominatif. Utilisable uniquement comme EXPECTED_COUNT / corroboration régionale.
COMPLETENESS:          Le document affirme explicitement (Avant-propos, p.8) : *"l'Observatoire National de l'Emploi et de la Formation Professionnelle (ONEFOP) procède tous les ans à un recensement EXHAUSTIF des structures de formation professionnelle relevant de la compétence du MINEFOP sur l'étendue du territoire national"* — c'est une déclaration d'exhaustivité methodologiquement crédible (collecte via délégations régionales/départementales, agents de collecte formés, questionnaire structuré incluant "identification des centres de formation") mais NON vérifiable indépendamment sans accès aux données sources individuelles.
PII:                   AUCUNE donnée personnelle trouvée dans le texte extrait (pas de colonnes nom/prénom/téléphone/CNI — uniquement des agrégats statistiques). SHA256 du PDF récupéré conservé ci-dessous pour traçabilité ; le fichier binaire lui-même N'A PAS été committé dans le dépôt (politique §21 — pas de snapshot brut inutile pour un document déjà public et volumineux).
STATUS:                ACCESSIBLE (HTTP 200 au moment du sprint), texte extractible
NOTES:                 Snapshot technique : SHA256=44494dcfef5afcd2a983b707892fc65daac4785a4835b81c25cada1e251f997d, content-type=application/pdf, taille=3 638 460 octets, retrieved_at=2026-08-20 (session UTC). Trois documents de la même famille repérés mais non dépouillés en détail ce sprint (hors périmètre, pas nécessaire pour la conclusion) : `ASFOP-FINAL-2016-a-2019-15FEV.pdf` et `RAPPORT-DANALYSE-FOP-2021-FINAL.pdf` (ins-cameroun.cm), et l'édition 2019/2020 sur un troisième domaine institutionnel (`orientation.cm`) — série statistique manifestement maintenue sur plusieurs années par la même autorité, republiée sur plusieurs domaines gouvernementaux/para-gouvernementaux, ce qui renforce sa crédibilité (pas un document isolé).
```

## Source E — Décret n°2005/123 du 15 avril 2005 (spm.gov.cm) — cadre légal

```
SOURCE:              Décret n°2005/123 du 15 avril 2005 portant organisation du MINEFOP
URL:                  https://www.spm.gov.cm/site/?q=fr/content/d%C3%A9cret-n%C2%B0-2005123-du-15-avril-2005-portant-organisation-du-minist%C3%A8re-de-lemploi-et-de-la
PUBLISHER:            Services du Premier Ministre (spm.gov.cm) — domaine gouvernemental officiel
AUTHORITY:            TIER 2 — texte réglementaire officiel, mais organisationnel (pas un registre)
DATE:                 15 avril 2005 (texte pouvant avoir été partiellement modifié depuis — non vérifié ce sprint)
TIER:                 2
FORMAT:               Page HTML
COVERAGE:             Structure organisationnelle nationale + régionale + départementale
ENTITY TYPE:          N/A — décrit les SERVICES du ministère, pas les établissements qu'il régule
COUNT:                N/A
IDENTIFIER:           N/A
REGIONS:              Confirme l'existence de Délégations Provinciales (régionales) ET Départementales de l'Emploi et de la Formation Professionnelle, chargées notamment de la transmission avec avis des demandes de création/ouverture/agrément des structures privées (Art. 58, 65)
PUBLIC/PRIVATE:       N/A
EXTRACTION POSSIBLE:  NON — aucune liste d'établissements
COMPLETENESS:         N/A
PII:                  Aucune
STATUS:               Accessible (HTML, HTTPS valide sur spm.gov.cm)
NOTES:                 Identifie le service précis responsable du répertoire : **"Service de Gestion des Centres, Instituts et Structures Spécialisées de Formation Professionnelle et d'Apprentissage"** (Art. 35 : "élaboration et actualisation du répertoire des filières de formation" — répertoire des FILIÈRES, pas explicitement des établissements) et la **"Sous-Direction de l'Insertion et des Agréments"** (Art. 30 : tient un fichier des entreprises de travail temporaire et offices privés de placement — périmètre différent des CFP). Confirme la chaîne d'autorité mais ne fournit aucune donnée exploitable directement. Un décret d'organisation plus récent existe potentiellement (non recherché ce sprint) — le MINEFOP a pu être réorganisé depuis 2005.
```

## Source F — Arrêté n°007/PM du 13 février 2002 (création ONEFOP, mirror ILO/NATLEX) — cadre légal

```
SOURCE:              Arrêté n°007/PM du 13 février 2002 portant création d'un observatoire national de l'emploi et de la formation professionnelle
URL:                  https://webapps.ilo.org/dyn/natlex/natlex4.detail?p_isn=60811&p_lang=fr
PUBLISHER:            Texte camerounais original (Services du Premier Ministre), mirroré par la base légale NATLEX de l'OIT/ILO
AUTHORITY:            TIER 2 pour le texte lui-même (légalement officiel), mais TIER 3 pour ce mirror précis (reproduction OIT, pas la publication primaire camerounaise directement consultée ce sprint)
DATE:                 13 février 2002
TIER:                 2/3 (texte Tier 2, canal d'accès Tier 3 — voir §12 chaîne de source)
FORMAT:               Page HTML (base de données juridique)
COVERAGE:             Établit l'autorité et le mandat d'ONEFOP, l'organisme derrière la Source D
ENTITY TYPE:          N/A
COUNT:                N/A
IDENTIFIER:           N/A
REGIONS:              N/A
PUBLIC/PRIVATE:       N/A
EXTRACTION POSSIBLE:  NON
COMPLETENESS:         N/A
PII:                  Aucune
STATUS:               Accessible
NOTES:                 Confirme qu'ONEFOP (auteur de la Source D) est un organe statutaire créé par texte réglementaire officiel, avec mission de "collecte, centralisation, analyse et diffusion" des informations emploi/formation — cohérent avec la déclaration d'exhaustivité de la Source D.
```

## Source G — Format d'identifiant d'agrément MINEFOP (IDENTIFIER_PATTERN_DISCOVERY, §10)

```
PATTERN OBSERVÉ:      N°<numéro>/MINEFOP/SG/DFOP/<sous-direction>/<date>
EXEMPLES CONFIRMÉS INDÉPENDAMMENT (sites propres de centres, pas un agrégateur unique) :
  - N°0115/MINEFOP/SG/DFOP/SDGSF/SACD du 11 août 2010 — Centre de Formation Professionnelle Spécialisé MIPROMALO (mipromalo.cm)
  - N°00357/MINEFOP/SG/DFOP/SDGSF/CSACD/CBAC du 28 juin 2024 — CEFOPROSA, Dschang (cefoprosa.org)
  - N°000487/MINEFOP/SG/DFOP/SDGSF/CSACD/CBAC du 17 octobre 2022 — cité par un centre tiers (Facebook)
  - N°137/MINEFOP/SG/DFOP/SDGF/SACD — CFP Kaylang, Douala (paramédical)
  - N°90000192/MINEFOP/SG/DFOP/SDECC/SOEC/BOEC — communiqué MINEFOP (sous-direction différente : SDECC/SOEC/BOEC, probablement liée aux entreprises de travail temporaire, cf. Sous-Direction de l'Insertion et des Agréments de la Source E)
AUTHORITY:             Format cohérent, réutilisé de façon autonome par des établissements indépendants sur leurs propres sites — signal fort de standardisation administrative réelle (pas une convention inventée par un agrégateur)
REGISTRY:              Implicite (DFOP = Direction de la Formation et de l'Orientation Professionnelles, confirmée comme auteur méthodologique de la Source D)
IDENTIFIER_TYPE:       Numéro d'arrêté d'agrément/d'ouverture (un par centre privé, délivré individuellement)
FORMAT:                Numérique (3 à 8 chiffres observés, formats non uniformes) + sigle de sous-direction + date complète
COVERAGE:              UNKNOWN — aucune liste centralisée de ces numéros n'a été trouvée ce sprint ; seulement des occurrences individuelles, chacune publiée par le centre concerné lui-même
UNIQUENESS:            Présumée unique par centre/décision (un arrêté = une décision datée), NON vérifiée sur volume
STABILITY:             Probablement stable dans le temps pour un centre donné (c'est un acte administratif daté), mais le STATUT d'agrément associé peut expirer (cf. Source D Tableau 23 : "CFP AGREE" vs "CFP NON AGREE" — un centre peut détenir un numéro d'arrêté historique mais ne plus être agréé actuellement)
RAW VALUE AVAILABLE:   Oui, sur 5 exemples individuels (voir ci-dessus), mais aucune liste consolidée
SAFE AS SECONDARY IDENTIFIER:  Le format est structurellement compatible avec `establishment_registry_identifiers` (`registry`='MINEFOP', `identifier_type`='AGREMENT_ORDER' proposé pour un futur sprint, `identifier`=numéro brut) — mais AUCUNE écriture, AUCUN nom de registre figé ce sprint (cohérent avec §14 du contrat existant).
```

## Source H — vitrineducameroun.com — liste "préselectionnés MINEFOP" (PDF scanné, non exploitable)

```
SOURCE:              "Liste des centres de formation préselectionnés du MINEFOP" (titre du fichier)
URL:                  https://vitrineducameroun.com/wp-content/uploads/2023/04/Liste-des-centres-de-formation-preselectionnes-du-MINEFOP-1.pdf
PUBLISHER:            vitrineducameroun.com — site tiers non officiel (pas un domaine gouvernemental), provenance de la republication inconnue
AUTHORITY:            DISCOVERY ONLY — aucune preuve que ce site soit une émanation MINEFOP ; le fichier est un SCAN (métadonnées : "Canon iR-ADV 6555", imprimante multifonction, 18 avril 2023) SANS COUCHE TEXTE (`pdftotext` retourne 0 ligne extraite)
DATE:                 Scan daté du 18 avril 2023 (métadonnées techniques) — nature du document sous-jacent (présélection pour QUEL programme précis ?) non déterminée, aucun contexte trouvé
TIER:                 DISCOVERY ONLY
FORMAT:               PDF image scannée, non-OCRisé
COVERAGE:             Inconnue — contenu illisible sans OCR
ENTITY TYPE:          Probablement PROGRAM (liste de "présélectionnés" suggère une candidature à un programme/bourse précis) plutôt qu'un registre général — UNKNOWN, non confirmé
COUNT:                Inconnu
IDENTIFIER:           Inconnu
REGIONS:              Inconnu
PUBLIC/PRIVATE:       Inconnu
EXTRACTION POSSIBLE:  NON — pas de texte extractible sans OCR, et provenance/autorité non établie même si elle l'était
COMPLETENESS:         N/A
PII:                  RISQUE ÉLEVÉ NON ÉVALUÉ — un document de "présélection" à un programme peut contenir des noms de candidats/promoteurs individuels. Conformément à §20-21, AUCUN OCR n'a été tenté sur ce fichier, AUCUNE tentative d'extraction. Le fichier binaire téléchargé pour classification technique existe uniquement dans un répertoire temporaire local hors dépôt (`tool-results` de session), jamais copié dans le dépôt git.
STATUS:               Techniquement accessible (HTTP 200) mais NON EXPLOITABLE (ni lisible, ni provenance fiable)
NOTES:                 Retenu uniquement pour mémoire (comme la Source C de MINEFOP-A) — pourrait un jour resservir de piste si sa provenance réelle est clarifiée, jamais comme source de vérité.
```

## Domaines à écarter explicitement (faux positifs par similarité de sigle/nom)

```
minfopra.gov.cm      → Ministère de la Fonction Publique et de la Réforme Administrative (MINFOPRA) — un AUTRE ministère, sigle très proche de MINEFOP mais SANS RAPPORT. Trouvé via une recherche "délégation régionale MINEFOP" qui a remonté par erreur des pages "Délégation Régionale" de minfopra.gov.cm (Centre, Littoral). NE JAMAIS confondre — aucune donnée collectée depuis ce domaine.
opendatacam.cm       → plateforme communautaire d'une ONG (Club des Jeunes Aveugles Réhabilités du Cameroun) sur les crises sanitaires — PAS un portail open-data gouvernemental. Aucune donnée MINEFOP.
minefop.gov.cm       → (déjà écarté en MINEFOP-A) domaine parqué/squatté, toujours à écarter.
```

## Sources DISCOVERY ONLY consultées sans approfondissement (§11, jamais une source de vérité)

```
goafricaonline.com, hubafrica.co, cfpcompassinstitute.com, africannuaire.com,
osidimbea.cm, egov.crisbyventures.org, concours-cameroun.com,
facebook.com/MINEFOPOFFICIEL, facebook.com/trowcameroun, cfp.trow.cm,
cismed-sante.com, ipmeformation.com, ovumo-minefopouest.org (programme de
vacances régional MINEFOP Ouest — "centres" listés probablement des lieux
d'accueil pour un programme jeunesse, PAS un registre CFP ; non confirmé
faute de contenu accessible, à ne jamais assumer comme TRAINING_ESTABLISHMENT
sans vérification).
```

## Tentative infructueuse

```
unevoc.unesco.org/wtdb/worldtvetdatabase_cmr_fr.pdf — profil pays UNESCO-UNEVOC
sur le système TVET camerounais, potentiellement pertinent comme source
internationale/partenaire (§7) — la récupération de ce sprint n'a renvoyé que
la page d'accueil générique d'UNESCO-UNEVOC, pas le contenu du profil pays
lui-même. Non résolu ce sprint, piste à reprendre si utile plus tard.
```

## Résumé des sources — MINEFOP-A.1

| Source | Tier | Accessible | Nature | Utilisable comme registre nominatif |
|---|---|---|---|---|
| D — Annuaire ONEFOP/MINEFOP 2020-2021 (ins-cameroun.cm) | 1 | Oui | Statistiques agrégées | NON — mais MEILLEUR expected_count trouvé |
| E — Décret 2005/123 (spm.gov.cm) | 2 | Oui | Cadre légal/organisationnel | NON |
| F — Arrêté 007/PM 2002 (mirror ILO) | 2/3 | Oui | Cadre légal (création ONEFOP) | NON |
| G — Pattern identifiant agrément | Discovery→confirmé structurel | Partiel (5 exemples) | Format d'identifiant | NON (pas de liste centralisée) |
| H — vitrineducameroun.com (scan) | Discovery Only | Oui mais illisible | PDF scanné sans OCR | NON |
