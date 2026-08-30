# PRO-05.1 — Anonymous write lockdown execution report

Date : 2026-08-24  
Branche : `feat/pro-school-organization`  
Projet : Ecoles237 (`umcwwynrftidytxgqkwi`)  
Fichier autorisé : `PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_PROPOSED.sql`  
SHA-256 appliqué :
`d2a1a5342f325360d1140a483e3a659efdd4a9b29c4cce0232aca313ab907b99`

## Résultat d'exécution

La tentative de migration a échoué **avant `COMMIT`** dans le post-check
transactionnel intégré :

```text
ERROR: P0001: PRO05_1_POSTCHECK_OWNER_PREDICATE_FAILED
CONTEXT: PL/pgSQL function inline_code_block line 149 at RAISE
```

La transaction complète a été rollbackée automatiquement par PostgreSQL.
Aucune seconde tentative n'a été faite et le script de rollback séparé n'a pas
été exécuté.

## Préflight

État vérifié juste avant la tentative :

- projet Ecoles237, ref exacte `umcwwynrftidytxgqkwi`, état
  `ACTIVE_HEALTHY`, PostgreSQL 17.6 ;
- branche exacte `feat/pro-school-organization` ;
- 11 policies initiales : `classes=5`, `class_announcements=3`,
  `school_dashboard_context=3` ;
- checksums policies :
  - `classes`: `ad19aadfc8bd8d0f7b326322cf5aa623` ;
  - `class_announcements`: `82c5366e02982c43ff95945ded8b928c` ;
  - `school_dashboard_context`: `7910f825740bddd3163519aaed6bd630` ;
- ACL exacte des trois tables :
  `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` ;
- compteurs : `classes=2`, `class_announcements=0`,
  `school_dashboard_context=0` ;
- empreinte structurelle combinée :
  `59f185d3f0bbf13bbfda775de0d551a7` ;
- aucun trigger utilisateur et aucune liaison classe/section cross-school ;
- `applications_public_insert` : checksum
  `c53e8fd1b720fc18e2dca2c131ad109c` ;
- six plans d'écriture anon dangereux compilés dans `BEGIN READ ONLY` sous
  `SET LOCAL ROLE anon`, puis rollback, avec 0 ligne affectée.

Tous les prérequis externes étaient conformes. L'échec provient du contrôle
final normalisé du prédicat owner créé dans la transaction; le lot n'a donc pas
atteint l'état final validé.

## Rollback confirmé

La photographie read-only immédiatement après l'échec confirme :

- 11/11 policies initiales restaurées automatiquement ;
- trois checksums de policies identiques au pré-état ;
- ACL initiales identiques sur les trois tables ;
- compteurs métier toujours `2/0/0` ;
- `applications_public_insert` toujours au checksum exact ;
- aucune migration `pro_05_1_anonymous_public_write_lockdown` dans l'historique
  distant.

Le rollback séparé n'était ni nécessaire ni autorisé en l'absence de commit.

## Conséquences

La production reste dans son état initial :

- les six écritures anon dangereuses restent possibles ;
- `class_announcements` et `school_dashboard_context` ne sont pas deny-all ;
- les quatre nouvelles policies owner-only ne sont pas présentes ;
- aucun test RLS post-déploiement n'est applicable ;
- aucune donnée métier n'a changé.

Avant une nouvelle autorisation, le post-check du prédicat doit être corrigé et
validé hors production avec la représentation réellement retournée par
`pg_policies`, puis le SQL complet doit repasser en revue architecturale. Cette
correction et une nouvelle tentative sont hors de cette exécution.

## Rapport demandé

- PRO-05.1 EXECUTED: **NO — FAILED BEFORE COMMIT**
- MIGRATION HISTORY: **UNCHANGED — NO PRO-05.1 ENTRY**
- PREFLIGHT: **PASS**
- POST-CHECK: **FAIL — `PRO05_1_POSTCHECK_OWNER_PREDICATE_FAILED`**
- TRANSACTION ROLLBACK: **COMPLETE, VERIFIED**
- SEPARATE ROLLBACK EXECUTED: **NO**
- ANON WRITES REMAINING: **6**
- CLASSES OWNER ACCESS: **UNCHANGED; POST-DEPLOYMENT TEST NOT RUN**
- CROSS-SCHOOL ISOLATION: **UNCHANGED; 0 EXISTING CLASS/SECTION MISMATCH**
- INACTIVE TABLES DENY-ALL: **NO — INITIAL STATE RESTORED**
- APPLICATIONS PUBLIC INSERT: **STRICTLY UNCHANGED**
- BUSINESS DATA CHANGED: **NO**
- COMMITTED DATABASE WRITES: **0**
- SECURITY ADVISOR: **NOT RERUN AFTER FAILED TRANSACTION**
- TYPESCRIPT: **NOT RERUN — STOP CONDITION**
- LINT: **NOT RERUN — STOP CONDITION**
- TESTS: **NOT RERUN — STOP CONDITION**
- BUILD: **NOT RERUN — STOP CONDITION**
- INVITATIONS ACTIVATED: **NO**
- ORACLE/CONFIGURATION AUTH CHANGED: **NO**
- PUSH/DEPLOYMENT: **NO/NO**
- READY FOR PRO-05.2 REVIEW: **NO**
