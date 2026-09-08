# PRO-05.1 — Anonymous public write lockdown audit

Date de l'audit : 2026-08-24  
Branche : `feat/pro-school-organization`  
Projet Supabase contrôlé en lecture seule : Ecoles237 (`umcwwynrftidytxgqkwi`)

Ce document décrit l'état réellement observé, le modèle cible et les deux
scripts locaux proposés. Aucun SQL de migration n'a été exécuté.

## TABLES AUDITED

### `public.classes`

- Volume : **2 lignes**, **32 768 octets**. Une ligne a
  `establishment_id IS NULL`; aucune ligne ne référence une section d'un autre
  établissement.
- Colonnes : `id uuid NOT NULL DEFAULT gen_random_uuid()`,
  `establishment_id uuid NULL`, `name text NOT NULL`, `level text NULL`,
  `teacher_name text NULL`, `created_at timestamptz NULL DEFAULT now()`,
  `niveau text NULL`, `section_id uuid NULL`.
- Contraintes : PK sur `id`; FK `establishment_id -> establishments(id) ON
  DELETE CASCADE`; FK `section_id -> sections(id) ON DELETE SET NULL`.
- Références entrantes : `class_announcements.class_id`,
  `emplois_du_temps.classe_id` et `school_announcements.class_id`, toutes en
  `ON DELETE CASCADE`.
- Index : PK uniquement. Les FK non couvertes restent un sujet de performance,
  pas un motif pour élargir ce lot de sécurité.
- Propriétaire/RLS : `postgres`; RLS active; FORCE RLS désactivé.
- ACL brutes : `PUBLIC` aucune; `anon`, `authenticated` et `service_role`
  possèdent chacun `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
  TRIGGER, MAINTAIN`; `postgres` possède tous les privilèges.
- Policies : `Allow all classes delete` (`DELETE TO anon USING true`),
  `Allow all classes insert` (`INSERT TO anon WITH CHECK true`),
  `Allow all classes select` (`SELECT TO anon USING true`),
  `Owners can manage classes` (`ALL TO PUBLIC`, propriétaire corrélé par
  `auth.uid()`), et `Public can read classes` (`SELECT TO PUBLIC USING true`).
- Triggers/fonctions/vues : aucun trigger utilisateur et aucune fonction, vue
  ou vue matérialisée dépendante identifiée.
- Origine locale : `supabase/migrations/auth-setup.sql` crée la table et les
  policies owner/public-read. Les trois policies anonymes inconditionnelles ne
  figurent pas dans l'historique local inspecté.

### `public.class_announcements`

- Volume : **0 ligne**, **16 384 octets**.
- Colonnes : `id uuid NOT NULL DEFAULT gen_random_uuid()`, `class_id uuid
  NULL`, `title text NOT NULL`, `content text NOT NULL`, `type text NULL DEFAULT
  'announcement'`, `created_at timestamptz NULL DEFAULT now()`.
- Contraintes : PK sur `id`; FK `class_id -> classes(id) ON DELETE CASCADE`;
  aucune référence entrante.
- Index : PK uniquement.
- Propriétaire/RLS/ACL : même état que `classes`.
- Policies : `Allow class announcements select` (`SELECT TO anon USING true`),
  `Allow class announcements insert` (`INSERT TO anon WITH CHECK true`) et
  `Allow class announcements delete` (`DELETE TO anon USING true`).
- Triggers/fonctions/vues : aucun trigger utilisateur et aucune dépendance SQL
  active identifiée.
- Aucun DDL de création correspondant n'a été retrouvé dans l'historique local
  ou distant versionné inspecté.

### `public.school_dashboard_context`

- Volume : **0 ligne**, **16 384 octets**.
- Colonnes : `id uuid NOT NULL DEFAULT gen_random_uuid()`, `establishment_id
  uuid NULL`, `dashboard_email text NULL`, `created_at timestamptz NULL DEFAULT
  now()`.
- Contraintes : PK sur `id`; FK `establishment_id -> establishments(id) ON
  DELETE CASCADE`; aucune référence entrante.
- Index : PK uniquement.
- Propriétaire/RLS/ACL : même état que `classes`.
- Policies : `Allow all dashboard context select` (`SELECT TO anon USING
  true`), `Allow all dashboard context insert` (`INSERT TO anon WITH CHECK
  true`) et `Allow all dashboard context update` (`UPDATE TO anon USING true`,
  sans `WITH CHECK` explicite).
- Triggers/fonctions/vues : aucun trigger utilisateur et aucune dépendance SQL
  active identifiée.
- Aucun DDL de création correspondant n'a été retrouvé dans l'historique local
  ou distant versionné inspecté.

