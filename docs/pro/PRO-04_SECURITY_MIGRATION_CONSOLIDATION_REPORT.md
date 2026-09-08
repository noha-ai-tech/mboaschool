# PRO-04 — Security & Migration Consolidation

Date : 22 août 2026  
Branche : `feat/pro-school-organization`  
Projet Supabase audité en lecture seule : `Ecoles237` (`umcwwynrftidytxgqkwi`)

## Verdict

PRO-03 est consolidé localement, mais l'historique local/distant n'est pas encore
suffisamment réconcilié pour autoriser un apply automatique. Les objets B, C, D
et gate sont conformes en production ; leurs quatre versions de consolidation
ne sont pas enregistrées dans l'historique distant et ne doivent pas y être
rejouées.

L'audit Advisor contient 15 alertes Security et 297 alertes Performance. Le lot
prioritaire est le remplacement des trois dépendances RLS de
`is_own_establishment(uuid)`, puis la fermeture de cette RPC
`SECURITY DEFINER`. Les invitations restent verrouillées.

## PRO-03 MIGRATIONS CONSOLIDATED

**YES — 4 fichiers canoniques.**

| Vague | Migration locale | Parité de production |
|---|---|---|
| B | `20260822155238_pro_03_wave_b_rls_consolidation.sql` | 12/12 policies, `authenticated`, RLS, `USING` et `WITH CHECK` |
| C corrigée | `20260822194239_pro_03_wave_c_rls_and_hours_consolidation.sql` | 11/11 policies ; fonction heures conforme |
| D | `20260822194251_pro_03_wave_d_rls_consolidation.sql` | 14/14 policies, `authenticated` et RLS |
| Gate | `20260822194302_pro_03_final_deprecation_gate_consolidation.sql` | `current_establishment_id()` absent |

Les quatre corps SQL sont identiques à leurs sources PRO-03 et transactionnels.
La fonction `calculer_heures_enseignant(uuid,date,date,uuid)` est détenue par
`postgres`, `STABLE`, `SECURITY INVOKER`, sans argument par défaut, avec
`search_path=''` et `EXECUTE` accordé uniquement à `authenticated`.

## PRODUCTION DRIFT

**PRESENT — history drift, not B/C/D object drift.**

- Les versions de consolidation B/C/D/gate n'existent pas dans
  `supabase_migrations.schema_migrations`.
- `school_page_drafts` possède maintenant une version distante identifiée,
  `20260822154940_school_page_drafts`, mais son statement enregistré n'est pas
  identique à `0026_school_page_drafts.sql`. La structure est conforme ; la
  parité exacte et l'association du fichier sont refusées par PRO-04.1.
- Les versions locales numériques et les versions distantes horodatées ne sont
  pas une relation un-à-un.
- Wave A est enregistrée, mais `multi_school_rls_context`, exécutée ensuite, a
  réintroduit la policy A `PUBLIC` et `is_own_establishment()`.
- Décision : aucun `db push` et aucun rejeu. Préparer une table complète de
  correspondance avant un éventuel `migration repair --status applied`.

Détails : `PRO-04_MIGRATION_RECONCILIATION_RUNBOOK.md`.

## AI_USAGE POLICY REVIEW

État réel :

- policy : `Directeur lit le cout IA de son etablissement` ;
- commande : `SELECT` ;
- type : `PERMISSIVE` ;
- rôle : `PUBLIC` ;
- `USING` : `is_own_establishment(etablissement_id)` ;
- RLS : actif ;
- seconde policy : insertion propriétaire, `authenticated`, contrôle direct
  de l'école et de l'import.

Le rôle `PUBLIC` inclut tous les rôles. L'accès anonyme échoue actuellement
parce que `auth.uid()` vaut `NULL` dans le helper, mais ce ciblage est trop
large, accroît les évaluations de policies et dépend d'une fonction privilégiée
exposée. La correction recommandée est `TO authenticated` avec un `EXISTS`
direct et `e.owner_id = (select auth.uid())`. Cette correction modifie une des
38 policies PRO-03, avec justification documentée et rollback exact dans le lot
01 ; elle n'a pas été exécutée.

## IS_OWN_ESTABLISHMENT REVIEW

État réel de `public.is_own_establishment(uuid)` :

