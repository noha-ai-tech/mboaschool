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

## 18. Addendum TRANSPORT-A.1 (2026-08-21) — mêmes conclusions structurelles, nouvelles preuves

```
SPRINT DISTINCT, même jour, même opérateur, toujours READ-ONLY. Aucune
conclusion structurelle de ce contrat n'est invalidée — au contraire,
plusieurs sont maintenant confirmées avec des preuves plus fortes
plutôt que par déduction. Détail complet dans
TRANSPORT_SOURCE_CATALOG.md §"TRANSPORT-A.1 — Addendum" et
reports/registry/transport-a1-run-summary.json.

PILOT_POSSIBLE : NON (inchangé) — toujours aucune source nominative
officielle bornée. Les deux candidats que §14 identifiait comme
"bloqués par limite technique plutôt que par absence de source" sont
maintenant CLOS négativement de façon définitive plutôt que laissés
ouverts :
  (a) Liste auto-écoles mintransports.cm/.net : confirmé irrécupérable
      (API Wayback Machine interrogée, zéro snapshot pour le domaine
      squatté ou l'URL exacte).
  (b) CAM-TVET/traininginformation.cm : confirmé HORS PÉRIMÈTRE
      transport par déclaration officielle de son opérateur PADESCE
      (tutelles couvertes = MINEFOP/MINESEC/MINADER/MINEPIA/MINPROFF/
      MINJEC, MINT absent) — ce n'était donc pas un problème de rendu
      JavaScript comme supposé, mais un problème de périmètre.
  Aucun troisième candidat de pilote n'a émergé ce sprint malgré une
  recherche élargie sur 8 familles de sources (§7 du brief) — TRANTAT
  MINT 2025 (annuaire), désormais lisible grâce à un outil pdftotext
  disponible nativement (poppler 4.00 bundlé avec Git for Windows),
  est CONFIRMÉ comme agrégat statistique pur ("~50 auto-écoles créées/
  an"), pas une liste nominative — fermant définitivement cette piste
  également.

TAXONOMY — précision supplémentaire (§5 inchangé dans son mécanisme,
affiné dans son application) :
  - Auto-écoles : 'autres' + sub_category='Auto-école' — inchangé.
  - Maritime : les institutions Tier 3 réellement trouvées (EMIPAC,
    IT2MIP, Le Paquebot, Centre d'Instruction Maritime et Portuaire)
    admettent des candidats dès le niveau CEP (IT2MIP) — PAS
    uniformément post-bac. `education_family`='vocational_training'
    est donc plus probable que 'higher_education' pour CES
    institutions spécifiquement, au cas par cas — à ne jamais déduire
    par principe. À NE PAS CONFONDRE avec IUEs/IUTESSA (MINESUP), qui
    sont des IPES d'ingénierie généralistes offrant "Technologies de
    la marine marchande" comme UNE spécialité parmi plusieurs — ces
    deux-là restent 'higher_education'/'superieur' au niveau de
    L'INSTITUTION ENTIÈRE, pas à cause de cette seule spécialité. La
    distinction filière-vs-institution doit être préservée dans tout
    futur modèle de données, jamais aplatie.
  - Aviation : toujours non tranché (admission EFO ambiguë, IRDSM
    probablement 'vocational_training' — formations courtes
    métier/sécurité, non confirmé formellement).

MATCHING ENGINE — finding concret (pas seulement anticipé) :
  L'échantillon de test (§13 ci-dessous, exécuté ce sprint) a produit
  un STRONG_MATCH (100% chevauchement) entre "AUTO ECOLE LEO" (nom
  Tier 3 réel, Yaoundé) et la fiche seed déjà en production
  "Auto-École La Route Sûre" (Yaoundé) — alors que ce sont deux
  institutions manifestement différentes. Cause : le token "auto"
  n'est PAS dans `FUZZY_STOPWORDS` de lib/matching/engine.ts (seul
  "école"/"ecole" y figure). RECOMMANDATION pour un futur sprint de
  collecte réelle (NON appliquée ce sprint, moteur inchangé par
  politique read-only) : évaluer l'ajout de "auto" au vocabulaire
  générique/WEAK_GENERIC avant tout pilote auto-écoles, sous peine de
  générer des STRONG_MATCH non fiables entre auto-écoles sans rapport
  partageant juste la même ville. `safeForAutoLink` est resté à 0 sur
  tout l'échantillon (10/10) — aucune fusion automatique n'aurait eu
  lieu même sans cette correction, donc AUCUN risque de promotion
  incorrecte ce sprint (read-only de toute façon), mais le signal doit
  être traité avant TRANSPORT-B si jamais lancé.

Échantillon complet exécuté :
scripts/school-registry/transport-a1-matching-sample.ts (réutilise
lib/matching/engine.ts SANS AUCUNE MODIFICATION, conforme à §12
ci-dessus) → reports/registry/transport-a1-matching-sample.csv.

DECISION (§22 du brief) : C — sources discovery/agrégat uniquement,
TRANSPORT DEFERRED. READY_FOR_TRANSPORT_B : NO.
```

## 19. Addendum TRANSPORT-A.1-T3 (2026-08-21) — pipeline de découverte Tier 3, dry-run staging uniquement