Les empreintes de structure du préflight sont documentées dans le SQL proposé :
`classes=dfd1396c5e08f289bf7b0d5d629d60b5/88fda4c98f43da1bd55312ac48159446/d167c422b40035bfff62fd41fd1f418e`,
`class_announcements=31010c469210620d7da696998a133a7f/1a99942d54a586ed1cfb5c26a88aa921/c365bf447127440a19eef12a77929b8b`
et
`school_dashboard_context=6ed69155fc7711444f76aa5b7e680081/a16adb8a0d9e40cb694d79c60ea58e72/b7dba2ec80ed026ab4e61dbcb35a85ca`
(colonnes/contraintes/index).

## ANON EFFECTIVE WRITES

État courant effectif au niveau ligne :

| Table | SELECT anon | INSERT anon | UPDATE anon | DELETE anon |
|---|---:|---:|---:|---:|
| `classes` | ALLOW | **ALLOW** | DENY | **ALLOW** |
| `class_announcements` | ALLOW | **ALLOW** | DENY | **ALLOW** |
| `school_dashboard_context` | ALLOW | **ALLOW** | **ALLOW** | DENY |

Preuve sans mutation : dans une transaction `BEGIN READ ONLY`, les six plans
`INSERT/DELETE`, `INSERT/DELETE` et `INSERT/UPDATE` ci-dessus ont été compilés
sous `SET LOCAL ROLE anon` avec `EXPLAIN (FORMAT JSON)`, puis la transaction a
été rollbackée. Résultat : `transaction_read_only=on`, six plans compilés,
**0 ligne affectée** et aucune fixture créée.

Les ACL accordent en plus `TRUNCATE` aux trois rôles clients. RLS ne protège pas
`TRUNCATE`; ce privilège n'est pas exposé par le Data API ordinaire, mais il
reste une autorisation SQL excessive. `service_role` a `BYPASSRLS` et les ACL
complètes : son accès actuel est donc total. Ces deux constats justifient une
révocation ACL, pas seulement un remplacement des policies.

## APPLICATION CONSUMERS

Consommateurs actifs de `classes` :

- `src/app/dashboard/ecole/classes/page.tsx` : client navigateur, lecture,
  insertion avec `school.id` explicite et suppression par UUID ; c'est le seul
  flux d'écriture métier actif identifié ;
- `src/app/dashboard/ecole/classes/[id]/page.tsx` : lecture de la classe ; ses
  écritures ciblent `school_announcements`, pas `class_announcements` ;
- `src/app/dashboard/ecole/page.tsx`, `src/app/pro/emplois-du-temps/page.tsx` et
  `src/app/pro/matieres/page.tsx` : lectures corrélées à l'établissement ;
- `src/app/api/timetable/generate/route.ts` : lecture serveur après contrôle
  d'accès par le helper existant et établissement explicite ;
- `src/app/dashboard/admin/ecoles/[id]/page.tsx` : comptage/lecture admin.

Aucun consommateur applicatif, route API, appel Supabase direct, RPC, script,
tâche planifiée, fonction SQL, trigger ou intégration serveur n'a été trouvé
pour `class_announcements` ou `school_dashboard_context`. La première est
inactive et a été remplacée dans l'interface par `school_announcements`; la
seconde est inactive. Aucun consommateur `service_role` des trois tables n'a
été identifié.

Les statistiques cumulées depuis leur remise à zéro le 2026-05-20 corroborent
l'audit : `classes` a 100 lectures et 2 insertions observées, sans update/delete
observé; `class_announcements` a seulement 2 anciennes lectures et aucune DML;
`school_dashboard_context` n'a aucune DML observée. Les statistiques ne sont
pas utilisées seules comme preuve d'absence : la recherche statique et le
catalogue ont également été vérifiés.

## REQUIRED WRITE MODEL

- `classes` : **owner-only avec établissement explicite**. Le rôle doit être
  `authenticated`; l'établissement de la ligne doit exister et avoir
  `owner_id = (select auth.uid())`. Si `section_id` est fourni, la section doit
  appartenir au même établissement. `UPDATE` emploie le même prédicat dans
  `USING` et `WITH CHECK`, empêchant aussi de déplacer une classe vers une école
  ou une section étrangère.
- `class_announcements` : **totalement fermée**, car fonctionnalité inactive et
  remplacée par `school_announcements`.
- `school_dashboard_context` : **totalement fermée**, car fonctionnalité
  inactive et sans consommateur.

Il n'existe aucun besoin démontré d'écriture staff ou platform admin dans ce
lot. Aucune exception admin implicite n'est ajoutée. Le rôle `service_role` ne
reçoit aucun grant direct : un éventuel flux serveur futur devra être conçu et
revu séparément.