| Contrôle | Résultat |
|---|---|
| Propriétaire | `postgres` |
| Volatilité | `STABLE` |
| Sécurité | `SECURITY DEFINER` |
| search_path | `pg_catalog, public` |
| PUBLIC EXECUTE | non |
| anon EXECUTE | oui |
| authenticated EXECUTE | oui |
| service_role EXECUTE | oui |
| Appel applicatif direct | aucun |
| Dépendances RLS | 3 policies |

Dépendances exactes :

1. `public.ai_usage / Directeur lit le cout IA de son etablissement` ;
2. `public.admissions_config / admissions_config_owner_write` ;
3. `public.school_page_drafts / school_page_drafts_owner_only`.

Le helper ne retourne qu'un booléen d'appartenance pour `auth.uid()`, donc
l'alerte ne prouve pas une fuite de données immédiate. Sa surface RPC anon/auth
est néanmoins inutile : aucun consommateur applicatif direct n'existe et les
trois policies peuvent exprimer le prédicat sans `SECURITY DEFINER`. Lot 01
remplace atomiquement les trois policies, révoque tous les EXECUTE puis effectue
`DROP ... RESTRICT`.

## SECURITY ADVISOR FINDINGS

**15 findings :**

- 4 `rls_enabled_no_policy` ;
- 1 `function_search_path_mutable` ;
- 1 `extension_in_public` ;
- 2 fonctions `SECURITY DEFINER` exécutables par `anon` ;
- 6 fonctions `SECURITY DEFINER` exécutables par `authenticated` ;
- 1 protection contre les mots de passe compromis désactivée.

Points principaux :

- `private.targeted_invitations` et
  `private.targeted_invitation_delivery_attempts` sont des deny-all
  intentionnels : RLS actif, aucune policy, ACL privées, zéro ligne.
- `public.payments` et `public.sessions_impersonation` restent deux tables
  legacy avec RLS sans policy. Elles ont été retirées du lot 03 révisé, dont
  le périmètre demandé porte uniquement sur les ACL de fonctions.
- `protect_establishment_registry_columns()` est un trigger guard actif mais
  directement exécutable par `PUBLIC`, `anon`, `authenticated` et
  `service_role`. Le lot 03 révisé ferme uniquement cette surface RPC tout en
  conservant `postgres` et le trigger existant.
- `touch_school_page_sections_updated_at()` est `SECURITY INVOKER`, détenue par
  `postgres` et sans EXECUTE client, mais son `search_path` est mutable. Lot 02
  le fixe à vide.
- `unaccent` est dans `public` et `public.f_unaccent` en dépend. Aucun déplacement
  automatique : réécrire/tester le wrapper avant toute migration d'extension.
- `get_admission_by_tracking` est réellement appelé par le suivi public et
  expose intentionnellement une RPC `SECURITY DEFINER` à `anon`. Priorité P1 :
  rate-limit/threat model et `search_path=''` avant de décider de conserver la
  surface.
- `consume_targeted_invitation` est intentionnelle, `authenticated` uniquement,
  `search_path=''`, atomique ; la création/livraison reste désactivée.
- `is_platform_admin`, `is_commercial_admin` et `log_platform_action` ont des
  usages RLS/applicatifs réels. Aucun grant n'est retiré sans migration de leurs
  dépendances.
- La protection Auth contre les mots de passe compromis est désactivée :
  correction de configuration P1, hors migration SQL.

Le classement individuel des 15 lignes figure dans
`PRO-04_ADVISOR_FINDINGS.md`.

## PERFORMANCE ADVISOR FINDINGS

**297 findings :**

- 63 FK sans index couvrant ;
- 56 policies avec appel Auth non transformé en initplan ;
- 125 combinaisons de policies permissives multiples ;
- 52 index sans scan observé ;
- 1 limite absolue de connexions Auth.

Décisions :

- 8 FK P1 concernent les deux tables réellement volumineuses :
  `establishment_import_staging` (~2 378 lignes, six FK) et
  `establishments` (~2 252 lignes, deux FK). Lot 04 prépare leurs index.
- Les 55 autres FK sont P2/P3 selon volume, action `ON DELETE` et activité.
  Elles restent inventoriées individuellement ; aucun lot massif de 63 index
  n'est proposé.
- Les 56 appels RLS sont de vraies opportunités de performance. La forme
  recommandée est `(select auth.uid())`, mais aucune réécriture globale n'est
  sûre sans table de vérité `USING/WITH CHECK`. Les 37 policies B–D sont déjà
  optimisées ; elles ne sont pas modifiées.
