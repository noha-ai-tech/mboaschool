# PRO-04.5 — Lot 4 FK indexes final review

Date de capture production : 2026-08-24 UTC  
Projet : Ecoles237 (`umcwwynrftidytxgqkwi`) — `ACTIVE_HEALTHY`  
Statut : revue et préparation locales uniquement — aucun index créé

## État réel et décision

Les huit contraintes existent, sont validées et correspondent exactement aux
FK attendues. Chacune figure encore dans Performance Advisor sous
`0001_unindexed_foreign_keys`. Aucun index B-tree valide, prêt, non partiel
et ayant la colonne FK comme préfixe gauche ne les couvre. Aucun objet ne
porte l'un des huit noms proposés.

| Index proposé | Table / FK / colonne | Cible et action | Couverture production | Décision |
|---|---|---|---|---|
| `idx_establishment_import_staging_arrondissement_id` | `establishment_import_staging_arrondissement_id_fkey` / `arrondissement_id` | `geo_arrondissements(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishment_import_staging_department_id` | `establishment_import_staging_department_id_fkey` / `department_id` | `geo_departments(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishment_import_staging_duplicate_of_establishment_id` | `establishment_import_staging_duplicate_of_establishment_id_fkey` / `duplicate_of_establishment_id` | `establishments(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishment_import_staging_duplicate_of_staging_id` | `establishment_import_staging_duplicate_of_staging_id_fkey` / `duplicate_of_staging_id` | auto-FK vers `establishment_import_staging(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishment_import_staging_promoted_establishment_id` | `establishment_import_staging_promoted_establishment_id_fkey` / `promoted_establishment_id` | `establishments(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishment_import_staging_region_id` | `establishment_import_staging_region_id_fkey` / `region_id` | `geo_regions(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishments_arrondissement_id` | `establishments_arrondissement_id_fkey` / `arrondissement_id` | `geo_arrondissements(id)` / NO ACTION | aucune | INCLUS |
| `idx_establishments_owner_id` | `establishments_owner_id_fkey` / `owner_id` | `profiles(id)` / SET NULL | aucune | INCLUS |

Aucun index n'est exclu : aucune couverture redondante n'existe et les huit
alertes Advisor correspondent exactement au lot. Les colonnes géographiques
sont actuellement entièrement NULL et `owner_id` est peu peuplée; le gain
immédiat de certains index sera donc faible. Ils restent justifiés comme
couverture des FK sur les deux tables les plus volumineuses de ce backlog et
éviteront les scans complets lors du peuplement futur ou des contrôles côté
référencé. Le coût en écriture et stockage devra être revérifié après usage.

## Taille et activité observées

| Table | Lignes exactes | Heap | Index actuels | Total | Activité cumulée observée |
|---|---:|---:|---:|---:|---|
| `public.establishment_import_staging` | 2 378 | 2 719 744 o | 770 048 o | 3 817 472 o | 2 378 INSERT, 3 587 UPDATE, 0 DELETE |
| `public.establishments` | 2 252 | 1 138 688 o | 507 904 o | 1 687 552 o | 2 263 INSERT, 2 339 UPDATE, 10 DELETE |

Au moment de la capture, aucun verrou en attente ne visait ces deux tables.
Ces compteurs sont diagnostiques et ne sont pas codés comme valeurs figées
dans la migration : le préflight capture les comptes réels au début de la
transaction et le post-check exige qu'ils restent identiques.

## Stratégie de verrouillage

`CREATE INDEX` ordinaire est retenu. Il prend un verrou `SHARE` et bloque
temporairement les écritures sur la table, mais laisse les lectures passer.
Avec environ 2 000 lignes et moins de 4 Mio par table, la fenêtre attendue est
courte. Le lot fixe `lock_timeout='5s'` : il échoue et rollback plutôt que
d'attendre derrière une écriture longue. `statement_timeout='2min'` borne
également la construction.

`CREATE INDEX CONCURRENTLY` n'est pas requis ici. Il réduirait le blocage des
écritures mais ne peut pas être exécuté dans le bloc transactionnel atomique,
effectue plusieurs passes et peut laisser un index invalide après échec. Il
redeviendrait préférable si la volumétrie ou l'activité augmentait fortement
avant l'exécution; le préflight production devra alors conduire à une nouvelle
revue, pas à l'exécution de ce fichier.

## Garde-fous préparés

Le préflight :

- vérifie les deux tables, les huit noms/signatures de FK, colonnes source et
  cible, validation, match simple et actions UPDATE/DELETE;
- exige zéro couverture initiale alternative;
- accepte seulement les huit index absents ou les huit index finaux exacts;
- refuse tout état partiel, nom en collision, index invalide, partiel,
  expressionnel, unique ou de mauvaise définition;
- capture les deux nombres de lignes métier.

Le rejeu depuis l'état final exact n'exécute aucun DDL. Toute dérive
intermédiaire provoque une exception et le rollback transactionnel complet.
Le post-check répète les contrôles FK, exige les huit B-tree valides/prêts avec
une couverture unique et compare les nombres de lignes.

Le rollback est séparé. Il n'accepte que les huit index finaux exacts, refuse
une couverture alternative, supprime uniquement ces huit noms, vérifie leur
absence et l'absence de variation des comptes. Il ne contient ni
`IF EXISTS` ni suppression d'un index antérieur.

## Effet Advisor attendu

Après une future exécution approuvée et le rafraîchissement Advisor, les huit
alertes `unindexed_foreign_keys` listées ci-dessus devraient disparaître.
Les autres alertes Performance Advisor restent hors périmètre et inchangées.
Référence : https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Validation locale

Les tests ciblés couvrent l'état initial, le rejeu depuis l'état final, le
refus d'un état partiel, la dérive FK/définition/couverture, les marqueurs de
post-check, l'absence de DML métier et le rollback strict.

- TypeScript : PASS (`npx tsc --noEmit --incremental false`).
- Tests PRO-03 : PASS (72/72).
- Tests PRO-04 : PASS (30/30).
- Build Next.js : PASS (91 pages générées).

Aucune migration n'a été exécutée, aucun index n'a été créé, aucune donnée
métier n'a été modifiée et les invitations restent désactivées.