La lecture publique de `classes` est conservée pour compatibilité, avec rôles
explicites `anon, authenticated`. La ligne historique sans établissement reste
lisible mais devient non modifiable par un client, comportement fail-closed et
sans DML correctrice.

Les sous-requêtes RLS nécessaires restent accessibles : `authenticated`
possède `SELECT` sur `establishments` et `sections`; `establishments` conserve
sa lecture publique et `sections_scope` autorise l'owner authentifié avec
établissement explicite. La policy de lecture de `classes` fournit aussi le
`SELECT` requis par PostgreSQL pour qu'un `UPDATE` RLS soit possible.

## POLICIES TO REMOVE

Onze policies sont supprimées :

- `classes` : `Allow all classes delete`, `Allow all classes insert`, `Allow
  all classes select`, `Owners can manage classes`, `Public can read classes` ;
- `class_announcements` : `Allow class announcements delete`, `Allow class
  announcements insert`, `Allow class announcements select` ;
- `school_dashboard_context` : `Allow all dashboard context insert`, `Allow
  all dashboard context select`, `Allow all dashboard context update`.

## POLICIES TO CREATE

Quatre policies explicites, toutes sur `classes` :

- `classes_public_read`, `SELECT TO anon, authenticated USING (true)` ;
- `classes_owner_insert`, `INSERT TO authenticated WITH CHECK <owner + section
  corrélée>` ;
- `classes_owner_update`, `UPDATE TO authenticated USING <prédicat> WITH CHECK
  <même prédicat>` ;
- `classes_owner_delete`, `DELETE TO authenticated USING <prédicat>`.

Aucune policy n'est créée sur les deux tables inactives : RLS sans policy et
ACL vide constituent un deny-all en profondeur.

## GRANTS TO REVOKE

Le script révoque `ALL` sur chacune des trois tables à `PUBLIC`, `anon`,
`authenticated` et `service_role`. Il restitue ensuite uniquement :

- `SELECT` sur `classes` à `anon, authenticated` ;
- `INSERT, UPDATE, DELETE` sur `classes` à `authenticated`.

Il ne restitue ni `TRUNCATE`, ni `REFERENCES`, ni `TRIGGER`, ni `MAINTAIN`, ni
aucun privilège sur les deux tables inactives. `postgres`, propriétaire des
tables, reste inchangé.

## CROSS-SCHOOL TRUTH TABLE

État cible. `READ` concerne uniquement `classes`; toutes les écritures des deux
tables inactives sont `DENY`.

| Acteur | Lire `classes` | Écrire sa classe / son école | Écrire classe d'une autre école | Lier une section étrangère | Tables inactives |
|---|---:|---:|---:|---:|---:|
| anon | ALLOW | DENY | DENY | DENY | DENY |
| propriétaire légitime | ALLOW | **ALLOW** | DENY | DENY | DENY |
| propriétaire étranger | ALLOW | DENY | DENY | DENY | DENY |
| personnel autorisé | ALLOW | DENY | DENY | DENY | DENY |
| platform admin | ALLOW | DENY | DENY | DENY | DENY |
| service_role | DENY direct | DENY direct | DENY direct | DENY direct | DENY |

La lecture inter-écoles des classes reste intentionnellement publique; **aucune
écriture inter-écoles** n'est autorisée. Les responsabilités staff et l'accès
admin pourraient être ajoutés dans un lot futur uniquement avec une preuve de
besoin et une truth table dédiée.

## APPLICATIONS PUBLIC INSERT UNCHANGED

`applications_public_insert` reste exactement : policy `PERMISSIVE`, commande
`INSERT`, rôles `{anon,authenticated}`, `qual IS NULL`, `WITH CHECK true`.
Empreinte catalogue : `c53e8fd1b720fc18e2dca2c131ad109c`.

La migration et son rollback verrouillent `public.applications` en `ACCESS
SHARE`, vérifient cette définition et cette empreinte avant/après, et ne
contiennent ni `DROP/CREATE POLICY`, ni `GRANT/REVOKE`, ni DML sur cette table.
L'oracle de suivi d'admission et sa configuration Auth sont hors périmètre et
inchangés.

## PREFLIGHT

Le script proposé est une transaction unique avec `lock_timeout='5s'` et
`statement_timeout='2min'`. Il verrouille exclusivement les trois tables cibles
pour figer policies/ACL/comptages pendant le changement et vérifie :

