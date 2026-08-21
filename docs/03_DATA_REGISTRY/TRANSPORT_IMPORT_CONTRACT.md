# Transport Import Contract

SPRINT TRANSPORT-A, 2026-08-21. Opérateur : jean-merlain. Document de
contrat pour un futur collecteur `scripts/school-registry/sources/
mintransport.ts` (NON écrit ce sprint). AUCUNE écriture staging, AUCUNE
promotion, AUCUN pilote exécuté. Modèle : `MINEFOP_IMPORT_CONTRACT.md`,
`MINSANTE_IMPORT_CONTRACT.md`, `MULTI_REGISTRY_CONTRACT.md`. Voir
`TRANSPORT_SOURCE_CATALOG.md` pour le détail source par source.

## 1. Authority / Registry

```
AUTHORITY (proposé) :  MINTRANSPORT (constante interne déjà présente dans
                       scripts/school-registry/lib/registryAuthority.ts,
                       AUTHORITIES — pas encore dans l'enum Postgres
                       registry_source_ministry, voir §11)
AUTHORITY OFFICIELLE :  Ministère des Transports (MINT) — nom confirmé sur
                       le portail officiel mintransports.cm et par
                       recoupement Wikipédia/presse. Sigle interne projet
                       "MINTRANSPORT" ≠ sigle officiel ministériel "MINT"
                       — ne pas confondre, documenté explicitement pour
                       éviter toute confusion future (le sigle interne
                       préexistait à cet audit, voir
                       MULTI_REGISTRY_CONTRACT.md).
DOMAINES OFFICIELS :   mintransports.cm (portail principal, confirmé actif)
                       ssdtmint.cm (services dématérialisés — permis,
                       cartes grises)
DOMAINE À ÉCARTER :    mintransports.net (squatté, voir catalogue §0)
REGISTRIES POTENTIELS (aucun confirmé nominatif ce sprint) :
  - MINT_DTT     — auto-écoles, via Direction des Transports Terrestres
                   (existence du service confirmée, liste non atteinte)
  - MINT_DAMVN   — maritime, via Direction des Affaires Maritimes et des
                   Voies Navigables (existence confirmée, liste non
                   atteinte)
  - CCAA         — aviation, autorité distincte du MINT mais rattachée à
                   son secteur (existence confirmée, liste ATO non
                   atteinte)
AUCUN nom de registre n'est figé pour écriture — purement documentaire,
conforme à §6 de MULTI_REGISTRY_CONTRACT.md ("ne pas inventer les noms
des futurs registres avant leur audit").
```

## 2. Entity Model — ce qui entre, ce qui n'entre pas

```
EDUCATION_ESTABLISHMENT / TRAINING_ESTABLISHMENT (IN SCOPE) :
  - Auto-écoles (formation à la conduite, permis B/A/poids lourds) —
    agrément MINT/DTT attendu
  - Écoles de formation maritime (marine marchande, gens de mer,
    STCW) — ex. EMIPAC, Centre d'Instruction Maritime et Portuaire, "Le
    Paquebot" — existence confirmée par sources tierces, agrément
    officiel MINT/DAMVN NON corroboré ce sprint (voir catalogue Source F)
  - Organismes de formation aéronautique (ATO) — dont l'école de
    formation propre de la CCAA (EFO) si ouverte à un public externe
    (statut exact non tranché ce sprint)
  - Instituts de formation professionnelle transport/logistique
    explicitement supervisés/accrédités par le MINT ou une direction
    apparentée (aucun exemple confirmé ce sprint — catégorie ouverte par
    principe, pas peuplée)

ADMINISTRATIVE_SERVICE (OUT OF SCOPE) :
  - Centres de contrôle technique automobile
  - Bureaux d'immatriculation / SSDT (services dématérialisés de délivrance
    de permis/cartes grises)
  - Délégations régionales/départementales du MINT elles-mêmes
  - CCAA et DAMVN en tant qu'AUTORITÉS (mais leurs écoles de formation
    propres, si publiques et ouvertes, peuvent qualifier séparément en
    TRAINING_ESTABLISHMENT — distinction entre le régulateur et son école,
    voir Source G du catalogue)

COMMERCIAL_OPERATOR (OUT OF SCOPE) :
  - Compagnies de transport (bus, taxi, fret)
  - Compagnies aériennes, compagnies maritimes
  - Agences de bus/agences de voyage
  - Ports, aéroports en tant qu'infrastructures/opérateurs
  - Opérateurs fret et logistique commerciale (hors formation)

EXAM_CENTER (OUT OF SCOPE sauf si aussi organisme de formation) :
  - Centres d'examen du permis de conduire purs — une auto-école qui
    dispense EXCLUSIVEMENT des examens sans former n'est pas une école ;
    l'ambiguïté fréquente (une auto-école organise souvent les deux) doit
    être tranchée au cas par cas sur preuve de dispense effective de
    formation, jamais supposée par défaut

UNKNOWN (À CLASSER AU CAS PAR CAS, jamais par défaut IN SCOPE) :
  - École de formation interne d'un régulateur (ex. EFO/CCAA) tant que
    son mode d'admission (public vs personnel interne uniquement) n'est
    pas confirmé
  - Centres de formation cités par des tiers commerciaux sans
    corroboration officielle (ex. plusieurs centres maritimes du
    catalogue Source F)

RÈGLE ABSOLUE : ne jamais déduire un statut EDUCATION/TRAINING d'une
présence dans une statistique agrégée (ex. "1 761 CFP" ou tout futur
équivalent transport) — une source agrégée n'est pas un registre
nominatif et ne doit jamais servir à "reconstruire" des établissements
individuels (leçon MINEFOP-A/MINSANTE-A, rappelée explicitement dans le
brief de ce sprint).
```

