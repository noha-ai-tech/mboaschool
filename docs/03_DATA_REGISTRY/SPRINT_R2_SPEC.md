# SPRINT R.2 — Spécification officielle

> Ce fichier remplace toute exploration informelle de SPRINT R.2 menée avant
> son adoption (audits ad hoc §5/§20-22/§24 du 2026-08-18 matin). Le contenu
> de ces audits reste valide et recoupe des exigences de cette spec — voir
> note de correspondance en bas de fichier — mais cette spécification est
> désormais la seule source d'autorité pour la suite du sprint.
>
> Adopté : 2026-08-18. Opérateur : jean-merlain.

---

```
################################################################################
# ÉCOLES237 — SPRINT R.2
# MAJOR CITIES SECONDARY COMPLETENESS + SEARCH ENGINE V2
################################################################################

MISSION

Compléter la couverture des collèges et établissements secondaires des
principales grandes villes du Cameroun AVANT de commencer MINEDUB.

Ce sprint doit également rendre le moteur de recherche Écoles237 capable de
fonctionner proprement avec plusieurs milliers puis plusieurs dizaines de
milliers d'établissements.

Ce sprint intervient APRÈS :

SPRINT R.1 — MINESEC NATIONAL REGISTRY V1 CLOSED

État de référence connu à la fin de R.1 :

MINESEC unique : 1942
MINESEC live : 1938
Official ID coverage : 1941/1942
Region coverage : 10/10
Category coverage : 100%

Establishments total après R.1 : 1986

Remaining identity review : 1
Remaining duplicate_review : 2

MINESEC V1 est maintenant considéré comme FROZEN.

IMPORTANT :

Ne pas reconstruire MINESEC V1.

Ne pas modifier silencieusement :

data/registry/master/minesec-national-v1-final.json

Toute nouvelle donnée découverte dans ce sprint doit être considérée comme
un ENRICHISSEMENT / COMPLETENESS BATCH séparé.

Le sprint comporte DEUX MISSIONS :

A — MAJOR CITIES SECONDARY COMPLETENESS
B — SEARCH ENGINE V2 / SCALABILITY


################################################################################
# 0. TEAM SYNCHRONIZATION
################################################################################

Écoles237 est développé en parallèle par deux opérateurs :

- Eddy
- Jean Merlain

CURRENT OPERATOR:

jean-merlain

Avant toute modification :

git fetch

git status

git branch --show-current

git rev-parse HEAD

git rev-parse origin/main

Afficher :

LOCAL HEAD:
REMOTE HEAD:
COMMITS AHEAD:
COMMITS BEHIND:
WORKTREE CLEAN:

Si remote contient des commits absents localement :

STOP.

Ne pas commencer le sprint avant synchronisation sûre.

Ne jamais :

- écraser le travail d'Eddy ;
- reset --hard sans autorisation ;
- force push ;
- supprimer des changements non commités d'un autre opérateur.

Si conflit :

STOP et rapporter.


################################################################################
# 1. OPERATOR TRACEABILITY
################################################################################

Pour tous les rapports sensibles générés pendant ce sprint enregistrer :

operator = jean-merlain

Ne jamais déduire l'opérateur depuis :

Git author
Windows username
machine hostname
Claude session

Pour toute future opération production distinguer :

operator
approved_by
git_author

IMPORTANT :

approved_by doit être NULL / absent si aucune personne n'a explicitement
approuvé l'opération.

Ne jamais écrire :

approved_by = "mission"
approved_by = "prompt"
approved_by = "Claude"
approved_by = "instructions"


################################################################################
# 2. DATABASE SAFETY
################################################################################

Projet Supabase attendu :

umcwwynrftidytxgqkwi

Ne jamais afficher :

service role key
database password
JWT secret
API secrets

Lire le project ref depuis la configuration sécurisée existante.

Avant tout :

compter réellement :

establishments
establishment_import_staging

Ne pas supposer que 1986 est encore la valeur actuelle.

Afficher :

DATABASE BASELINE

Establishments:
Staging:
MINESEC live:
MINESEC staging:

Si une différence importante existe par rapport à R.1 :

STOP.

Expliquer avant de continuer.


################################################################################
# 3. PRODUCTION WRITES POLICY
################################################################################

Pendant R.2 :

PUBLIC PRODUCTION INSERTS = INTERDITS

Ne pas promouvoir de nouveaux établissements vers :

establishments

Ne pas supprimer d'établissement.

Ne pas fusionner automatiquement.

Ne pas modifier :

owner_id
is_verified
verification_status
forfait
plan
subscription
school_images
cover_image_url
applications
claims
personnel
payroll
attendance

Nouveaux candidats :

STAGING UNIQUEMENT.

R.3 sera le sprint de promotion contrôlée.


################################################################################
# 4. MINESEC V1 FREEZE
################################################################################

Le snapshot :

data/registry/master/minesec-national-v1-final.json

est désormais immuable.

Ne pas l'écraser.

Ne pas ajouter directement les nouveaux candidats R.2 dedans.

Créer un batch séparé :

MAJOR_CITIES_SECONDARY_COMPLETENESS_V1

Toute évolution ultérieure de MINESEC V1 devra être explicitement :

V1.1

ou un nouveau batch.


################################################################################
# 5. OBJECTIF GÉOGRAPHIQUE
################################################################################

Prioriser les principales villes du Cameroun.

PRIORITÉ A — MÉTROPOLES

Douala
Yaoundé

PRIORITÉ B — GRANDS PÔLES RÉGIONAUX

Bafoussam
Bamenda
Buea
Limbe
Kumba
Garoua
Maroua
Ngaoundéré
Bertoua
Ebolowa

PRIORITÉ C — VILLES STRATÉGIQUES

Kribi
Dschang
Foumban
Nkongsamba
Edéa
Kousséri
Mbouda
Bangangté
Mokolo
Sangmélima
Batouri
Abong-Mbang
Mamfe
Kumbo

Si une autre grande ville apparaît clairement dans les sources officielles,
elle peut être ajoutée au rapport.

Ne pas inventer artificiellement une liste gigantesque.


################################################################################
# 6. RÉGIONS CANONIQUES
################################################################################

Réutiliser exclusivement la fonction canonique créée dans Sprint R.

Valeurs :

Adamaoua
Centre
Est
Extrême-Nord
Littoral
Nord
Nord-Ouest
Ouest
Sud
Sud-Ouest

Ne pas introduire :

CENTRE
LITTORAL
Grand Nord
Zone anglophone

comme valeurs administratives stockées.

Grand Nord et Zone anglophone restent des filtres produit uniquement.


################################################################################
# 7. DÉFINITION DU PÉRIMÈTRE "COLLÈGES"
################################################################################

La demande utilisateur parle de "collèges".

Ne pas limiter la collecte aux établissements dont le nom commence
littéralement par "Collège".

Le périmètre secondaire comprend selon la taxonomie existante :

- collèges privés ;
- collèges confessionnels ;
- collèges bilingues ;
- lycées ;
- CES ;
- établissements secondaires généraux ;
- établissements secondaires techniques si déjà couverts par la taxonomie ;
- secondary schools ;
- high schools ;
- bilingual colleges ;
- technical colleges.

Ne pas créer une nouvelle catégorie arbitraire.

Réutiliser la taxonomie Écoles237.


################################################################################
# 8. NE PAS RECRÉER LES 1942
################################################################################

Avant toute recherche extérieure :

auditer le registre actuel.

Pour chaque ville calculer :

live establishments
staging establishments
secondary establishments
official IDs
city populated
city NULL
locality populated
possible city aliases

Créer :

reports/registry/major-cities-current-coverage.csv


################################################################################
# 9. CITY NULL IS NOT ABSENT
################################################################################

IMPORTANT.

Un établissement n'est PAS considéré absent uniquement parce que :

city IS NULL.

Beaucoup de données MINESEC ont une ville/localité incomplète.

Avant de déclarer un établissement nouveau, matcher contre :

official_id
official_name
normalized_name
region
raw_locality
normalized_locality
existing city
aliases

Ne jamais créer un doublon parce que city manque.


################################################################################
# 10. DOUALA — DEEP COVERAGE
################################################################################

Douala doit recevoir l'audit le plus approfondi.

Analyser autant que possible :

Douala I
Douala II
Douala III
Douala IV
Douala V
Douala VI

mais uniquement lorsque les sources permettent cette distinction.

Créer une notion produit :

major_city = Douala

sans remplacer l'arrondissement administratif réel.

Chercher :

collèges
lycées
CES
secondary schools
technical colleges
bilingual colleges

Comparer systématiquement au registre existant.


################################################################################
# 11. YAOUNDÉ — DEEP COVERAGE
################################################################################

Même niveau de profondeur pour Yaoundé.

Analyser autant que possible :

Yaoundé I
Yaoundé II
Yaoundé III
Yaoundé IV
Yaoundé V
Yaoundé VI
Yaoundé VII

Créer une agrégation produit :

major_city = Yaoundé

sans écraser la géographie administrative.


################################################################################
# 12. BAFOUSSAM
################################################################################

Auditer Bafoussam profondément.

Si les données fiables permettent :

Bafoussam I
Bafoussam II
Bafoussam III

les utiliser.

Sinon :

ne rien inventer.

Chercher notamment :

Collège
College
Lycée
Lyce
CES
Institut secondaire
établissement bilingue
établissement technique


################################################################################
# 13. ZONE ANGLOPHONE
################################################################################

Pour :

Bamenda
Buea
Limbe
Kumba
Mamfe
Kumbo

utiliser également :

College
Secondary School
High School
Bilingual College
Technical College
Government Secondary School
Government High School

Ne jamais franciser automatiquement le nom officiel.


################################################################################
# 14. GRAND NORD
################################################################################

Pour :

Ngaoundéré
Garoua
Maroua
Kousséri
Mokolo

rechercher les établissements déjà présents avant d'ajouter des candidats.

La macro-zone :

Grand Nord

=

Adamaoua
Nord
Extrême-Nord

reste uniquement un regroupement produit.


################################################################################
# 15. AUTRES VILLES
################################################################################

Appliquer la même méthode à :

Bertoua
Ebolowa
Kribi
Dschang
Foumban
Nkongsamba
Edéa
Mbouda
Bangangté
Sangmélima
Batouri
Abong-Mbang

Ne pas sacrifier la qualité pour augmenter le nombre.


################################################################################
# 16. SOURCE PRIORITY
################################################################################

Priorité des sources :

TIER 1

MINESEC officiel
registre/carte scolaire officielle
délégation régionale officielle
délégation départementale officielle

TIER 2

site officiel établissement
réseau confessionnel/institutionnel officiel
diocèse/organisation éducative officielle
autre organisme public camerounais compétent

TIER 3

sources secondaires servant uniquement à DISCOVERY.

Une source secondaire ne doit jamais suffire seule à une promotion automatique.


################################################################################
# 17. WEB RESEARCH
################################################################################

Cette mission AUTORISE la recherche web ciblée.

Pour chaque ville, rechercher les établissements potentiellement absents.

Mais :

NE PAS scraper aveuglément le web.

NE PAS importer automatiquement des résultats Google.

NE PAS considérer Google Maps comme registre officiel.

NE PAS importer automatiquement Facebook.

Les moteurs de recherche servent à découvrir des candidats.

Les candidats doivent ensuite être corroborés.


################################################################################
# 18. SOCIAL MEDIA
################################################################################

Une page Facebook/Instagram peut servir de corroboration si elle est
manifestement officielle.

Elle ne doit jamais être la seule preuve automatique pour une promotion.

Conserver éventuellement :

discovery_source

distinct de :

verification_source.


################################################################################
# 19. SOURCE PROVENANCE
################################################################################

Pour chaque candidat conserver :

official_name
normalized_name
possible_aliases
category
city
region
locality
official_id
source_name
source_url
source_type
source_checked_at
confidence
discovery_source
verification_source
existing_match
review_status


################################################################################
# 20. MATCHING — LEVEL 1
################################################################################

Premier matching :

source_ministry + official_id

Si official_id existe déjà :

ALREADY_EXISTING

Ne jamais recréer.


################################################################################
# 21. MATCHING — LEVEL 2
################################################################################

Puis :

normalized_name + region

mais ne pas fusionner automatiquement si le nom est générique.


################################################################################
# 22. MATCHING — LEVEL 3
################################################################################

Puis :

normalized_name + city/locality + category


################################################################################
# 23. MATCHING — LEVEL 4
################################################################################

Puis fuzzy matching.

Toute correspondance fuzzy devient :

REVIEW_REQUIRED

Jamais auto-merge.


################################################################################
# 24. CATEGORY-AWARE DEDUP
################################################################################

La catégorie doit participer au matching.

Exemple déjà connu :

École Publique de New Bell

et

Lycée de New Bell

ne sont PAS des doublons.

Ne jamais supprimer agressivement les préfixes au point de confondre
des catégories différentes.


################################################################################
# 25. NAME VARIANTS
################################################################################

Gérer pour recherche/matching :

Collège
College

Lycée
Lycee
Lyce

École
Ecole

Privé
Prive

Supérieur
Superieur

mais conserver official_name intact.


################################################################################
# 26. SOURCE MINISTRY
################################################################################

Si l'établissement est confirmé MINESEC :

source_ministry = MINESEC

Si une autre source institutionnelle confirme un établissement absent du
registre MINESEC :

NE PAS inventer source_ministry = MINESEC.

Utiliser la provenance réelle compatible avec le schéma.

Si le schéma ne permet pas de représenter correctement cette provenance :

STOP pour ce candidat.

Documenter le besoin.

Ne pas contourner le schéma.


################################################################################
# 27. CURRENT CITY COVERAGE
################################################################################

Pour chaque ville créer :

KNOWN LIVE
KNOWN STAGING
CITY NULL BUT LIKELY LOCAL
NEW DISCOVERED
CONFIRMED NEW
POSSIBLE DUPLICATE
REVIEW REQUIRED


################################################################################
# 28. CITY ALIASES
################################################################################

Créer une configuration partagée si nécessaire :

src/lib/cameroonMajorCities.ts

Elle peut contenir :

canonical city
region
search aliases
administrative subdivisions
language aliases

Exemple conceptuel :

Yaoundé:
  aliases:
    - Yaounde
    - Yaoundé

Douala:
    - Douala

Buea:
    - Buea

Ngaoundéré:
    - Ngaoundere
    - Ngaoundéré

Cette configuration sert à la recherche.

Elle ne doit pas inventer des données administratives.


################################################################################
# 29. NO FAKE CITY
################################################################################

Si une école n'a pas de ville certaine :

ne pas remplir artificiellement city.

Elle peut être associée à une ville uniquement dans une couche de recherche
si le rapprochement est fiable et sourcé.

La donnée canonique doit rester honnête.


################################################################################
# 30. STAGING
################################################################################

Tous les nouveaux candidats confirmés passent par :

establishment_import_staging

Créer un batch identifiable :

major-cities-secondary-completeness-v1

Aucun insert direct establishments.


################################################################################
# 31. STAGING IDEMPOTENCE
################################################################################

L'import doit être idempotent.

Relancer le script ne doit pas dupliquer.

Utiliser :

official_id si disponible

sinon fingerprint déterministe approprié.

Respecter les contraintes existantes.


################################################################################
# 32. CLASSIFICATION
################################################################################

Classifier les nouveaux candidats :

ALREADY_LIVE

ALREADY_STAGING

CLEAN_APPROVABLE

SOURCE_VERIFIED_REVIEW

DUPLICATE_REVIEW

INSUFFICIENT_SOURCE

REJECTED


################################################################################
# 33. CLEAN APPROVABLE
################################################################################

Un candidat CLEAN_APPROVABLE doit avoir :

nom fiable
région fiable
catégorie fiable
source institutionnelle fiable
aucun conflit live
aucun conflit staging
aucun duplicate_review

Si MINESEC fournit official_id :

il doit être conservé.


################################################################################
# 34. SOURCE VERIFIED REVIEW
################################################################################

Si établissement réel mais :

pas de matricule disponible

ou

source institutionnelle différente nécessitant validation,

classer :

SOURCE_VERIFIED_REVIEW

Ne pas promouvoir automatiquement.


################################################################################
# 35. CONTACT DATA
################################################################################

Si une source officielle fournit réellement :

phone
email
website

conserver éventuellement dans staging/raw_data.

Ne jamais inventer.

Ne pas écraser les coordonnées d'une fiche live existante.


################################################################################
# 36. EXISTING SCHOOL ENRICHMENT
################################################################################

Si une école existe déjà mais :

city manque
locality manque
contact manque

ne pas UPDATE automatiquement.

Créer :

reports/registry/major-cities-enrichment-proposals.csv

Colonnes :

establishment_id
official_id
field
current_value
proposed_value
source
confidence

L'enrichissement fera l'objet d'une validation séparée.


################################################################################
# 37. NO MEDIA COLLECTION
################################################################################

Ne pas collecter :

photos
logos
vidéos

dans ce sprint.

Ne pas scraper Google Images.

La couverture registre est distincte de l'enrichissement média.


################################################################################
# 38. NO RANKING
################################################################################

Ne pas inventer :

meilleure école
top école
score qualité

Popularité et qualité ne sont pas la même chose.

La mission vise la COMPLÉTUDE.


################################################################################
# 39. REPORT — DOUALA
################################################################################

Créer :

reports/registry/cities/douala-secondary-v1.csv

Colonnes :

official_name
official_id
category
city
locality
live
staging
new_candidate
source
source_type
match_type
review_status


################################################################################
# 40. REPORT — YAOUNDÉ
################################################################################

Créer :

reports/registry/cities/yaounde-secondary-v1.csv

Même structure.


################################################################################
# 41. REPORT — OTHER CITIES
################################################################################

Créer un rapport consolidé :

reports/registry/cities/major-cities-secondary-v1.csv

Inclure toutes les villes prioritaires.


################################################################################
# 42. SUMMARY
################################################################################

Créer :

reports/registry/major-cities-secondary-v1-summary.json

Pour chaque ville :

existing_live
existing_staging
city_null_candidates
discovered
confirmed_new
clean_approvable
review_required
duplicates
insufficient_source
projected_total


################################################################################
# 43. SEARCH ENGINE V2 — CRITICAL
################################################################################

SPRINT R.1 a révélé que /recherche charge actuellement environ 1989
établissements au montage.

Cette architecture NE DOIT PAS continuer.

MINEDUB pourrait faire passer Écoles237 à :

5000
10000
20000+

établissements.

Le moteur doit devenir scalable AVANT MINEDUB.


################################################################################
# 44. INTERDICTION FULL TABLE CLIENT
################################################################################

Après R.2 :

/recherche NE DOIT PLUS télécharger tous les établissements dans le navigateur.

INTERDIT :

select('*') de toute la table
puis filtrage complet côté client.

INTERDIT :

charger 2000/10000 établissements au montage.


################################################################################
# 45. SERVER-SIDE SEARCH
################################################################################

Implémenter la recherche côté serveur / base.

Réutiliser l'architecture Next.js/Supabase actuelle.

Le client doit envoyer uniquement :

query
region
city
category
page
page_size

Le serveur/base retourne uniquement la page nécessaire.


################################################################################
# 46. PAGINATION
################################################################################

Implémenter une vraie pagination serveur.

Exemple :

page size desktop :

20 à 30

page size mobile :

12 à 20

Choisir selon l'UI existante.

Ne jamais charger 1000 lignes pour afficher 20 résultats.


################################################################################
# 47. TOTAL COUNT
################################################################################

La recherche doit pouvoir retourner :

results
total_count
page
page_size

sans télécharger toutes les lignes.


################################################################################
# 48. SEARCH NORMALIZATION
################################################################################

Réutiliser :

normalizeSearchText()

du Sprint R.1.

La recherche doit rester :

accent-insensitive

Support :

lycée / lycee / lyce
école / ecole
privé / prive
supérieur / superieur
collège / college
Yaoundé / Yaounde
Ngaoundéré / Ngaoundere


################################################################################
# 49. SEARCH ALIASES
################################################################################

Les aliases doivent servir à la requête.

Ne pas modifier official_name.

Exemple :

"college douala"

doit pouvoir trouver :

"Collège ..."

et inversement.


################################################################################
# 50. WORD SEARCH
################################################################################

Conserver le comportement utile découvert dans Sprint R :

recherche mot-par-mot.

Une requête :

lycée bafoussam

ne doit pas exiger que la phrase exacte apparaisse dans une seule colonne.


################################################################################
# 51. SEARCH FIELDS
################################################################################

Rechercher de manière contrôlée dans :

name / official_name selon schéma
city
region
locality/quartier/neighborhood si existants
category

Ne pas faire de recherche coûteuse sur raw_data côté public.


################################################################################
# 52. CITY NULL SEARCH
################################################################################

La recherche doit continuer à fonctionner si :

city = NULL.

Utiliser les champs disponibles.

Mais ne pas inventer une ville.


################################################################################
# 53. DATABASE INDEX AUDIT
################################################################################

Auditer les indexes existants avant d'en créer.

Vérifier indexes sur :

name
region
city
category
official_id

Si la recherche normalisée nécessite un index :

proposer une migration additive.

Ne pas créer une migration inutile.


################################################################################
# 54. SEARCH SQL / RPC
################################################################################

Si la meilleure architecture est une fonction SQL/RPC :

elle peut être préparée.

Mais :

pas de logique opaque.

Documenter :

inputs
filters
ordering
pagination
count

Respecter RLS.


################################################################################
# 55. NO SERVICE ROLE SEARCH
################################################################################

La recherche publique ne doit jamais nécessiter service_role dans le navigateur.

Respecter les policies publiques existantes.

Aucun secret client.


################################################################################
# 56. SEARCH PERFORMANCE TARGET
################################################################################

Objectif architectural :

le coût réseau côté client doit dépendre de :

PAGE_SIZE

et non :

TOTAL_ESTABLISHMENTS.

Exemple :

20 résultats affichés

→ environ 20 établissements transférés,

pas 2000.


################################################################################
# 57. SEARCH DEBOUNCE
################################################################################

Conserver/ajouter un debounce raisonnable côté UI si recherche dynamique.

Éviter une requête réseau par caractère instantanément.

Ne pas dégrader l'expérience.


################################################################################
# 58. URL SEARCH STATE
################################################################################

Si l'architecture existante le permet :

conserver query/filtres/page dans URL.

Exemple conceptuel :

/recherche?q=college&region=Littoral&page=2

Cela permet :

partage
back button
SEO/navigation

Ne pas casser les URLs existantes.


################################################################################
# 59. SEARCH EMPTY STATE
################################################################################

Si aucun résultat :

ne pas afficher une erreur.

Afficher :

Aucun établissement trouvé

avec possibilité de modifier les filtres.


################################################################################
# 60. SEARCH QA — DOUALA
################################################################################

Tester :

college douala
collège douala
lycee douala
lycée douala
secondary school douala

Rapporter le nombre réel.


################################################################################
# 61. SEARCH QA — YAOUNDÉ
################################################################################

Tester :

college yaounde
collège yaoundé
lycee yaounde
lycée yaoundé

Rapporter le nombre réel.


################################################################################
# 62. SEARCH QA — BAFOUSSAM
################################################################################

Tester :

college bafoussam
collège bafoussam
lyce bafoussam
lycée bafoussam


################################################################################
# 63. SEARCH QA — ANGLOPHONE
################################################################################

Tester :

college bamenda
secondary school bamenda

college buea
secondary school buea

college limbe
secondary school limbe

college kumba
secondary school kumba


################################################################################
# 64. SEARCH QA — GRAND NORD
################################################################################

Tester :

college ngaoundere
lycee ngaoundere

college garoua
lycee garoua

college maroua
lycee maroua


################################################################################
# 65. SEARCH PERFORMANCE QA
################################################################################

Mesurer au minimum :

total establishments
results transferred per page
number of requests initial load
number of requests search
page size

Confirmer explicitement :

FULL TABLE DOWNLOAD:
NO


################################################################################
# 66. PUBLIC LANDING SEARCH
################################################################################

Auditer également la recherche Landing.

Si elle utilise une logique différente de /recherche :

éviter la duplication.

Créer une logique partagée autant que raisonnable.

Ne pas casser le design Landing.


################################################################################
# 67. SEARCH RESULT ROUTING
################################################################################

Cliquer sur un résultat doit continuer vers :

/ecole/[id]

La catégorie et la ville ne doivent pas casser le routage.


################################################################################
# 68. REVIEW CENTER
################################################################################

Mettre à jour :

/dashboard/admin/registre

Ajouter filtres :

Major Cities
City
Region
Source
Status

Afficher les candidats R.2 séparément de MINESEC V1.


################################################################################
# 69. CITY FILTER
################################################################################

Le filtre Major Cities doit contenir au minimum :

Douala
Yaoundé
Bafoussam
Bamenda
Buea
Limbe
Kumba
Garoua
Maroua
Ngaoundéré
Bertoua
Ebolowa
Kribi
Dschang
Foumban
Nkongsamba
Edéa
Kousséri
Mbouda
Bangangté


################################################################################
# 70. REVIEW CENTER PERFORMANCE
################################################################################

Ne pas introduire le même problème que la recherche publique.

Si Review Center charge toute la staging inutilement :

auditer.

Pour plusieurs milliers de lignes :

pagination serveur recommandée.


################################################################################
# 71. APPROVAL SNAPSHOT
################################################################################

Créer :

reports/registry/major-cities-secondary-v1-approval.json

Inclure uniquement :

CLEAN_APPROVABLE

Pour chaque candidat :

staging_id
official_id
official_name
region
city
category
source
decision

Calculer :

SHA256 checksum.


################################################################################
# 72. NO PROMOTION
################################################################################

Même si le snapshot contient des candidats propres :

NE PAS exécuter la promotion.

R.3 fera :

dry-run
approval
checksum
productionGuard
promotion
staging link
audit


################################################################################
# 73. NO MINEDUB
################################################################################

Ne pas commencer MINEDUB dans ce sprint.

Pas de :

maternelles
primaires

sauf si une ligne apparaît uniquement comme doublon/candidat pendant
l'analyse et doit être exclue du périmètre secondaire.

Dans ce cas :

documenter
ne pas importer.


################################################################################
# 74. DATABASE POST-CONDITION
################################################################################

Après R.2 :

establishments total

DOIT être exactement identique au baseline du début du sprint.

Staging peut augmenter.

Afficher :

Establishments before:
Establishments after:
Staging before:
Staging after:


################################################################################
# 75. BUILD
################################################################################

Exécuter :

npm run build

npx tsc --noEmit

IMPORTANT :

Sprint R.1 a découvert que le tsconfig racine excluait :

scripts/school-registry

Donc exécuter AUSSI le type-check spécifique des scripts avec leur tsconfig
dédié.

Ne pas déclarer TypeScript OK si seuls les fichiers app ont été vérifiés.


################################################################################
# 76. LINT
################################################################################

Exécuter lint si disponible.

Si non disponible :

N/A

Ne pas installer ou modifier ESLint uniquement pour satisfaire ce sprint.


################################################################################
# 77. PUBLIC ROUTE QA
################################################################################

Tester :

/
/recherche
/ecole/[id]
/revendiquer
/dashboard/admin/registre

Tester au minimum :

école avec city
école city NULL
MINESEC live
établissement revendiqué
résultat grande ville


################################################################################
# 78. SECURITY QA
################################################################################

Vérifier :

service role client exposure = NO
secret committed = NO
public search respects RLS = YES
admin registry requires platform_admin = YES


################################################################################
# 79. FILES EXPECTED
################################################################################

Selon résultats, fichiers attendus :

src/lib/cameroonMajorCities.ts

reports/registry/major-cities-current-coverage.csv

reports/registry/cities/douala-secondary-v1.csv

reports/registry/cities/yaounde-secondary-v1.csv

reports/registry/cities/major-cities-secondary-v1.csv

reports/registry/major-cities-secondary-v1-summary.json

reports/registry/major-cities-enrichment-proposals.csv

reports/registry/major-cities-secondary-v1-approval.json

data/registry/normalized/major-cities-secondary-completeness-v1.json

scripts/school-registry/collect-major-cities-secondary.ts

scripts/school-registry/import-major-cities-to-staging.ts

Les noms exacts peuvent être adaptés à l'architecture existante si nécessaire.

Ne pas créer des fichiers inutiles.


################################################################################
# 80. DOCUMENTATION
################################################################################

Créer :

docs/03_DATA_REGISTRY/MAJOR_CITIES_SECONDARY_V1.md

Documenter :

scope
cities
sources
matching strategy
new candidates
limitations
search architecture
promotion status


################################################################################
# 81. GIT
################################################################################

Après succès :

git status

git diff --stat

Créer un commit LOCAL :

feat: complete major-city secondary registry and scale search

Ne pas push.

Ne pas deploy.


################################################################################
# 82. STOP CONDITIONS
################################################################################

STOP immédiatement si :

- project ref incorrect ;
- remote ahead non synchronisé ;
- risque d'écraser le travail d'Eddy ;
- script tente INSERT direct establishments ;
- source non fiable utilisée comme vérité ;
- matching fuzzy tente auto-merge ;
- search nécessite service_role client ;
- production establishment count change ;
- MINESEC V1 final est modifié ;
- secret détecté dans code client ;
- migration destructive nécessaire.

Rapporter avant de continuer.


################################################################################
# 83. FINAL REPORT
################################################################################

[Voir spec originale pour le gabarit complet du rapport final —
 reproduit tel quel, non dupliqué ici pour éviter la dérive entre les deux
 copies. Le rapport final de fin de sprint devra suivre exactement ce
 gabarit.]

################################################################################
# END SPRINT R.2
################################################################################
```