- existence, propriétaire `postgres`, RLS active et FORCE RLS désactivé ;
- colonnes, contraintes et index via empreintes exactes ;
- absence de triggers utilisateur et absence de section inter-écoles ;
- définition et empreinte de `applications_public_insert` ;
- état de policies et ACL **entièrement initial** ou **entièrement final** ;
- rejet explicite de tout état intermédiaire ou dérivé ;
- comptages métier capturés dans des paramètres locaux de transaction.

Empreinte combinée de structure attendue :
`59f185d3f0bbf13bbfda775de0d551a7`.

## POST-CHECK

Dans la même transaction, le post-check exige :

- exactement les quatre policies finales, leurs commandes, rôles et prédicats ;
- structure `pg_policy` et dépendances `pg_depend` vers `auth.uid()`, les
  colonnes classe/établissement/section attendues, sans dépendance
  platform-admin et sans comparer de texte décompilé ou sérialisé ;
- truth table réelle et rollback-only : propriétaire autorisé sur
  insert/update/delete, Owner A refusé sur School B, Owner B refusé sur School
  A et anon refusé ;
- ACL finale exacte et absence de tout grantee inattendu ;
- structures, propriétaire, RLS et absence de triggers inchangés ;
- `applications_public_insert` inchangée ;
- les trois nombres de lignes inchangés.

Chaque écriture de truth table réussie est annulée dans une sous-transaction
PL/pgSQL avant de poursuivre, puis les compteurs sont revérifiés. Une anomalie
lève une exception et rollbacke toute la transaction. Un rejeu depuis l'état
final exact est un no-op contrôlé; il n'utilise pas `IF EXISTS` pour masquer une
dérive.

## ROLLBACK

Le rollback séparé n'accepte que l'état final exact. Il vérifie les mêmes
structures, l'absence de triggers, l'ACL, les policies, la policy applications
et les comptages, puis restaure les onze policies et les ACL initiales exactes.
Il rejette toute dérive avant modification et refait les contrôles après.

Ce rollback réouvre volontairement les vulnérabilités anonymes et les grants
larges; il est donc un mécanisme d'urgence, pas une opération automatique. Il
ne contient aucune DML métier.

## SECURITY ADVISOR

Le Security Advisor a été relancé en lecture seule : **13 findings**, comme à
la clôture PRO-04, sans finding ERROR/CRITICAL. Il ne signale pas directement
les policies `USING/WITH CHECK true` de ces tables; la vulnérabilité a été
prouvée par catalogue et test de plan sous rôle `anon`.

Après application théorique, les écritures anonymes disparaissent. Advisor
peut ajouter deux findings INFO `rls_enabled_no_policy` pour
`class_announcements` et `school_dashboard_context`; ils seraient
**intentionnels**, car les ACL clients sont également vides. Les alertes
Performance Advisor sur leurs FK sans index restent hors de ce lot, les tables
étant vides. Référence Advisor :
[RLS enabled no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## VALIDATION LOCALE

- TYPESCRIPT: PASS — `npx.cmd tsc --noEmit --incremental false`
- LINT: PASS — sept consommateurs ciblés; 0 erreur, 2 warnings
  `react-hooks/exhaustive-deps` historiques dans les pages détail classe et
  détail admin école. Les deux erreurs JSX de guillemets relevées dans la page
  active des classes ont été corrigées sans changement fonctionnel.
- TESTS: PASS — 112/112 PRO-03/PRO-04/PRO-05, dont 9/9 ciblés PRO-05.1
- BUILD: PASS — Next.js 15.5.23, compilation réussie, types valides, 92/92
  pages générées

## RESULTAT

- TABLES AUDITED: YES — 3/3
- ANON EFFECTIVE WRITES: CONFIRMED — 6 opérations ligne dangereuses
- APPLICATION CONSUMERS: AUDITED
- REQUIRED WRITE MODEL: DEFINED
- POLICIES TO REMOVE: 11
- POLICIES TO CREATE: 4
- GRANTS TO REVOKE: ALL client grants on 3 tables, then least-privilege grants on `classes`
- CROSS-SCHOOL TRUTH TABLE: PASS — modèle et tests ciblés
- APPLICATIONS PUBLIC INSERT UNCHANGED: YES
- PREFLIGHT: PREPARED
- POST-CHECK: PREPARED
- ROLLBACK: PREPARED
- SECURITY ADVISOR: 13 CURRENT FINDINGS; no direct targeted finding
- DATABASE WRITES: 0
- BUSINESS DATA CHANGED: NO
- MIGRATION EXECUTED: NO
- INVITATIONS ACTIVATED: NO
- PUSH/DEPLOYMENT: NO/NO
- READY FOR PRO-05.1 EXECUTION REVIEW: YES
