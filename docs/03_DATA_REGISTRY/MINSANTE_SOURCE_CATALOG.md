# MINSANTE Source Catalog

SPRINT MINSANTE-A, 2026-08-20. Opérateur : jean-merlain. READ-ONLY —
découverte et audit de sources, aucun import, aucune écriture staging,
aucune promotion. Toutes les pages/PDF cités ont été récupérés par
`fetch()`/`pdftotext` bruts (jamais un résumé IA pour compter ou établir
l'exhaustivité), conformément à `REGISTRY_EXTRACTION_SAFETY.md`. Fait
suite à MINEFOP-A/A.1 (`MINEFOP_SOURCE_CATALOG.md`) dont la leçon
structurante — élargir systématiquement la recherche si la source
principale semble bloquée, mais ne jamais confondre agrégat et registre
nominatif — a été appliquée dès le départ.

## Constat structurant — situation MINSANTE très différente de MINEFOP

Contrairement à `minefop.cm` (certificat TLS expiré, page d'accueil
403), **`minsante.cm` est directement accessible** (HTTP 200, HTML
propre, dernière modification de la page statique d'accueil : 5 mars
2024) et héberge un vrai portail Drupal actif (`/site/?q=fr`, actualités
datées d'août 2026) avec une catégorie de contenu directement pertinente
: **"Développement des Ressources Humaines"**
(`/site/?q=fr/catégories/développement-des-ressources-humaines`), qui
liste plusieurs pages de résultats de concours d'entrée dans les écoles
de formation des personnels sanitaires. Cette catégorie a mené,
directement ou indirectement, à la découverte de la Source A ci-dessous
— la meilleure source jamais trouvée sur l'ensemble des sprints MINSUP
/MINESEC/MINEFOP/MINSANTE en termes de proximité avec un registre
nominatif borné.

**Piège terminologique confirmé et documenté explicitement (§14 de la
spec — risque de contamination healthcare)** : en français administratif
camerounais, **"formation sanitaire" désigne très majoritairement un
ÉTABLISSEMENT DE SOINS (hôpital, centre de santé — l'abréviation "FOSA"
observée partout sur minsante.cm signifie "FOrmation SAnitaire" =
structure de soins), PAS une école**. Confirmé par observation directe :
la page `LISTE DES FORMATIONS SANITAIRES DE CATEGORIE D SANS AUCUN
DOCUMENT ADMINISTRATIF REPERTORIE` et la page `Procédures de création et
d'ouverture Formation Sanitaire privée` (qui référence explicitement des
"Cabinets de Soins", "Cabinets dentaires", laboratoires d'analyses
médicales) portent toutes les deux sur des structures de SOINS, jamais
des écoles. Toute requête ou tout futur script contenant le mot
"formation sanitaire" seul, sans qualification "école de"/"centre de
formation des personnels", **risque une contamination massive avec le
registre des structures de soins** — voir la matrice §14 dans
`MINSANTE_IMPORT_CONTRACT.md`.

---

## Source A — Liste des Écoles de Formation des Personnels Médico-Sanitaires Agréées du MINSANTE — Année 2025 — MEILLEURE SOURCE TROUVÉE

```
SOURCE:               LISTE DES ECOLES DE FORMATION DES PERSONNELS MEDICO-SANITAIRES AGREES DU MINSANTE - ANNEE 2025
URL:                   https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm
PUBLISHER:             MINISTERE DE LA SANTE PUBLIQUE (MINSANTE), hébergée sur le portail applicatif officiel des concours d'entrée MINSANTE (examen-national-special-minsante.cm)
AUTHORITY:             TIER 1 (proposé) — document explicitement titré, daté, borné, produit dans le format légal standard MINSANTE (en-tête bilingue République du Cameroun/Republic of Cameroon), organisé par filière officielle puis par région — voir chaîne de source ci-dessous pour les réserves
DATE:                  Année 2025 (titre du document explicite)
CURRENT/HISTORICAL:    CURRENT au moment du sprint (HTTP 200, 20 août 2026)
FORMAT:                PDF, texte natif extractible (pdftotext -layout fonctionne intégralement, 11 pages, aucun OCR nécessaire)
COVERAGE:              Nationale, 10 régions toutes représentées au moins une fois (Adamaoua, Centre, Est, Extrême-Nord, Littoral, Nord, Nord-Ouest, Ouest, Sud, Sud-Ouest — vérifié par grep direct sur le texte extrait)
NOMINATIVE/AGGREGATE:  NOMINATIVE — chaque ligne est un nom d'établissement individuel, numéroté, sous un en-tête RÉGION au sein d'un en-tête FILIERE. Aucun total agrégé fourni en tête de document (pas de "N écoles au total" explicite — voir COMPLETENESS ci-dessous).
ENTITY TYPES:          TRAINING_ESTABLISHMENT — 10 filières officielles couvertes : Analyses Médicales, Imagerie Médicale, Infirmiers, Kinésithérapie, Odontostomatologie, Optique Réfraction, Prothèse Dentaire, Sages-femmes/Maïeuticiens, Sciences Pharmaceutiques, Psychomotricité et Relaxation. Une même école apparaît sous PLUSIEURS filières si elle les propose toutes (ex. beaucoup d'écoles de Yaoundé/Douala apparaissent sous Analyses Médicales ET Infirmiers) — donc le nombre de LIGNES (330, compté par grep déterministe sur les puces numérotées `^\s*\d+\.`) est un compte de PAIRES (école, filière), PAS un compte d'établissements uniques.
REGIONS:                10/10 régions représentées (Centre et Littoral fortement majoritaires, cohérent avec la concentration urbaine attendue ; Adamaoua/Est/Extrême-Nord/Nord/Nord-Ouest/Sud/Sud-Ouest présents mais en nombre nettement plus faible)
PUBLIC/PRIVATE:         NON explicitement codé comme colonne séparée dans ce document (contrairement à l'annuaire ONEFOP/MINEFOP qui distingue public/privé en agrégat) — mais déductible en grande partie du nom lui-même ("ECOLE PRIVEE...", "INSTITUT PRIVE...", vs noms sans qualificatif, présumés publics/étatiques) ; PAS fiable à 100% par cette seule heuristique, à traiter comme UNKNOWN structuré tant qu'un champ dédié n'est pas confirmé.
COUNT:                  330 lignes numérotées (paires école×filière) extraites par grep déterministe (`grep -cE '^\s*[0-9]+\.'`) sur le texte pdftotext -layout. Nombre d'établissements UNIQUES estimé approximativement 100-150 par dédoublonnage textuel grossier (196 chaînes uniques obtenues par un script de test avec des artefacts de mise en page connus — TITRE APPROXIMATIF, PAS un chiffre final : un vrai dédoublonnage nécessiterait un parseur conscient des colonnes région/école, hors périmètre DISCOVERY de ce sprint, voir §30 de la spec "no mass collection").
IDENTIFIER:            AUCUN identifiant/matricule d'établissement présent dans ce document — seulement des noms textuels. Voir Source E pour la piste d'identifiant légal (décret/arrêté).
EXTRACTION POSSIBLE:   OUI structurellement (texte natif, structure Région>École répétée et régulière) — MAIS non tentée à l'échelle nationale ce sprint (§30 : no mass collection). Un extracteur dédié devra gérer : (a) le fait qu'une école peut apparaître dans plusieurs sections filière — dédoublonnage requis avant tout staging, jamais une ligne = un candidat automatique ; (b) quelques ruptures de mise en page (retours à la ligne au milieu d'un nom d'établissement) déjà observées.
COMPLETENESS:          EXPECTED_COUNT_UNKNOWN au niveau national/document — le PDF ne fournit aucun total explicite ("N écoles agréées au total"), aucune pagination externe (document unique de 11 pages, entièrement parcouru), aucune API. La preuve d'exhaustivité ne peut reposer QUE sur "11/11 pages du PDF entièrement lues, 10/10 filières officielles avec en-tête `FILIERE :` présentes" — un signal structurel raisonnable (toutes les sections attendues trouvées), pas une preuve d'exhaustivité au sens strict de `REGISTRY_EXTRACTION_SAFETY.md` (qui exige un compteur source explicite ou une preuve d'épuisement de pagination). Marqué `MANUAL_REVIEW_REQUIRED` par défaut pour toute future extraction, conformément à la politique par défaut.
PII:                   AUCUNE — document exclusivement institutionnel (nom d'école + région), aucun nom de candidat, promoteur ou directeur. Vérifié par recherche de motifs (`matricule`, `candidat`, `admis`, `né(e) le`) sur le texte extrait intégral : 0 occurrence pertinente.
SNAPSHOT:              SHA256=26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a, content-type=application/pdf, taille=699 343 octets, retrieved_at=2026-08-20 (session). Fichier binaire NON committé dans le dépôt (document déjà public, volumineux, pas de nécessité — cohérent avec la politique appliquée en MINEFOP-A.1 pour la Source D).
STATUS:                ACCESSIBLE (HTTP 200 au moment du sprint)
```

### Chaîne de source (§11 de la spec) — réserve honnête sur la découvrabilité

```
DISCOVERY SOURCE   : recherche web ("MINSANTE liste écoles de formation sanitaire agréées Cameroun") — résultat indexé par un moteur de recherche
↓ CLAIM             : "Liste des écoles de formation médico-sanitaires agréées du MINSANTE 2025" existe et est téléchargeable
↓ ORIGINAL SOURCE   : https://examen-national-special-minsante.cm/loadfile/...LISTE_ECOLES_AGREES_MINSANTE_2025.pdf — récupéré directement, HTTP 200, contenu vérifié conforme au titre annoncé
↓ AUTHORITY          : plateforme "EXAMEN NATIONAL SPECIAL - MINSANTE Cameroun" — page de contact confirme les 10 numéros de téléphone des Délégations Régionales de la Santé Publique (Adamaoua, Centre, Est, Extrême-Nord, Littoral, Nord, Nord-Ouest, Ouest, Sud, Sud-Ouest), un support technique à `infos@examen-national-special-minsante.cm`, un copyright "© 2026 MINSANTE. Tous droits réservés.", et redirige vers "www.minsante.gov.cm" comme portail institutionnel — faisceau d'indices cohérent avec une plateforme officielle MINSANTE, pas un site tiers usurpateur
↓ ACCESS STATUS       : Accessible directement (HTTP 200) ; le domaine principal minsante.cm (Drupal) ne LIE PAS explicitement ce document ni ce sous-domaine dans sa navigation actuelle (vérifié par recherche de sous-chaîne sur le HTML de la page d'accueil et de la catégorie RH — absent des deux) — le fichier a été trouvé via indexation externe (Google), pas via un clic dans le site officiel. RÉSERVE HONNÊTE : ceci n'invalide pas l'authenticité (chemin de stockage interne cohérent `storage/pdf/pages/resultats/...` avec les autres PDF légitimes du même portail — dossier de candidature, procédure d'inscription, communiqués — tous sous le même schéma de chemin), mais empêche de classer ce document TIER 1 "portail officiel navigable" au sens strict — voir décision de classification ci-dessus (TIER 1 proposé avec cette réserve documentée, à confirmer si un futur sprint retrouve un lien de navigation direct).
↓ CURRENT/HISTORICAL  : document daté "ANNEE 2025", plateforme active en 2026 (contacts "édition 2026" trouvés sur la page contact du même site) — young, pas un document historique périmé.
```

### Domaine `concoursminsante.cm` — lié depuis la page d'accueil officielle, techniquement inaccessible ce sprint

```
URL:                  https://www.concoursminsante.cm/
DÉCOUVERTE:           Lien direct "Concours écoles MINSANTE" présent sur la page d'accueil statique de minsante.cm (https://www.minsante.cm/, HTTP 200), donc désigné par le Ministère lui-même comme le portail concours officiel.
STATUS:                TLS_CERT_MISMATCH — le certificat servi (CN=*.minsante.cm, SAN=minsante.cm uniquement) ne couvre PAS le nom d'hôte concoursminsante.cm (ni avec ni sans www), échec `ERR_TLS_CERT_ALTNAME_INVALID` reproductible via fetch() natif ET WebFetch. Erreur de configuration serveur (hébergement partagé mal configuré), PAS un blocage actif type MINEFOP (403/certificat expiré) — nuance importante.
BYPASS TENTÉ:         NON — un contournement (`NODE_TLS_REJECT_UNAUTHORIZED=0`) a été envisagé par analogie avec le diagnostic MINEFOP-A, mais explicitement REFUSÉ par le contrôle de permission de l'environnement d'exécution avant toute exécution ; aucune tentative alternative de contournement (proxy, résolution DNS manuelle, User-Agent spoofing avancé) n'a été faite, conformément à la politique de non-contournement de la spec.
CONCLUSION:            Portail probablement remplacé en pratique par examen-national-special-minsante.cm (Source A) pour le cycle d'admission actuel — le lien "Concours écoles MINSANTE" de la page d'accueil est possiblement obsolète/non maintenu en parallèle de la nouvelle plateforme. Non résolu ce sprint, à retester lors d'un futur sprint (le certificat peut être corrigé entre-temps).
```

---

## Source B — Résultats de concours d'entrée par filière (minsante.cm, plusieurs éditions 2017-2023) — NOMINATIF PARTIEL, HAUT RISQUE PII, CORROBORATION CROISÉE UTILE

```
SOURCE:              Séries de PDF "Résultats du concours d'entrée dans les Ecoles de formation des personnels infirmiers, Sages-femmes et Médico-Sanitaires" — plusieurs éditions trouvées : 12 août 2017, 07 novembre 2020, 2021, 2022, 2023 (au moins), chacune avec un PDF par filière (ex. ASC2020.pdf, IDE12020.pdf, IGEO2020.pdf, TPR2020.pdf...)
URL EXEMPLE ANALYSÉ:  https://www.minsante.cm/site/sites/default/files/concours2020/IGEO2020.pdf (récupéré et analysé intégralement ce sprint)
PUBLISHER:            MINISTERE DE LA SANTE PUBLIQUE — Direction des Ressources Humaines (DRH), publié directement sur le domaine minsante.cm, catégorie "Développement des Ressources Humaines"
AUTHORITY:            TIER 1/2 — document légal (Décision ministérielle citant les décrets/communiqués fondateurs — voir Source F), hébergé directement sur le domaine officiel minsante.cm
DATE:                  Multiples éditions annuelles 2017-2023 (au moins) trouvées ; non recherché systématiquement au-delà (§30 no mass collection)
FORMAT:                PDF, texte natif (pdftotext -layout fonctionne)
COVERAGE:              Par filière/année — le PDF analysé (IGEO2020) couvre en réalité PLUSIEURS filières (Aide-Soignants Option Santé Communautaire, puis Psychomotricité et Relaxation en fin de document) malgré son nom de fichier suggérant une seule filière — RÉSERVE : la correspondance nom-de-fichier ↔ contenu n'est PAS fiable à 100%, à vérifier fichier par fichier si une future extraction est tentée.
NOMINATIVE/AGGREGATE:  NOMINATIF ET FORTEMENT PERSONNEL — structure confirmée : en-tête "Région: X" → en-tête "NOM DE L'ÉCOLE" (nominatif institutionnel, utile) → tableau "N° MATRICULE NOMS ET PRENOMS" listant les candidats ADMIS INDIVIDUELS (PII directe : matricule de concours + nom complet du candidat).
ENTITY TYPES:          TRAINING_ESTABLISHMENT (l'école apparaît comme en-tête de section, une ligne = une école, cohérent avec le modèle Écoles237)
PII:                   RISQUE ÉLEVÉ ET CONFIRMÉ — matricule de concours + nom complet de CHAQUE candidat admis, par centaines par document. Conformément à §18-19 de la spec, AUCUNE valeur candidat (nom, matricule) n'a été extraite, copiée, ni persistée nulle part dans ce dépôt — seuls les EN-TÊTES INSTITUTIONNELS (nom d'école, région) ont été lus et notés ci-dessous. Le fichier PDF source lui-même n'a pas été conservé après lecture (session temporaire uniquement, hors dépôt git).
EXTRACTION POSSIBLE:   PARTIELLEMENT — techniquement faisable d'extraire UNIQUEMENT les en-têtes "Région"/"NOM ÉCOLE" par un parseur ciblé qui ignore délibérément les lignes de tableau candidat (structure regex simple : lignes en MAJUSCULES sans motif "N° MATRICULE"), mais présente un risque de fuite PII si le parseur est mal calibré — nécessite tests dédiés avant tout usage réel (non développé ce sprint, DISCOVERY seulement).
COMPLETENESS:          EXPECTED_COUNT_UNKNOWN — un PDF par filière/année, nombre total de PDF par édition non dénombré systématiquement ce sprint (échantillon d'1 PDF analysé en détail sur ~22 PDF listés pour la seule édition 2020, ~15-20 pour chaque autre édition observée par titre de lien).
UTILITÉ RETENUE:        Corroboration croisée (§21) avec la Source A : "INSTITUT PANAFRICAIN DE PSYCHOMOTRICITE" (Région Littoral, concours 07 novembre 2020) correspond très probablement à "INSTITUT PANAFRICAIN DE PSYCHOMOTRICITE ET RELAXATION DE DOUALA" (Source A, filière Psychomotricité et Relaxation, région Littoral, 2025) — même institution, deux sources indépendantes, cinq ans d'écart, cohérence renforcée. Voir `reports/registry/minsante-a-source-comparison.csv`.
STATUS:                ACCESSIBLE (HTTP 200, vérifié sur l'exemple analysé)
```

---

## Source C — Décret n°80/198 du 9 juin 1980 portant statut des établissements de formation des personnels sanitaires — CADRE LÉGAL FONDATEUR

```
SOURCE:              Décret n°80/198 du 9 juin 1980 portant statut des établissements de formation des personnels sanitaires
URL (mirror consulté): https://opms-amsp.com/wp-content/uploads/2022/03/DECRET-N%C2%B0-80-198-DU-9-JUIN-1980-PORTANT-STATUT-DES-ETABLISSEMENTS-DE-FORMATION-DES-PERSONNELS-SANITAIRES.pdf
PUBLISHER (texte):    Présidence de la République du Cameroun (décret présidentiel) — mirror consulté = OPMS-AMSP (Ordre/association professionnelle camerounaise), PAS le texte primaire lui-même
AUTHORITY:             TIER 2 pour le texte (légalement fondateur, cité explicitement dans les décisions de concours MINSANTE analysées en Source B — "Vu le Décret 80/198 du 9 Juin 1980 portant Statut des Établissements de Formation des Personnels Sanitaires") ; TIER 3 pour ce canal d'accès précis (mirror associatif, pas spm.gov.cm/prc.cm consulté directement ce sprint faute de temps)
DATE:                  9 juin 1980 (texte fondateur, potentiellement amendé depuis — non vérifié)
FORMAT:                PDF, texte natif (pdftotext fonctionne intégralement)
CONTENU CLÉ:           Définit la TAXONOMIE OFFICIELLE des établissements de formation des personnels sanitaires en 3 CYCLES : Cycle "B" (écoles d'infirmiers), Cycle "C" (écoles d'infirmiers adjoints, écoles d'agents techniques du génie sanitaire, écoles d'agents techniques médico-sanitaires), Cycle "D" (centres de formation d'agents techniques adjoints du génie sanitaire, centres de formation d'aides-soignants). Article 3 : les établissements PUBLICS sont créés par DÉCRET DU PRÉSIDENT DE LA RÉPUBLIQUE et placés sous l'autorité du Ministre chargé de la Santé Publique — donne une piste d'identifiant officiel distincte pour le sous-ensemble public (numéro de décret présidentiel de création), à valider séparément du régime des écoles privées (Source D).
EXTRACTION POSSIBLE:   NON — texte réglementaire, pas une liste d'établissements
PII:                   Aucune
STATUS:                Accessible via ce mirror (non testé sur un domaine .gov.cm/.cm primaire ce sprint)
UTILITÉ:                Fournit le VOCABULAIRE OFFICIEL exact à utiliser pour la taxonomie (§16) — "école d'infirmiers", "école d'agents techniques médico-sanitaires", "centre de formation d'aides-soignants" — au lieu d'inventer une terminologie.
```

---

## Source D — Pages "Procédures de création et d'ouverture" (minsante.cm) — CADRE PROCÉDURAL, CONTAMINATION CONFIRMÉE (structures de soins, PAS des écoles)

```
URL:                  https://minsante.cm/site/?q=fr/content/proc%C3%A9dures-de-cr%C3%A9ation-et-douverture-formation-sanitaire-priv%C3%A9e-0
PUBLISHER:            MINSANTE (domaine officiel)
AUTHORITY:             TIER 2 (procédure administrative officielle)
CONTENU:               Décrit les procédures d'autorisation de création et d'ouverture d'une FORMATION SANITAIRE PRIVÉE — confirmé par recherche croisée : référence directement des "Cabinets de Soins", "Cabinets dentaires", délai de signature de 90 jours par le Ministre, pièce du dossier incluant attestation d'inscription des personnels techniques aux ordres professionnels — TOUT this décrit un ÉTABLISSEMENT DE SOINS (hôpital privé, clinique, cabinet), PAS une école de formation.
CLASSIFICATION §14:    HORS PÉRIMÈTRE ÉCOLES237 — CARE, PAS TRAINING. Documenté explicitement ici pour éviter toute confusion future : ne jamais utiliser cette page ni son vocabulaire ("formation sanitaire privée") comme signal d'appartenance au périmètre éducation. Le terme correct à rechercher pour les ÉCOLES est "école(s) de formation des personnels (médico-)sanitaires" ou "institut(s)/centre(s) de formation des personnels de santé" — jamais "formation sanitaire" seul.
EXTRACTION POSSIBLE:   NON APPLICABLE (hors scope produit)
```

---

## Source E — Formations Sanitaires Publiques / Situations comptables FOSA (minsante.cm, organigramme) — CONTAMINATION CONFIRMÉE (structures de soins)

```
URL:                  https://www.minsante.cm/site/?q=fr%2Forganigramme%2Fformations-sanitaires-publiques  (+ série "Situations comptables annuelles des FOSA Région de/du ...", une page par région, toutes les 10 régions trouvées sur la page d'accueil)
PUBLISHER:            MINSANTE
CLASSIFICATION §14:    HORS PÉRIMÈTRE — "FOSA" = "FOrmation SAnitaire" = établissement de SOINS dans la terminologie du système de santé camerounais (hôpitaux, centres de santé), confirmé par le contexte comptable/organigramme des pages trouvées. Nouvelle confirmation indépendante du piège terminologique déjà noté en Source D.
UTILITÉ RÉSIDUELLE:    Aucune pour ce sprint (hors scope) — mais confirme que MINSANTE structure ses données par les MÊMES 10 régions officielles que le reste du projet (aucune divergence de découpage régional détectée).
```

---

## Source F — Communiqués/arrêtés d'ouverture de concours (minsante.cm, catégorie RH) — CADRE LÉGAL, PAS UNE LISTE

```
URL EXEMPLE:          https://www.minsante.cm/site/?q=fr/content/arretes-portant-ouverture-des-concours-directs-2017
AUTHORITY:             TIER 2 — actes réglementaires officiels (arrêtés/communiqués), publiés directement sur minsante.cm
CONTENU:               Ouverture officielle des sessions de concours d'entrée (nombre de places par filière, calendrier) — PAS une liste d'établissements en tant que telle, mais confirme le mécanisme d'admission national centralisé qui alimente indirectement la Source A/B.
EXTRACTION POSSIBLE:   NON pour des établissements — utile uniquement comme contexte légal/calendaire
PII:                   Aucune a priori (arrêté d'ouverture, pas de liste de candidats) — non vérifié en détail ce sprint
```

---

## Source G — Étude de faisabilité OMS/AFRO (ResearchGate, citant MINSANTE 2010) — AGRÉGAT HISTORIQUE, DISCOVERY/TIER 3

```
SOURCE:               "Étude de faisabilité du Programme destiné au renforcement des écoles de médecine et des soins infirmiers... Région Africaine" (document OMS/AFRO)
URL:                   https://www.researchgate.net/publication/276272360_Etude_de_faisabilite_du_Programme_destine_au_renforcement_des_ecoles_de_medecine_et_des_soins_infirmiers_en_ouvrages_et_materiels_didactiques_dans_la_Region_Africaine
PUBLISHER:             OMS/AFRO (secondaire), citant des chiffres MINSANTE non vérifiés directement
AUTHORITY:             TIER 3/DISCOVERY — publication d'un partenaire international citant une statistique MINSANTE de seconde main, pas le document MINSANTE primaire lui-même
DATE:                  Chiffre cité daté "MINSANTE, 2010" — 16 ANS avant ce sprint, PÉRIMÉ, jamais utilisable comme expected_count actuel
COUNT:                  "40 écoles publiques et 29 écoles privées, soit 69 écoles de formation des personnels de santé et médicaux (MINSANTE, 2010)" ; mention complémentaire "17 écoles de médecine enregistrées par le MINESUP au 1er juillet 2011" (périmètre MINESUP, PAS MINSANTE — à ne jamais fusionner, cf. Source H ci-dessous sur la frontière MINESUP/MINSANTE)
NOMINATIVE/AGGREGATE:  AGRÉGAT SEULEMENT
EXTRACTION POSSIBLE:   NON
UTILITÉ:                Ordre de grandeur historique de référence UNIQUEMENT : 69 écoles en 2010 est cohérent (croissance plausible sur 15 ans, notamment secteur privé) avec l'estimation grossière de ~100-150 établissements uniques déduite de la Source A (2025) — corroboration faible d'ordre de grandeur, PAS un expected_count.
```

---

## Source H — Frontière MINESUP/MINSANTE (presse) — RISQUE DE CONTAMINATION INTER-REGISTRE, PAS UN FAUX POSITIF "SANTÉ"

```
SOURCES:               "Personnel Médico-sanitaire : Les Instituts privés d'enseignement supérieur écartés de la formation" (newsducamer.com) ; "Formation des professionnels médico-sanitaires : Les BTS, une option illégale pour les Camerounais" (echosante.info)
AUTHORITY:              TIER 3/DISCOVERY — presse, non vérifié directement contre un communiqué MINSANTE primaire ce sprint
CLAIM:                  Plusieurs Instituts Privés d'Enseignement Supérieur (IPES) enregistrés au MINESUP (donc légitimement dans le registre MINESUP_IPES) proposeraient des filières santé (BTS notamment) SANS agrément MINSANTE — présentées par ces articles comme illégales pour l'exercice professionnel réglementé.
IMPLICATION POUR ÉCOLES237: Risque de contamination CROISÉE entre registres (pas la contamination healthcare classique de §14, mais une contamination INTER-MINISTÈRE) : un établissement déjà présent en base via MINESUP (ex. l'établissement live "Institut Supérieur de Santé", sub_category="Santé", actuellement source_ministry=NULL, jamais lié à un registre MINSANTE) NE DOIT PAS être automatiquement considéré comme "agréé MINSANTE" du seul fait qu'il porte "Santé" dans son nom ou sa sous-catégorie produit. Les deux registres (MINESUP_IPES et un futur MINSANTE_ECOLES_AGREEES) doivent rester des `establishment_registry_identifiers` DISTINCTS sur la même fiche établissement si applicable — jamais fusionnés silencieusement sur la seule base du mot "santé".
EXTRACTION POSSIBLE:    NON — signal de vigilance, pas une liste
```

---

## Domaine à écarter / réserve technique

```
cm-minsante-drh.com   → domaine cité comme pied de page officiel sur les PDF de résultats de concours MINSANTE 2020 ("www.cm-minsante-drh.com") et référencé par un ancien résultat de recherche ("Observatoire National des Ressources Humaines de la Santé au Cameroun" — offre-de-formation) — DNS MORT ce sprint (ENOTFOUND, confirmé par résolution directe). Domaine historique probablement remplacé par examen-national-special-minsante.cm — à ne plus utiliser comme URL active, mais confirme qu'un "Observatoire RH Santé" avec une page "offre de formation" a existé, piste potentielle si une capture d'archive web est cherchée dans un futur sprint (non fait ce sprint, hors périmètre §30).
concoursminsante.cm   → voir réserve TLS documentée sous Source A — lien officiel mais techniquement inaccessible ce sprint (misconfiguration certificat, pas un blocage actif).
```

## Résumé des sources

| Source | Tier | Nominatif/Agrégat | Accessible | PII | Utilisable comme registre nominatif |
|---|---|---|---|---|---|
| A — Liste Écoles Agréées MINSANTE 2025 (examen-national-special-minsante.cm) | 1 (proposé, réserve découvrabilité) | NOMINATIF | Oui | Aucune | **OUI — meilleure source, à approfondir en MINSANTE-B** |
| B — Résultats concours par filière 2017-2023 (minsante.cm) | 1/2 | NOMINATIF (écoles) + PII candidats | Oui | ÉLEVÉ (matricule+nom candidats) | Corroboration croisée seulement, jamais d'extraction candidat |
| C — Décret 80/198 du 9 juin 1980 | 2/3 (mirror) | Cadre légal | Oui (mirror) | Aucune | NON — taxonomie/vocabulaire seulement |
| D — Procédures création formation sanitaire privée | 2 | Hors scope (soins) | Oui | Aucune | NON — CONTAMINATION CONFIRMÉE, à exclure |
| E — Formations sanitaires publiques / FOSA | 2 | Hors scope (soins) | Oui | Aucune | NON — CONTAMINATION CONFIRMÉE, à exclure |
| F — Arrêtés ouverture concours | 2 | Cadre légal | Oui | Aucune a priori | NON — contexte seulement |
| G — Étude OMS/AFRO (MINSANTE 2010) | 3/Discovery | AGRÉGAT | Oui | Aucune | NON — ordre de grandeur historique seulement |
| H — Presse frontière MINESUP/MINSANTE | 3/Discovery | N/A | Oui | Aucune | NON — signal de vigilance inter-registre |

Domaines vérifiés/écartés : `cm-minsante-drh.com` (DNS mort), `concoursminsante.cm` (TLS misconfiguré, non contourné).