---

## Correspondance avec le travail préliminaire (2026-08-18, avant adoption de cette spec)

Un audit informel a été mené avant l'adoption formelle de cette spécification.
Il recoupe partiellement les exigences ci-dessus et n'est pas à refaire :

- **Section 8** (`reports/registry/major-cities-current-coverage.csv`) — **déjà produit**, nom de fichier identique. Contient live/staging/unique/official_id/city_null par ville pour les 26 villes prioritaires (Priorité A/B/C).
- **Section 10-12** (zones Douala/Yaoundé/Bafoussam) — testé via `scripts/school-registry/audit-major-cities-zones.ts` (non prescrit par cette spec sous ce nom, à conserver ou fusionner dans la collecte Section 10-11). Constat : l'arrondissement n'est quasiment jamais présent dans la source MINESEC — seulement 4/56 fiches Douala+Yaoundé mentionnent un arrondissement. Pertinent pour ne pas sur-promettre la granularité par zone dans les rapports Section 39-41.
- **Section 13** (variantes anglophones) — une variante confirmée (« Kimbo » → Kumbo, trouvée dans la donnée elle-même) ajoutée dans `scripts/school-registry/lib/majorCities.ts`. Cette spec demande un fichier `src/lib/cameroonMajorCities.ts` (Section 28) — à déterminer si `majorCities.ts` (scripts) doit être conservé séparément (usage scripts d'audit/collecte) ou si Section 28 vise une configuration produit distincte (recherche publique). Décision à documenter dans `MAJOR_CITIES_SECONDARY_V1.md` (Section 80).
- **Anomalie official_id Douala/Yaoundé résolue** : le faible taux apparent de matricule sur ces deux villes vient de fiches annuaire antérieures à l'import MINESEC (`source_ministry = NULL`, 27/31 Douala, 24/25 Yaoundé), pas d'un trou de collecte. Les fiches MINESEC strictes sont à 100 %. Utile pour Section 27 (classification KNOWN LIVE vs CITY NULL BUT LIKELY LOCAL).

Aucun de ces éléments ne modifie `establishments` ni `data/registry/master/minesec-national-v1-final.json` — conforme Section 3 et Section 4.