## 3. Cross-Ministry Identity Rules — MINEFOP

```
CONSTAT RÉEL CE SPRINT (pas hypothétique) : un centre de formation
"Fleet Management Academy" (FMA) détient un agrément MINEFOP N°000471 (19
septembre 2022) et propose de la "conduite défensive" / recyclage à la
conduite sur simulateur — un contenu TRANSPORT, mais sous AUTORITÉ
MINEFOP, pas MINT. Ceci confirme concrètement le risque anticipé par le
brief (§8) : une institution "transport" peut être enregistrée côté
MINEFOP sous `vocational_training`, sans jamais apparaître dans un futur
registre MINT.

RÈGLE APPLICABLE (déjà le comportement documenté pour MINESUP/MINEFOP/
MINSANTE dans MULTI_REGISTRY_CONTRACT.md §1, reconduite ici sans
modification) :

  UN établissement + PLUSIEURS lignes `establishment_registry_identifiers`
  (une par autorité/registre qui le reconnaît), JAMAIS deux fiches
  `establishments` distinctes pour la même institution physique.

  Avant toute promotion Transport (hors périmètre de ce sprint), un futur
  collecteur DOIT faire tourner `lib/matching/engine.ts` contre les
  établissements déjà promus (y compris ceux d'origine MINEFOP) avant
  toute création — un même centre de conduite pourrait déjà exister côté
  MINEFOP sous un nom légèrement différent.

  Si le même établissement est trouvé sous deux autorités : rattacher via
  une nouvelle ligne `establishment_registry_identifiers`
  (`authority`='MINTRANSPORT`, `registry`='MINT_DTT` ou équivalent),
  jamais fusionner silencieusement les deux fiches sans revue humaine
  (cohérent avec §5 de MULTI_REGISTRY_CONTRACT.md — un nom identique seul
  n'est jamais une preuve suffisante).
```

## 4. Cross-Ministry Identity Rules — MINESUP

```
CONSTAT CE SPRINT : aucune correspondance nominative directe trouvée entre
les établissements MINESUP déjà promus par Écoles237 (recherche par mot-
clé "maritime"/"aviation"/"aéronautique"/"transport" sur les fichiers
`data/registry/master/*.json` et `data/registry/normalized/minesup*.json`
— zéro résultat) et une institution transport connue. La règle
d'anticipation reste néanmoins la MÊME que pour MINEFOP (§3 ci-dessus) :
une future filière logistique/aéronautique/maritime de niveau supérieur
(IPES) pourrait chevaucher MINESUP ET MINT simultanément (ex. un IPES
avec filière "transport et logistique" déjà réel dans le paysage
camerounais — ISETAG à Douala propose une filière maritime et portuaire,
statut IPES/MINESUP non vérifié ce sprint). Même règle : UN établissement,
PLUSIEURS autorités, jamais de doublon.
```

## 5. Taxonomy Mapping

```
establishments.main_category (enum Postgres fermé, 5 valeurs : garderie/
primaire/secondaire/superieur/autres) :
  - Auto-écoles                          -> 'autres' (déjà le cas des 2
                                            entrées seed déjà en
                                            production, voir §13)
  - Formation maritime/aéronautique post-bac ou de niveau technique
    supérieur                            -> 'superieur' si l'établissement
                                            recrute après le bac et délivre
                                            un diplôme de niveau supérieur
                                            (cas par cas), sinon 'autres'
  - AUCUNE migration requise — le mécanisme `toMainCategory()` déjà en
    place absorbe toute nouvelle catégorie non prévue vers 'autres' par
    défaut (comportement déjà documenté pour MINESUP/MINEFOP/MINSANTE)

establishments.sub_category (text libre) :
  - Déjà utilisé en production avec la valeur libre "Auto-école" (2
    fiches seed, voir §13) — réutilisable tel quel, aucune contrainte
    fermée à modifier

establishment_import_staging.education_family (enum Postgres fermé, 11
valeurs : basic/secondary_general/secondary_technical/teacher_training/
higher_education/vocational_training/health_training/
agricultural_training/livestock_fisheries_training/
forestry_wildlife_training/other) :
  - AUCUNE valeur dédiée transport — retomberait sur 'other', EXACTEMENT
    comme conclu pour MINTRANSPORT dans MULTI_REGISTRY_CONTRACT.md §4.
    Confirmé, pas de nouvelle conclusion nécessaire ce sprint.
  - Alternative envisageable pour une future filière transport de niveau
    supérieur : 'vocational_training' (proche sémantiquement d'un CFP
    conduite/maritime/aéronautique) — À DÉCIDER lors du sprint de collecte
    réel, pas ici, sur preuve d'un cas concret plutôt que par principe

TAXONOMY_COMPATIBLE : PARTIEL
  - Le produit (main_category/sub_category) est déjà 100% compatible sans
    migration (comportement 'autres' + texte libre déjà utilisé en
    production réelle, pas hypothétique).
  - Le staging (education_family) est compatible mais SANS PRÉCISION —
    tout enregistrement Transport staging tombera dans 'other', perdant
    la distinction auto-école / maritime / aviation au niveau de ce champ
    (récupérable via `raw_data` jsonb et `sub_category` texte libre, donc
    pas une perte d'information réelle, juste pas interrogeable
    directement par cette colonne enum).
  - AUCUNE migration nécessaire pour démarrer une collecte Transport à
    l'identique du traitement déjà réservé à MINESUP/MINEFOP/MINSANTE.
```

## 6. Source Ministry Enum — état vérifié en direct (pas un ancien rapport)

```
Vérification effectuée ce sprint par requête REST directe (service_role)
contre Supabase, PAS par lecture de rapport antérieur :

  Filtre `establishment_import_staging?source_ministry=eq.MINTRANSPORT`
  -> HTTP 400, code Postgres 22P02
     "invalid input value for enum registry_source_ministry: MINTRANSPORT"

MINTRANSPORT enum/value exists : NON — confirmé en direct, cohérent avec
REGISTRY-MULTI-A et avec le commentaire déjà présent dans
`supabase/migrations/0006_national_registry_staging.sql`
(`registry_source_ministry` = 'MINEDUB','MINESEC','MINESUP','MINEFOP',
'MINSANTE','MINADER','MINEPIA','MINFOF','OTHER' — 9 valeurs, aucune
Transport).

MIGRATION_REQUIRED_BEFORE_PILOT (pour establishments/
establishment_import_staging) : OUI, mais MINEURE — un simple
`ALTER TYPE registry_source_ministry ADD VALUE 'MINTRANSPORT';` suffirait
pour ces deux tables SI un pilote Transport écrivait un jour directement
`source_ministry`. NON préparée, NON exécutée ce sprint (aucune écriture
prévue).

IMPORTANT — nuance déjà établie par REGISTRY-MULTI-A et reconfirmée ici :
`establishment_registry_identifiers.authority` (migration 0021, table
CONFIRMÉE EXÉCUTÉE ET PEUPLÉE en production — 2242 lignes lues ce sprint,
voir §13) est un champ TEXTE LIBRE, PAS lié à l'enum
`registry_source_ministry`. Une future collecte Transport pourrait donc
écrire des lignes `establishment_registry_identifiers` avec
`authority`='MINTRANSPORT' SANS migration d'enum — la migration d'enum ne
serait nécessaire QUE si une écriture directe sur
`establishments.source_ministry` ou
`establishment_import_staging.source_ministry` était voulue (ex. pour
filtrer un dashboard par ministère). Distinction utile pour ne pas
sur-bloquer un futur pilote sur une migration qui n'est peut-être même
pas sur le chemin critique.
```

## 7. Identifier Model

```
Aucun format d'identifiant Transport réel confirmé nominativement ce
sprint (contrairement à MINEFOP-A.1 qui avait trouvé 5 exemples
individuels du format N°<n>/MINEFOP/SG/DFOP/... sur des sites de centres
tiers). Pour Transport, seule l'EXISTENCE du principe d'agrément
individuel est confirmée (Arrêté N°00406/A/MINT/DTT, Art. 5 et suivants —
délai d'instruction, agrément tacite après 60 jours), SANS qu'aucun
numéro d'agrément réel n'ait été observé sur un site d'auto-école, un
document ministériel lisible, ou une source tierce ce sprint.

AUCUN FORMAT NORMALISÉ INVENTÉ — conforme à la consigne absolue du brief
(§12). Si un futur sprint de collecte trouve des exemples réels
(similaires à l'exercice MINEFOP-A.1 Source G), ils devront être
documentés de la même façon : plusieurs occurrences INDÉPENDANTES
(sites de centres différents, pas un seul agrégateur) avant d'être
traités comme un pattern fiable.

Compatibilité avec `establishment_registry_identifiers` : STRUCTURELLEMENT
COMPATIBLE SANS MODIFICATION — `registry`/`identifier_type`/`identifier`
sont déjà des colonnes texte ouvertes (pas d'enum fermé), la contrainte
d'unicité `(registry, identifier_type, identifier)` s'appliquerait de la
même façon qu'aux registres MINESEC/MINESUP déjà en production. Aucune
extension de schéma nécessaire.
```

## 8. Staging Compatibility

```
STAGING_COMPATIBLE : OUI, comme conclu par MULTI_REGISTRY_CONTRACT.md §7
pour MINESUP/MINEFOP/MINSANTE — même conclusion pour Transport, revérifiée
ici plutôt que simplement recopiée :
  - `source_ministry` : nécessiterait la migration enum §6 UNIQUEMENT si
    une écriture staging réelle était voulue (aucune ce sprint)
  - `education_family` : couvre via 'other' ou 'vocational_training',
    voir §5 — pas de blocage
  - `official_identifier` (text, nullable) : compatible avec tout futur
    format Transport découvert, aucune structure a priori requise
  - `raw_data` (jsonb) : absorbe toute variation de structure source
  - Géographie (region/department/arrondissement/commune/locality/city) :
    déjà des colonnes texte nullable, compatibles avec la structure par
    région déjà observée dans les PDF "Permis" du portail MINT (voir
    catalogue Source A) si cette structure s'avère un jour exploitable
NEEDS_EXTENSION : NON identifié ce sprint. À réévaluer seulement si un
futur audit Transport révèle un besoin structurel réellement différent
(ex. véhicules/permis individuels plutôt qu'établissements physiques —
hors du modèle actuel, non rencontré ce sprint).
```

## 9. Geography

```
Aucune extraction géographique nominative effectuée (aucune source
nominative atteinte). Structure observée par déduction de nommage de
fichier uniquement (dossier `/images/Permis/<date>/<Région>/<Ville
date>.pdf` sur mintransports.cm) — suggère que le MINT organise au moins
certains documents par région et ville, cohérent avec une couverture
nationale par délégations régionales/départementales (Arrêté 2000, Art.
5 : "chef de service PROVINCIAL ou DÉPARTEMENTAL"). AUCUNE géographie
individuelle d'établissement n'a été inférée ou supposée — NULL partout,
conforme à la consigne absolue du brief (§14).
```

## 10. Source Completeness

```
Aucune source NOMINATIVE atteinte -> évaluation NOMINATIVE vs AGGREGATE
sans objet pour l'instant :
  - Source D (TRANSTAT MINT 2025) est structurellement un AGRÉGAT
    statistique par nature (annuaire), comme son équivalent MINEFOP/
    ONEFOP déjà audité — non lu en détail ce sprint (limite technique
    PDF), mais son TYPE de document ne changerait pas cette conclusion
    même relu.
  - Aucune pagination, API cachée, ou téléchargement de liste complète
    identifié pour un registre nominatif.
  - Aucune déclaration d'exhaustivité méthodologique trouvée pour
    Transport (contrairement à l'annuaire ONEFOP/MINEFOP qui affirme
    explicitement un recensement "EXHAUSTIF" annuel — aucun équivalent
    trouvé pour MINT ce sprint, mais non cherché avec la même profondeur
    faute de document lisible).
COMPLETENESS_MECHANISM : NON DÉTERMINÉ — aucune preuve de mécanisme
d'exhaustivité pour un futur registre Transport à ce stade.
```

## 11. PII Policy

```
Risque identifié mais NON réalisé : le dossier `/images/Permis/<date>/
<région>/<ville>.pdf` du portail MINT porte un nom suggérant des
résultats de session d'examen du permis de conduire — potentiellement
des LISTES NOMINATIVES DE CANDIDATS (nom/prénom, éventuellement date de
naissance), ce qui serait une donnée personnelle sans rapport avec
l'identité d'un ÉTABLISSEMENT. AUCUNE tentative d'OCR ou d'extraction
plus poussée n'a été faite sur ces PDF ce sprint — décision délibérée,
cohérente avec la politique déjà appliquée à la Source H de MINEFOP-A.1
(PDF scanné non exploité par précaution PII).

RÈGLE APPLICABLE pour tout futur collecteur Transport (reconduite sans
modification depuis les contrats MINEFOP/MINSANTE) : ne persister QUE
l'identité institutionnelle (nom d'établissement, ville/région,
identifiant d'agrément s'il existe, URL source). Propriétaire/promoteur/
directeur d'auto-école, titulaire de licence, moniteur, téléphone
personnel, email personnel = JAMAIS persistés, même si présents dans la
source brute (`raw_data` jsonb ne doit pas non plus servir de dépôt
détourné pour de la PII — si une source mélange établissement et PII,
l'extraction doit filtrer avant écriture, pas après).

PII rencontrée ce sprint : possible mais NON confirmée (dossier Permis
non ouvert). PII persistée ce sprint : 0 (aucune écriture de toute
façon).
```

## 12. Matching Policy

```
Réutilisation intégrale de `scripts/school-registry/lib/matching/
engine.ts` — AUCUNE logique de correspondance spécifique Transport à
écrire séparément, conforme à MULTI_REGISTRY_CONTRACT.md §6. Le
pondération de tokens STOPWORD/WEAK_GENERIC/NORMAL (§6.1 du même
document) s'applique sans changement — un mot comme "conduite" ou
"transport" devra être évalué pour un éventuel classement WEAK_GENERIC
lors du premier sprint de collecte réelle (pas fait ce sprint, aucun
corpus de noms réels disponible pour le calibrer honnêtement).
```

## 13. Sample Matching — READ ONLY (§17 du brief)

```
RÉSULTAT : N/A — aucun échantillon de 5 à 10 institutions réelles avec
identité suffisamment sûre n'a pu être constitué ce sprint.

Ce qui EXISTE réellement en base (audit direct, service_role, ce sprint) :
  - 2 fiches `establishments` déjà live nommées "Auto-École La Route
    Sûre" (Yaoundé) et "Auto-École Madiba" (Douala), `main_category`=
    'autres', `sub_category`='Auto-école'. AUDIT DE PROVENANCE : les
    deux ont `source_ministry`=NULL, `source_url`=NULL, `official_id`=
    NULL, `created_at`=2026-07-04T18:56:03 (même timestamp exact que 40
    autres lignes attribuées à `supabase/seed_schools.sql` dans
    `PRODUCTION_MIGRATION_STATE.md`) — CE SONT DES DONNÉES DE SEED/DÉMO,
    PAS DES ÉTABLISSEMENTS RÉELS VÉRIFIÉS PAR UNE SOURCE OFFICIELLE.
    Coordonnées/téléphone au format manifestement générique. NE PAS
    utiliser ces deux fiches comme échantillon de test du moteur de
    matching — elles ne représentent aucune source réelle à faire
    correspondre.
  - Institutions maritimes NOMMÉES par des tiers (EMIPAC, etc., catalogue
    Source F) — noms réels probables, mais SANS aucune donnée officielle
    MINT/DAMVN corroborante (pas de ville/région structurée au-delà de
    "Douala", pas d'identifiant, pas de source primaire gouvernementale)
    — insuffisant pour un test de matching honnête (le moteur testerait
    contre du bruit, pas contre une vraie paire source-officielle /
    établissement-existant).

CONCLUSION : documenté N/A conformément à la permission explicite du
brief plutôt que forcé avec des données non sûres.
```

## 14. Pilot Strategy

```
PILOT_POSSIBLE : NON

Raison : aucune source nominative officielle bornée n'a été confirmée
accessible ce sprint (voir catalogue, résumé final). Les deux candidats
les plus proches d'un pilote (Source A liste auto-écoles, Source H
CAM-TVET) sont bloqués par une limite technique/d'accès CONCRÈTE
(lien mort pour A, rendu JavaScript non capturable par les outils de ce
sprint pour H) plutôt que par une absence de source — donc pas un
DEFER définitif, mais pas un GO non plus.

Si une future itération (TRANSPORT-A.1, sur le modèle de MINEFOP-A.1)
parvenait à :
  (a) localiser la page/le PDF réel de liste d'auto-écoles agréées sur
      mintransports.cm (recherche plus approfondie de la structure du
      site, ou contact direct), OU
  (b) obtenir un rendu JavaScript de traininginformation.cm/home/eftp
      avec un filtre tutelle transport confirmé existant,
alors un pilote borné resterait recommandé sur le MÊME modèle que les
pilotes précédents : UNE région d'auto-écoles (20-50 institutions),
periode de revue humaine bornée, `verification_status`='UNVERIFIED' par
défaut, aucun auto-merge.
```

## 15. MINSANTE V2 — statut inchangé

```
Rappel explicite (aucune action) : MINSANTE-H pilot production CLOSED (8
établissements live), extraction nationale 9/10 filières SAFE, Imagerie
Médicale SOURCE_INCOMPLETE, MINSANTE-J BLOCKED_PENDING_HUMAN_DOCUMENTARY_
VALIDATION. Ce sprint Transport n'a touché AUCUNE donnée, AUCUN script,
AUCUNE table liée à MINSANTE.
```

## 16. Acceptance Criteria for a Future TRANSPORT-B Pilot (si un jour lancé)

```
- Source nominative officielle confirmée accessible (pas seulement
  citée par la presse)
- Complétude/exhaustivité déclarée ou raisonnablement inférable
  (pagination connue, ou déclaration explicite de l'autorité)
- Portée bornée (une région ou une filière, 20-50 institutions)
- 0 PII persistée
- Chaque enregistrement staging avec `source_ministry`, `source_url`,
  `raw_data` intact, `official_identifier` si disponible (jamais
  inventé)
- Migration enum `registry_source_ministry` exécutée AU PRÉALABLE si
  l'écriture passe par `source_ministry` structuré (voir §6) — ou
  contournée via `establishment_registry_identifiers.authority` en texte
  libre si on préfère l'éviter
- Revue humaine systématique avant toute promotion — aucun auto-merge,
  même en cas de correspondance EXACT_MATCH avec un établissement déjà
  promu sous une autre autorité (MINEFOP notamment, voir §3)
```

## 17. Promotion Requirements (rappel, reconduits sans changement)

```
Identiques à MULTI_REGISTRY_CONTRACT.md — pas de règle Transport
spécifique nécessaire : traçabilité absolue de la source (jamais nulle),
`establishment_registry_identifiers` pour tout identifiant secondaire
(jamais fusion de deux registres incompatibles), unicité
`(registry, identifier_type, identifier)`, matching engine partagé, revue
humaine obligatoire avant toute écriture `establishments`.
```