```
SPRINT DISTINCT, même jour, même opérateur, toujours READ-ONLY vis-à-vis
de establishments/staging/registry_identifiers (0 écriture réelle des
trois côtés, vérifié en direct au début ET à la fin du sprint). Ce
sprint NE cherche PAS de nouvelle source officielle MINT — il construit
et exécute le pipeline de DISCOVERY/REVIEW Tier 3 annoncé comme
"prochaine étape possible" par les sprints précédents, avec un dry-run
staging exclusivement (aucune ligne réellement insérée).

RÉSULTAT PRINCIPAL : décision A — TIER3_PIPELINE_VALIDATED (voir
TRANSPORT_SOURCE_CATALOG.md, addendum TRANSPORT-A.1-T3, et
reports/registry/transport-tier3-summary.json pour le détail complet).
IMPORTANT : la décision A n'autorise PAS la promotion — elle autorise
seulement la PLANIFICATION d'un futur sprint TRANSPORT-A.2-T3 qui
pourrait insérer des candidats en staging UNIQUEMENT comme lignes de
revue (SOURCE_REVIEW / REVIEW_REQUIRED, jamais CLEAN_APPROVABLE).

ACCEPTANCE CRITERIA POUR UN FUTUR TRANSPORT-A.2-T3 (staging contrôlé,
Tier 3 review-only — DISTINCT des critères §16 ci-dessus qui restent
réservés à un futur pilote sur SOURCE OFFICIELLE) :
  - Autorisation explicite de jean-merlain + Eddy + architecte
    (brief §18 — non obtenue ce sprint, non demandée ce sprint)
  - Chaque ligne staging porte `raw_data.transport_tier3` avec la
    provenance complète (source_id, domaine, tier3_class,
    independent_source_count, tier3_confidence) — structure déjà
    prête dans data/registry/normalized/transport-tier3-v1/
    transport-tier3-candidates.json, réutilisable telle quelle
  - `classification` = SOURCE_REVIEW ou équivalent — JAMAIS
    CLEAN_APPROVABLE, quel que soit le tier3_confidence (même
    TIER3_CORROBORATED reste review-only, règle absolue §17 du brief)
  - `source_ministry` : NE PAS forcer 'MINTRANSPORT' tant que la
    migration enum §6/§19bis n'est pas exécutée — utiliser
    `establishment_registry_identifiers.authority`='MINTRANSPORT' en
    texte libre si un identifiant doit être rattaché (ex. Fleet
    Management Academy garde son identifiant MINEFOP existant, jamais
    réécrit sous une autorité Transport qu'il n'a pas)
  - `education_family` : 'other' par défaut (auto-écoles), cas par cas
    'vocational_training' pour maritime/aviation admettant dès le
    niveau CEP (IT2MIP) — inchangé depuis TRANSPORT-A.1 §5
  - Revue humaine prioritaire dans l'ordre déjà calculé par
    reports/registry/transport-tier3-human-review.csv (1.
    TIER3_CORROBORATED+NO_MATCH, 2. TIER3_CORROBORATED+cross-ministère,
    3. T3_CONFLICTING, 4. identité AMBIGUOUS, 5. T3_SINGLE_SOURCE)

MIGRATION ENUM MINTRANSPORT (§19 ci-dessus, rappel inchangé) : NON
préparée, NON exécutée ce sprint non plus — `ALTER TYPE
registry_source_ministry ADD VALUE IF NOT EXISTS 'MINTRANSPORT';`
resterait la commande exacte SI un futur sprint autorisé décidait
d'écrire directement `source_ministry`='MINTRANSPORT' plutôt que de
passer par `establishment_registry_identifiers.authority` en texte
libre (option toujours disponible sans migration, cf. §6).

MATCHING ENGINE — durci ce sprint (contrairement à TRANSPORT-A.1 qui
était resté volontairement read-only sur le moteur) : "auto" et
"autoecole" ajoutés à WEAK_GENERIC_TOKENS (pas un stopword aveugle),
voir TRANSPORT_SOURCE_CATALOG.md addendum T3 et le commentaire dédié
dans scripts/school-registry/lib/matching/engine.ts. 86/86 tests
passent (suite complète). Le faux-positif "AUTO ECOLE LEO" documenté
en TRANSPORT-A.1 est maintenant NO_MATCH.

STAGING DRY-RUN (§18 du brief, aucune écriture réelle) :
would_stage_total=17, would_duplicate_review=4, would_source_review=13,
would_cross_ministry_review=0, would_out_of_scope=0,
would_insert_clean_approvable=0 (toujours 0). Détail complet :
reports/registry/transport-tier3-staging-dry-run.json.

READY_FOR_TRANSPORT_A2_T3_STAGING (nouveau sprint distinct requis) :
YES, sous réserve de l'autorisation explicite ci-dessus.
READY_FOR_TRANSPORT_PROMOTION : NO (inchangé, ne changera pas tant
qu'aucune source officielle MINT nominative n'existe).
```

## 20. Addendum TRANSPORT-A.2-T3 (2026-08-21) — préparation/revalidation/dry-run import staging, ÉCRITURE RÉELLE NON EFFECTUÉE