- Les 125 warnings de policies permissives multiples sont souvent la composition
  voulue owner/self/admin. Ce n'est pas une preuve de faille. Fusion seulement
  après équivalence logique et benchmark.
- Aucun des 52 index « inutilisés » ne doit être supprimé sur ce seul signal.
  Il faut un cycle de statistiques représentatif et vérifier contraintes/plans.
- Le plafond Auth absolu de 10 connexions est une correction opérationnelle P3.

Le classement individuel des 297 lignes figure dans
`PRO-04_ADVISOR_FINDINGS.md`.

## CRITICAL FIXES

1. **P1 SQL proposé :** supprimer la surface
   `is_own_establishment(uuid)` après remplacement atomique de ses trois
   policies.
2. **P1 application/DB à concevoir :** durcir
   `get_admission_by_tracking` sans casser le suivi public.
3. **P1 configuration :** activer la protection Auth contre les mots de passe
   compromis après validation.
4. **P1 performance :** huit index FK de tables volumineuses, à revalider juste
   avant exécution.

Aucun de ces fixes n'a été appliqué à Supabase.

## INTENTIONAL WARNINGS

- Les deux tables d'invitation privées sans policy : deny-all intentionnel.
- `consume_targeted_invitation` : surface authentifiée intentionnelle, création
  toujours fermée.
- Helpers admin : nécessaires aux policies actuelles.
- Policies permissives owner/self/admin : intention fonctionnelle à confirmer
  individuellement, pas à fusionner automatiquement.
- Index sans scan : statut inconnu, aucune suppression proposée.
- Extension `unaccent` dans `public` : warning réel temporairement conservé à
  cause de la dépendance du moteur de recherche.

## PROPOSED MIGRATION LOTS

| Lot | Contenu | Forward | Rollback | Exécuté |
|---|---|---|---|---|
| 01 | 3 policies owner directes + fermeture/drop helper | `PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_PROPOSED.sql` | `PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_ROLLBACK.sql` | non |
| 02 | `search_path=''` du trigger CMS | `PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_PROPOSED.sql` | `PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_ROLLBACK.sql` | non |
| 03 | ACL deny-all de `protect_establishment_registry_columns()` | `PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql` | `PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_ROLLBACK.sql` | non |
| 04 | huit index FK P1 | `PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_PROPOSED.sql` | `PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_ROLLBACK.sql` | non |

Tous les lots sont transactionnels, ont un rollback séparé et ne contiennent
aucune activation d'invitation, création de rôle ou modification de donnée
métier. Les lots doivent être approuvés et exécutés séparément.

## Validation locale

- TypeScript : PASS — `npx tsc --noEmit --incremental false`.
- Lint : PASS — lint ciblé sur la frontière invitation/établissement et le test
  PRO-04.
- Tests : PASS — PRO-03 72/72 ; PRO-04 9/9 ; total 81/81.
- Build : PASS — Next.js 15.5.23, 88/88 pages.
- Avertissement build non bloquant : plusieurs lockfiles, racine de traçage
  Next.js inférée au niveau `C:\Users\User\Documents`.

## Rapport demandé

- BRANCH: `feat/pro-school-organization`
- PRO-03 MIGRATIONS CONSOLIDATED: YES — 4 canonical local migrations
- PRODUCTION DRIFT: YES — history mapping + non-identical local/remote `school_page_drafts`; B/C/D/gate objects conform
- AI_USAGE POLICY REVIEW: PUBLIC IS UNNECESSARILY BROAD — LOT 01 PROPOSED
- IS_OWN_ESTABLISHMENT REVIEW: SECURITY DEFINER; anon/auth/service EXECUTE; 3 RLS dependencies; no direct app call
- SECURITY ADVISOR FINDINGS: 15 CLASSIFIED
- PERFORMANCE ADVISOR FINDINGS: 297 CLASSIFIED
- CRITICAL FIXES: 4 REVIEW ITEMS; 0 EXECUTED
- INTENTIONAL WARNINGS: DOCUMENTED
- PROPOSED MIGRATION LOTS: 4 FORWARD + 4 ROLLBACK
- TYPESCRIPT: PASS
- LINT: PASS — TARGETED
- TESTS: PASS — 81/81
- BUILD: PASS — 88/88
- MIGRATIONS EXECUTED: 0
- DATABASE WRITES: 0
- BUSINESS DATA CHANGED: NO
- INVITATIONS ACTIVATED: NO
- READY FOR ARCHITECT REVIEW: YES