```
SPRINT DISTINCT, même jour, même opérateur. Contrairement à TRANSPORT-A.1-T3
(pipeline discovery) ce sprint construit le SCRIPT D'IMPORT RÉEL
(`scripts/school-registry/transport-a2-t3-import.ts`) et son garde-fou dédié
(`scripts/school-registry/lib/transportA2ImportGuard.ts`, phrase de
confirmation `IMPORT_TRANSPORT_TIER3_TO_STAGING`, distincte de toute phrase
de promotion existante) — mais s'arrête au dry-run et aux TESTS DE REFUS
(brief §16). AUCUNE autorisation humaine nommée explicite et distincte n'a
été reçue ce sprint (le brief lui-même n'en constitue pas une) : 0 écriture
`establishment_import_staging`, 0 migration DDL exécutée, vérifié en direct
avant ET après chaque tentative de refus (voir
`reports/registry/transport-a2-t3-guard-refusal-tests.json`, 8 scénarios en
conditions RÉELLES d'exécution CLI, staging_count=2366 inchangé sur toute
la séquence).

REVALIDATION COMPLÈTE (§6-9 du brief), pas une simple relecture de
TRANSPORT-A.1-T3 :
  - Provenance (§6) : seuls 5/17 candidats ont une preuve de provenance
    COMPLÈTE (URL + sha256 + classe source) ce sprint — EMIPAC, IT2MIP,
    Astrale, Le Paquebot, EFO (tous avec un fichier manifeste
    `data/registry/raw/transport-tier3-v1/manifest.json` dédié). Les 12
    autres candidats reposent sur une citation TRANSPORT-A/TRANSPORT-A.1
    sans snapshot/sha256 dédié à cette entrée précise (ex. 6 auto-écoles
    partagent la même page de résultats africannuaire.com, jamais
    snapshotée elle-même) — documenté candidat par candidat dans
    `reports/registry/transport-a2-t3-review.csv`, jamais masqué ni
    inventé. Conséquence : ces 12 candidats restent au minimum
    SOURCE_REVIEW (jamais promus à une classification plus favorable sur
    la base d'une provenance incomplète).
  - Matching (§8) : moteur relancé À FROID contre les établissements LIVE
    ET le STAGING existant (TRANSPORT-A.1-T3 n'avait testé que le live).
    Résultat : METROPOLITAINE INTERNATIONALE SCES (TC-08) obtient
    maintenant un PROBABLE_MATCH via le staging existant (contre
    "COMPLEXE SCOLAIRE INTERNATIONALE LA GAIETE") — signal nouveau, non
    vu en TRANSPORT-A.1-T3, documenté dans
    `reports/registry/transport-a2-t3-matching-fresh.csv`. Totaux frais :
    NO_MATCH=12, PROBABLE_MATCH=4, AMBIGUOUS=1, EXACT_*=0.
  - Cross-ministère (§9) : Fleet Management Academy revérifié EN DIRECT
    (requête staging fraîche par mots-clés) — 0 ligne MINEFOP staging
    correspondante trouvée ce sprint (le lien MINEFOP documenté vient
    uniquement de la source TRANSPORT-A rapportée, non re-corroboré par
    une nouvelle source indépendante ce sprint). 0 ligne MINESUP live
    pertinente trouvée.

CLASSIFICATION AFFINÉE (§11 du brief demande 5 états distincts, plus fin
que le bucketing à 3 catégories de TRANSPORT-A.1-T3) : SOURCE_REVIEW=12,
DUPLICATE_REVIEW=3 (Auto École Française, EMIPAC, IT2MIP),
IDENTITY_REVIEW=2 (METROPOLITAINE INTERNATIONALE SCES — catégorie
d'entité incertaine ET signal de correspondance staging ; Fleet
Management Academy — AMBIGUOUS en matching frais), CROSS_MINISTRY_REVIEW=0,
CONFLICT_REVIEW=0. clean_approvable=0 (assertion runtime passée, §7/§11).
Dry-run réconcilié exactement : 17/17. would_insert=17, would_skip
(ALREADY_LIVE_REVIEW)=0.

MIGRATION ENUM MINTRANSPORT (§3-4 du brief) : préparée, NON exécutée.
Fichier exact : `supabase/migrations/0022_transport_source_ministry_enum.sql`
(`ALTER TYPE registry_source_ministry ADD VALUE IF NOT EXISTS
'MINTRANSPORT';` — non destructive, 0 établissement affecté, 0 ligne
staging affectée). Cet environnement n'a pas d'accès Postgres direct
(pas de psql/pooler exécutable depuis ce poste) — même limitation déjà
rencontrée pour la migration 0021, qui avait dû être appliquée
manuellement par jean-merlain via le SQL Editor du Dashboard Supabase
(projet `umcwwynrftidytxgqkwi`). Vérification post-migration (§4) : ne
JAMAIS supposer le succès depuis la seule sortie SQL — relancer
`checkMintransportEnum()` (requête REST GET sur
`establishment_import_staging?source_ministry=eq.MINTRANSPORT`, HTTP 400
22P02 = absent, autre code = présent) et confirmer aucune ligne de test
permanente laissée derrière.

GARDE-FOU D'IMPORT (§16 du brief) — testé en conditions RÉELLES, pas
seulement unitaires : le garde-fou refuse même une commande où TOUT le
reste est correct (opérateur réel, approbateur distinct, count frais=17,
checksum réel) tant que l'enum MINTRANSPORT n'est pas confirmé présent en
direct — scénario 8 de
`reports/registry/transport-a2-t3-guard-refusal-tests.json`. Ceci
garantit qu'une écriture réelle est structurellement impossible tant que
la migration §3-4 n'a pas été appliquée, indépendamment de toute
autorisation humaine par ailleurs correcte.

RAW_DATA CONTRACT (§12) : chaque ligne préparée porte
`raw_data.transport_tier3` complet (pipeline_version, candidate_id,
entity_family, tier3_confidence, source_count, independent_source_count,
sources[], source_independence, matching_decision (frais),
cross_ministry_decision, activity_status, official_corroboration_status,
review_reason, provenance{url, sha256, complete}). IMPORTANT — écart de
compatibilité Review Center documenté honnêtement (pas corrigé ce sprint,
brief §20 interdit la refonte) : la classification vit sous
`raw_data.transport_tier3.staging_classification`, PAS sous la clé
`raw_data.classification` déjà lue par l'UI pour les lots MINSANTE — voir
`reports/registry/transport-a2-t3-review-center-qa.json`, "smallest
future ui change" (dupliquer la valeur au niveau racine `raw_data` au
moment d'un futur import réel, ou étendre l'UI).

IDENTIFIANTS (§13) : 0 identifiant officiel inventé, 0 ligne
`establishment_registry_identifiers` prévue pour ce batch — y compris
pour Fleet Management Academy, dont l'identifiant MINEFOP N°000471 réel
(confirmé par TRANSPORT-A, pas re-vérifié indépendamment ce sprint) reste
préservé UNIQUEMENT dans `raw_data.transport_tier3` à titre documentaire,
jamais réécrit en `official_identifier` structuré ni en ligne
`establishment_registry_identifiers` sans re-corroboration primaire
fraîche.

IDEMPOTENCE (§18) : identité stable prévue = `transport-tier3:v1:<candidate_id>`
(jamais une clé floue) — un futur script d'import authentifié doit
sauter toute ligne dont ce fingerprint existe déjà, jamais réinsérer.

RAPPORTS PRODUITS CE SPRINT : `transport-a2-t3-approval.json`,
`transport-a2-t3-dry-run.json`, `transport-a2-t3-import-summary.json`,
`transport-a2-t3-review.csv`, `transport-a2-t3-cross-ministry.csv`,
`transport-a2-t3-post-reconciliation.json`,
`transport-a2-t3-review-center-qa.json`,
`transport-a2-t3-matching-fresh.csv` (additionnel),
`transport-a2-t3-guard-refusal-tests.json` (additionnel).

DECISION (§26 du brief) : A — TIER3_STAGING_IMPORT_COMPLETE au sens
PRÉPARATION (revalidation + dry-run + garde-fou entièrement construits et
testés) — PAS au sens écriture réelle effectuée. READY_FOR_TRANSPORT_
PROMOTION reste NO (inchangé).

ÉCRITURE RÉELLE : PRÊTE TECHNIQUEMENT, EN ATTENTE D'AUTORISATION HUMAINE
NOMMÉE EXPLICITE ET DISTINCTE (brief §0) — non obtenue ce sprint. Deux
prérequis SÉPARÉS restent à lever avant toute exécution réelle :
  1. Migration `supabase/migrations/0022_transport_source_ministry_enum.sql`
     appliquée manuellement (Supabase Dashboard SQL Editor) et
     re-vérifiée en direct.
  2. Autorisation nommée explicite (ex. "Je, <nom>, autorise
     explicitement...", sur le modèle du sprint MINSANTE-H), avec un
     `--approved-by` distinct de l'opérateur `jean-merlain`.
Commande exacte prévue une fois ces deux prérequis levés :
`npx tsx scripts/school-registry/transport-a2-t3-import.ts --commit
--expected-count=17 --approval-checksum=<voir
reports/registry/transport-a2-t3-approval.json> --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING"
--operator="jean-merlain" --approved-by="<personne distincte réelle>"`.

NOTE DE SUPERSESSION (voir §21 ci-dessous, ne pas réutiliser cette commande
telle quelle) : la commande exacte ci-dessus est OBSOLÈTE — le sprint
TRANSPORT-A.2-T3-WRITE a découvert qu'un maximum de 12 des 17 candidats
sont réellement insérables (contrainte NOT NULL sur `source_url`), donc
`--expected-count=17` serait désormais REFUSÉ par construction. §21 documente
la commande et la sémantique à jour.
```

## 21. Addendum TRANSPORT-A.2-T3-WRITE (2026-08-21) — implémentation réelle de l'écriture staging, TOUJOURS 0 ÉCRITURE CE SPRINT

```
SPRINT DISTINCT, même jour, même opérateur. Objectif : remplacer le
SAFETY STOP de `transport-a2-t3-import.ts` par une VRAIE branche d'écriture
`establishment_import_staging`, tout en garantissant `staging_writes=0` et
`production_writes=0` à la fin de CE sprint (aucune autorisation humaine
nommée distincte n'a été donnée — le brief lui-même n'en constitue pas
une, exactement comme pour TRANSPORT-A.2-T3). Vérifié en direct au début
ET à la fin : establishments=2248, staging=2366, registry_identifiers=2242,
MINTRANSPORT staging=0, INCHANGÉ (voir
`reports/registry/transport-a2-t3-write-preflight.json` §21 "UNCHANGED=true").

### 21.1 Nouvelle stratégie registre — Présence / Identité / Vérification officielle

Trois notions désormais strictement distinctes dans tout le pipeline (et
documentées comme telles pour tout futur registre, pas seulement
Transport) :

  1. PRÉSENCE/DÉCOUVERTE — "cet établissement existe probablement", portée
     par `presence_confidence` (SINGLE_SOURCE / MULTI_SOURCE_WEAK /
     CORROBORATED / CONFLICTING), dérivée UNIQUEMENT du nombre/de
     l'indépendance des sources Tier 3.
  2. IDENTITÉ — "on sait de quelle institution canonique il s'agit, et si
     elle existe déjà dans l'annuaire", portée par `identity_confidence`
     (UNRESOLVED / PROBABLE / RESOLVED / CONFLICTING), dérivée du matching
     FRAIS (live+staging, jamais live-only) et de la clarté de l'entité
     elle-même (ex. TC-08 reste UNRESOLVED : son PROPRE type d'entité est
     incertain, indépendamment de tout matching).
  3. VÉRIFICATION OFFICIELLE — "une autorité compétente confirme
     officiellement", portée par `official_verification` (UNVERIFIED /
     OFFICIAL_SOURCE_FOUND / OFFICIALLY_VERIFIED).

RÈGLE ABSOLUE implémentée comme une GARANTIE STRUCTURELLE, pas une
convention : `computeOfficialVerification()`
(`scripts/school-registry/lib/transportTier3TrustModel.ts`) a pour type de
retour `Tier3OfficialVerification = Exclude<OfficialVerification,
"OFFICIALLY_VERIFIED">` — la valeur "OFFICIALLY_VERIFIED" n'est même pas
représentable en sortie de cette fonction, quel que soit le nombre ou la
force des sources Tier 3 en entrée (testé explicitement, y compris avec des
entrées adversariales imitant un vocabulaire "vérifié", test N de
`transportTier3TrustModel.test.ts`). Résultat sur les 17 candidats de ce
sprint : `official_verification`=UNVERIFIED pour les 17/17 (aucune source
Tier 3 de ce batch n'a de `official_corroboration_status` autre que
NOT_SEARCHED), `officially_verified_automatically`=0.

### 21.2 publication_readiness — informatif uniquement, ne promeut rien

`computePublicationReadiness()` (même fichier) est une fonction générique
(ne référence aucun ministère précis) et testable produisant
PUBLISHABLE_UNVERIFIED / REVIEW_REQUIRED / REJECTED. Critères conservateurs
implémentés dans cet ordre : PII détecté -> REJECTED ; présence ou identité
CONFLICTING -> REVIEW_REQUIRED (jamais publishable) ; identité UNRESOLVED
-> REVIEW_REQUIRED ; doublon non résolu -> REVIEW_REQUIRED ; chevauchement
inter-ministériel non résolu -> REVIEW_REQUIRED ; provenance incomplète ->
REVIEW_REQUIRED ; sinon, identité RESOLVED -> PUBLISHABLE_UNVERIFIED.
`official_verification` N'INTERVIENT JAMAIS dans ce calcul (testé
explicitement : même résultat quelle que soit sa valeur) — son absence
reste seulement VISIBLE dans le payload, jamais bloquante ni promotrice.

CE QUE PUBLISHABLE_UNVERIFIED NE SIGNIFIE PAS : ni agréé, ni reconnu MINT,
ni vérifié officiellement, ni CLEAN_APPROVABLE, ni safeForAutoLink. Cela ne
change NI `establishments` NI le statut de revue en staging — c'est un
signal purement informatif pour une décision humaine future, potentiellement
distante de ce sprint, qui pourrait un jour publier l'établissement dans
l'annuaire avec un statut explicite NON VÉRIFIÉ. Aucun mécanisme de
publication automatique n'existe ni n'est ajouté ce sprint.

Résultat sur les 17 candidats : PUBLISHABLE_UNVERIFIED=3 (TC-01 Auto École
Astrale, TC-13 Le Paquebot, TC-15 EFO/CCAA — tous NO_MATCH frais,
cross-ministère NEW, provenance URL+sha256+classe complète, aucune PII),
REVIEW_REQUIRED=14, REJECTED=0. Détail par candidat :
`reports/registry/transport-a2-t3-write-publication-readiness.csv`.

### 21.3 Découverte technique : contrainte NOT NULL `source_url`, 12/17 réellement insérables

`establishment_import_staging.source_url` est `NOT NULL` (migration 0006).
5 des 17 candidats approuvés (TC-09, TC-10, TC-14, TC-16, TC-17 — Fleet
Management Academy incluse) n'ont AUCUNE URL de source localisable dans les
manifestes `transport-tier3-v1`/`transport-a1` revérifiés ce sprint. Plutôt
que d'inventer une URL placeholder (interdit — principe absolu du
commentaire de migration 0006, "jamais un établissement sans pouvoir
remonter à sa source exacte"), `buildStagingInsertPayload()`
(`scripts/school-registry/lib/transportA2StagingPayload.ts`) REFUSE
explicitement (throw) de construire une ligne sans `source_url` — le
candidat est retenu ("held back"), documenté nommément dans
`reports/registry/transport-a2-t3-write-preflight.json`
(`held_back_missing_source_url`) et dans le CSV de revue, jamais
silencieusement perdu. `maximum_future_inserts` réel pour ce batch = **12**,
PAS 17 — chiffre à utiliser pour tout futur `--expected-count`, jamais 17
tel quel (voir note de supersession §20 ci-dessus).

Même précédent déjà appliqué par `import-major-cities-to-staging.ts`
("SOURCE_VERIFIED_REVIEW SANS source_url : jamais staged") — cohérent, pas
une nouvelle règle inventée pour ce sprint.

### 21.4 Contrat de payload (`raw_data.transport_tier3`)

Chaque ligne future porte, en plus de la provenance déjà établie par
TRANSPORT-A.2-T3 (§20 ci-dessus, inchangée) : `presence_confidence`,
`identity_confidence`, `official_verification`, `publication_readiness`,
`cross_ministry_evidence[]`, `batch_checksum`, `approval_checksum`,
`import_provenance`. Rien n'est retiré de la provenance historique
(`sources[]`, `tier3_confidence`, `matching_decision` frais,
`cross_ministry_decision`, `provenance{url,sha256,complete}`, etc. — tous
conservés tels quels).

### 21.5 Identifiants officiels — Fleet Management Academy, sécurité renforcée

`buildStagingInsertPayload()` lève une exception si `cross_ministry_evidence`
contient un `identifier_authority` égal à "MINTRANSPORT" ou "MINT" —
impossible, par construction du code (pas seulement par convention), de
faire passer un identifiant MINEFOP comme preuve d'agrément Transport
(testé explicitement). L'identifiant MINEFOP N°000471 (19-09-2022) de Fleet
Management Academy (TC-17, actuellement held-back de toute façon faute de
`source_url`) reste réservé UNIQUEMENT à `raw_data.transport_tier3.
cross_ministry_evidence`, jamais à `official_identifier` (toujours `null`
par construction du type `StagingInsertRow`) ni à une ligne
`establishment_registry_identifiers` (toujours 0 prévue ce batch).

### 21.6 Restrictions d'écriture absolues — techniquement impossibles, pas seulement documentées

`scripts/school-registry/lib/transportA2StagingWriter.ts` est le SEUL
module de tout le pipeline capable d'un écriture réseau. Il n'exporte QUE
DEUX fonctions, toutes deux à cible fixe codée en dur :
`createTransportDataSourceRow()` -> `establishment_data_sources`
UNIQUEMENT (prérequis FK obligatoire de la table de staging), et
`insertStagingRowsOnly()` -> `establishment_import_staging` UNIQUEMENT.
Garantie vérifiée par test (pas seulement lue dans le code) : analyse
statique du texte source confirmant l'absence totale des chaînes
`/rest/v1/establishments` et `/rest/v1/establishment_registry_identifiers`
dans ce fichier, plus vérification de la surface d'export exacte (2
fonctions nommées, aucune autre), plus test à `global.fetch` mocké
confirmant que chaque fonction ne cible que son unique endpoint autorisé
(tests U et V de `transportA2StagingWriter.test.ts`).

### 21.7 Idempotence

Clé stable inchangée : `transport-tier3:v1:<candidate_id>`. Simulation pure
via `planStagingInsert()` (aucune écriture) : premier passage frais contre
staging (0 fingerprint `transport-tier3:v1:*` existant ce sprint) ->
12 lignes seraient insérées ; second passage théorique (fingerprints du
premier passage ajoutés à l'ensemble existant) -> 0 lignes insérées
(assertion runtime dans `transport-a2-t3-write-preflight.ts`, échoue le
script si jamais > 0). Jamais testé par deux écritures réelles suivies
d'un nettoyage — uniquement par simulation pure et par mocks (brief §12-13).

### 21.8 Public safety — reconfirmé

`src/app/api/recherche/route.ts` lit exclusivement `.from("establishments")`
— aucune référence à `establishment_import_staging`. Seuls
`src/app/dashboard/admin/registre/page.tsx` et `src/lib/registryReview.ts`
référencent la table de staging (Review Center admin, jamais une route
publique) ; `src/lib/cameroonRegions.ts`/`cameroonMajorCities.ts` ne la
mentionnent que dans un commentaire. Staging != publication, reconfirmé par
grep direct ce sprint (`reports/registry/transport-a2-t3-write-public-safety.json`),
aucune route publique modifiée.

### 21.9 Politique de promotion future (à terme, PAS ce sprint)

Un établissement Tier 3 avec `identity_confidence`=RESOLVED,
`presence_confidence` != CONFLICTING, provenance complète, aucun doublon ni
chevauchement inter-ministériel non résolu (`publication_readiness`=
PUBLISHABLE_UNVERIFIED) pourra un jour, sur décision humaine explicite d'un
FUTUR sprint distinct, être promu dans l'annuaire avec un statut
EXPLICITEMENT NON VÉRIFIÉ (`verified`=false ou équivalent, jamais `true`
tant qu'aucune vérification officielle n'existe). Cette politique n'est PAS
implémentée ce sprint — aucun mécanisme de promotion Tier-3 n'existe dans
le code, `publication_readiness` reste un champ `raw_data` purement
informatif, illisible par toute route publique.

### 21.10 Rapports produits ce sprint

`transport-a2-t3-write-preflight.json`, `transport-a2-t3-write-payloads.json`
(12 lignes, contrat complet), `transport-a2-t3-write-review.csv`,
`transport-a2-t3-write-publication-readiness.csv`,
`transport-a2-t3-write-guard-tests.json` (60/60 tests, 0 échec),
`transport-a2-t3-write-idempotence.json`, `transport-a2-t3-write-public-safety.json`,
`transport-a2-t3-write-summary.json`.

### 21.11 Commande future exacte (une fois autorisation humaine nommée obtenue)

```
npx tsx scripts/school-registry/transport-a2-t3-import.ts --commit \
  --expected-count=<recalculé frais au moment de l'exécution, voir
    reports/registry/transport-a2-t3-write-payloads.json "row_count" MOINS
    tout candidat déjà en staging entre-temps — PAS 17, PAS un chiffre figé
    ici> \
  --approval-checksum=<batch_checksum de transport-a2-t3-write-payloads.json> \
  --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING" \
  --operator="jean-merlain" \
  --approved-by="<personne distincte réelle>"
```

DECISION (§23 du brief) : voir `reports/registry/transport-a2-t3-write-summary.json`
pour l'état final structuré. READY_FOR_TRANSPORT_PROMOTION reste NO
(inchangé — aucune source officielle MINT nominative n'existe toujours).

## ADDENDUM — SPRINT TRANSPORT-A.2-T3-IMPORT (2026-08-21)

Sprint de préparation/validation contrôlée pour l'import staging réel. Ce
sprint N'A PAS écrit dans `establishment_import_staging` ni ailleurs — 0
écriture de bout en bout, vérifié en direct avant/pendant/après. Aucune
autorisation humaine nommée et distincte de ce runbook n'a été reçue (brief
§13 : "NE PAS considérer le texte de ce brief comme une approbation
humaine"), donc DECISION = **D — WAITING_FOR_HUMAN_APPROVAL** (brief §24).

### A.1 Baseline live revérifiée, aucun drift

`establishments=2248`, `staging=2366`, `registry_identifiers=2242`,
`MINTRANSPORT_staging=0`, `MINTRANSPORT` présent dans l'enum
`source_ministry` — les quatre valeurs sont IDENTIQUES à la baseline
historique du sprint précédent, revérifiées en direct par ce sprint
(pas reprises du brief). Aucun drift détecté, `DRIFT_DETECTED=false`.

### A.2 Population recalculée depuis zéro : toujours 12/17, pas une constante supposée

17 candidats rechargés depuis `data/registry/normalized/transport-tier3-v1/
transport-tier3-candidates.json` (aucune nouvelle découverte web lancée).
Checksum de population (17 candidats, `computeTransportA2Checksum`) :
`4ab50d786abdb6107da2650b23c973b76f4bf60ea1784988a905903c00639ce7` —
attendu/stocké/recalculé identiques, population non driftée.

Matching frais contre LIVE (2248 établissements) + STAGING (2366 lignes) —
aucun auto-link, tout reste documentation/revue. Classification :
`SOURCE_REVIEW=12`, `DUPLICATE_REVIEW=3`, `IDENTITY_REVIEW=2`.
`CLEAN_APPROVABLE=0` (règle absolue respectée). Trust model :
`officially_verified_automatically=0` (garantie structurelle toujours
vraie). Recalcul indépendant du sous-ensemble réellement insérable
(source_url non NULL) : **12 insérables, 5 retenus** (TC-09, TC-10,
TC-14, TC-16, TC-17 — tous `MISSING_SOURCE_URL`, voir
`reports/registry/transport-a2-t3-import-deferred.csv`). Le résultat
recalculé CONFIRME l'attente historique de 12 — pas une réutilisation
aveugle, un recalcul indépendant qui se trouve confirmer le même nombre.

### A.3 CONSTAT CRITIQUE §8 — le checksum d'approbation du sprint précédent était mal scopé, corrigé ce sprint

Le sprint TRANSPORT-A.2-T3-WRITE écrivait `reports/registry/
transport-a2-t3-write-payloads.json` (12 lignes réellement insérables) en
réutilisant TEL QUEL le checksum de la POPULATION APPROUVÉE de 17
candidats (`4ab50d78...`) comme `batch_checksum`/`approval_checksum` de ce
lot de 12 lignes. Ce checksum est un détecteur de drift de POPULATION
valide (les 17 candidats approuvés n'ont pas changé) mais ne porte AUCUNE
information sur le contenu exact des 12 lignes réellement écrites
(matching frais par ligne, trust model, classification, provenance,
preuve cross-ministry). Un humain approuvant "checksum 4ab50d78..." pour
la population de 17 n'a jamais eu l'occasion d'approuver spécifiquement
le contenu exact du lot de 12 — exactement le risque identifié par le
brief §8 ("Ne pas utiliser aveuglément le checksum historique des 17
candidats comme autorisation d'écrire 12 lignes").

Corrigé ce sprint par une nouvelle fonction dédiée,
`computeInsertablePopulationChecksum()` (`scripts/school-registry/lib/
transportA2ImportGuard.ts`), qui hashe le contenu canonique exact des
lignes insérables (candidate_id, normalized_name, entity_family, city,
region, source_ministry, source_url, source sha256, presence_confidence,
identity_confidence, official_verification, publication_readiness,
review_status, matching_signal, cross_ministry_evidence, provenance),
triées par candidate_id. Nouveau checksum, calculé et triple-vérifié
(attendu/stocké après round-trip JSON/recalculé sur input inversé) ce
sprint :

```
3b0d681a71ceea8a7a5099209103f4e81ab4857facd649eb9b68086c14f804d4
```

`reports/registry/transport-a2-t3-write-payloads.json` a été régénéré
avec ce nouveau checksum (contenu métier des 12 lignes strictement
inchangé — seuls `batch_checksum`/`approval_checksum` et leur copie
embarquée dans `raw_data.transport_tier3` diffèrent), car
`transport-a2-t3-import.ts` lit ce fichier comme unique source de vérité
pour `--approval-checksum`. L'ancien checksum de population
(`4ab50d78...`) reste valide et documenté, mais UNIQUEMENT comme
détecteur de drift des 17 candidats approuvés — plus jamais comme
`--approval-checksum` d'un lot d'insertion. Voir
`reports/registry/transport-a2-t3-import-approval.json` pour le snapshot
canonique complet et `scripts/school-registry/lib/__tests__/
transportA2ImportGuard.test.ts` (6 nouveaux tests) pour la couverture.

### A.4 Cross-ministry revalidé, aucune résolution automatique

TC-12 (IT2MIP) : `DUPLICATE_REVIEW`, `cross_ministry_decision=AMBIGUOUS`,
maintenu REVIEW_REQUIRED. TC-17 (Fleet Management Academy) : autorité
MINEFOP (identifiant réel N°000471 conservé en métadonnée uniquement,
jamais en `official_identifier` MINTRANSPORT), non stagé ce sprint
(source_url manquante). Aucune fusion/résolution automatique effectuée.
Voir `reports/registry/transport-a2-t3-import-cross-ministry.csv`.

### A.5 Dry-run réel + tests de refus réels, tous verts

Dry-run : invocation RÉELLE de `transport-a2-t3-import.ts` (sans
`--commit`) contre Supabase live — `Would insert staging: 12`, `Would
insert establishments: 0`, `Would insert registry identifiers: 0`,
staging avant/après inchangé (2366 → 2366). `CLEAN_APPROVABLE` n'est pas
une condition d'entrée en staging (confirmé, aucune des 12 lignes n'est
CLEAN_APPROVABLE et toutes restent éligibles).

8 scénarios de refus rejoués EN CONDITIONS RÉELLES contre le script CLI
réel et Supabase live, avec les valeurs fraîches de CE sprint (compte=12,
checksum dédié ci-dessus — jamais les valeurs 17/4ab50d78 de l'ancien
sprint TRANSPORT-A.2-T3, périmées) : absence de `--commit`, phrase
incorrecte, `--expected-count` incorrect, checksum incorrect,
auto-approbation, opérateur incorrect, `--approved-by` absent. Les 8 ->
`REFUSED`, 0 ligne nette écrite (`staging: 2366 → 2366` sur l'ensemble des
scénarios). Voir `reports/registry/transport-a2-t3-import-guard-refusal-tests.json`.
66/66 tests unitaires guard/trust-model/payload/writer passent (60 + 6
nouveaux tests `computeInsertablePopulationChecksum`).

### A.6 QA sans régression

`npx tsc` (app + `scripts/school-registry`) : clean. Tests : 302/302
(registry, incluant les 6 nouveaux) + 40/40 (app) = 342/342, 0 échec.
`npx next build` : succès. Aucune régression.

### A.7 Rapports produits ce sprint (préparation/dry-run uniquement, aucun commit)

`transport-a2-t3-import-approval.json` (nouveau snapshot dédié §8,
triple-vérifié), `transport-a2-t3-import-preflight.json`,
`transport-a2-t3-import-dry-run.json`, `transport-a2-t3-import-execution.json`
(`write_performed_this_sprint=false`), `transport-a2-t3-import-reconciliation.json`
(non applicable — aucune écriture), `transport-a2-t3-import-idempotence.json`,
`transport-a2-t3-import-public-safety.json`, `transport-a2-t3-import-deferred.csv`
(5 candidats, `MISSING_SOURCE_URL`, remédiation), `transport-a2-t3-import-matching-fresh.csv`,
`transport-a2-t3-import-cross-ministry.csv`, `transport-a2-t3-import-guard-refusal-tests.json`.

### A.8 Commande future exacte (checksum/compte RECALCULÉS ce sprint — remplace celle de 21.11 ci-dessus)

```
npx tsx scripts/school-registry/transport-a2-t3-import.ts --commit \
  --expected-count=12 \
  --approval-checksum=3b0d681a71ceea8a7a5099209103f4e81ab4857facd649eb9b68086c14f804d4 \
  --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING" \
  --operator="jean-merlain" \
  --approved-by="<personne distincte réelle, jamais jean-merlain>"
```

**AVERTISSEMENT** : ce compte (12) et ce checksum ne sont valides QUE tant
que le staging/live n'a pas évolué depuis ce sprint (2026-08-21) et que le
fichier `transport-a2-t3-write-payloads.json` n'a pas été régénéré depuis.
Si le temps a passé avant l'exécution autorisée, relancer
`transport-a2-t3-import-preflight.ts` pour obtenir un compte/checksum
frais — ne jamais réutiliser aveuglément ces valeurs après un délai
significatif ou après tout changement connu de staging/live.

### A.9 Drift final détecté et documenté (non bloquant)

Une revérification live finale juste avant le commit a trouvé
`establishments=2249` (contre `2248` au moment du preflight quelques
heures plus tôt) — `staging`, `registry_identifiers` et
`MINTRANSPORT_staging` restent exactement inchangés. Cause identifiée :
une ligne `Écoles237 QA — School A2` (`source_ministry=null`,
`main_category=primaire`, créée le 2026-08-21T22:32:10Z), un fixture de
QA externe sans rapport avec le pipeline Transport, créée par un
processus externe pendant la session, jamais par un script de ce sprint
(aucun de ses scripts n'écrit dans `establishments`). Zéro chevauchement
de mot-clé avec les 12 candidats insérables (vérifié
programmatiquement). Ne concerne pas la population Transport, ne rend
pas le matching frais obsolète. Voir
`reports/registry/transport-a2-t3-import-final-baseline-recheck.json`.

DECISION CE SPRINT (§24 du brief) : **D — WAITING_FOR_HUMAN_APPROVAL**.
Aucune approbation humaine nommée et distincte reçue. STOP après ce
sprint, per brief §25 — REGISTRY-NATIONAL-A n'est PAS commencé.
```
