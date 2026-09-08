# PRO-04.2 — LOT 1 OWNER POLICY & HELPER FINAL REVIEW

Date : 22 août 2026  
Branche : `feat/pro-school-organization`  
Projet audité en lecture seule : `Ecoles237` (`umcwwynrftidytxgqkwi`)

## Verdict

Le lot 1 est prêt pour une décision d'exécution séparée. Le forward a été durci localement afin d'être atomique, transactionnel et rejouable, avec préflight des dépendances, refus de toute dépendance inattendue, révocation des privilèges avant suppression et post-check dans la même transaction.

La migration n'a pas été exécutée. Les lectures du catalogue de production n'ont provoqué aucune écriture.

## DEPENDENT POLICIES

Le catalogue production confirme exactement trois policies dépendantes :

| Table / policy | Opération actuelle | État actuel | État proposé |
|---|---|---|---|
| `public.ai_usage` / `Directeur lit le cout IA de son etablissement` | `SELECT` | `TO PUBLIC`, `USING is_own_establishment(etablissement_id)` | `TO authenticated`, `USING` direct |
| `public.admissions_config` / `admissions_config_owner_write` | `ALL` | `TO PUBLIC`, helper dans `USING` et `WITH CHECK` | `TO authenticated`, prédicat direct dans les deux clauses |
| `public.school_page_drafts` / `school_page_drafts_owner_only` | `ALL` | `TO PUBLIC`, helper dans `USING` et `WITH CHECK` | `TO authenticated`, prédicat direct dans les deux clauses |

`pg_depend` contient cinq arêtes pour ces trois policies : une pour `ai_usage`, deux pour `admissions_config` et deux pour `school_page_drafts`, correspondant aux expressions `USING`/`WITH CHECK`. Aucun autre dépendant n'existe.

## AI_USAGE PUBLIC REMOVED

**YES.** La policy de lecture `ai_usage` est recréée explicitement `TO authenticated`. La policy d'insertion distincte `Systeme peut enregistrer le cout IA`, déjà `authenticated`, reste inchangée.

Les grants table-level historiques de `ai_usage` incluent encore `anon`, mais sans policy RLS applicable l'anon ne peut ni lire ni écrire. Le lot resserre donc effectivement la lecture sans prétendre modifier les grants de table hors périmètre.

## DIRECT RLS PREDICATES

Chaque remplacement est corrélé à la ligne cible :

```sql
exists (
  select 1
  from public.establishments e
  where e.id = <ligne>.establishment_id
    and e.owner_id = (select auth.uid())
)
```

`ai_usage` utilise son nom historique `etablissement_id`. Les deux autres tables utilisent `establishment_id`.

- `SELECT ai_usage` : `USING` uniquement, ce qui correspond à l'opération.
- `ALL admissions_config` : `USING` pour les lignes visibles/modifiables/supprimables et `WITH CHECK` pour les lignes insérées ou leur état après mise à jour.
- `ALL school_page_drafts` : même combinaison `USING` + `WITH CHECK`.
- Tous les appels Auth sont sous la forme optimisée `(select auth.uid())`.
- Aucune exception `platform_admin`, `service_role` ou métadonnée JWT n'est ajoutée.

## CROSS-SCHOOL ISOLATION

Le prédicat exige simultanément l'identité exacte de l'établissement de la ligne et `establishments.owner_id = auth.uid()`. Un propriétaire ne peut donc pas utiliser l'identifiant d'une école qu'il ne possède pas, ni déplacer une écriture vers une autre école.

Nuance conservée : `admissions_config_public_read`, policy séparée `SELECT TO PUBLIC USING (true)`, reste en production et n'est pas modifiée par ce lot. La lecture publique des paramètres d'admission est donc préexistante et intentionnellement conservée ; le lot n'introduit aucun nouvel accès public ou cross-owner. Toutes les écritures demeurent owner-only.

### Truth table effective après le lot

| Acteur | `ai_usage` SELECT | `admissions_config` SELECT | `admissions_config` write | `school_page_drafts` ALL |
|---|---|---|---|---|
| Propriétaire légitime de l'école | ALLOW | ALLOW | ALLOW | ALLOW |
| Propriétaire étranger / autre école | DENY | ALLOW — lecture publique préexistante | DENY | DENY |
| `anon` | DENY | ALLOW — lecture publique préexistante | DENY | DENY |
| `platform_admin` non propriétaire | DENY | ALLOW — lecture publique préexistante | DENY | DENY |

Un `platform_admin` reste un utilisateur PostgreSQL `authenticated` : la valeur applicative `profiles.role` ne lui accorde aucun bypass RLS implicite. S'il est aussi le propriétaire réel de la ligne, il passe uniquement par le cas propriétaire légitime.

## HELPER CONSUMERS REMAINING

État avant exécution :

- production active : les trois policies listées ci-dessus ;
- autres fonctions production : 0 ;
- vues production : 0 ;
- vues matérialisées production : 0 ;
- code actif sous `src/` : 0 appel ;
- RPC applicative directe : 0.

Après application théorique : **0 consommateur actif**.

Les fichiers historiques locaux `0023_multi_school_rls_context.sql`, `0025_admissions_config.sql` et `0026_school_page_drafts.sql` contiennent encore la définition ou les anciens appels. Ce sont des migrations historiques, pas des consommateurs runtime. Le rollback et les documents/tests mentionnent également le helper intentionnellement. Une future migration exécutable du lot 1 doit rester chronologiquement postérieure à ces fichiers.

## HELPER REMOVAL SAFE

**YES, sous le gate préparé.**

- État initial accepté : helper présent et ensemble exact des trois policies dépendantes.
- Toute dépendance non-policy ou quatrième policy entraîne une exception avant modification.
- État déjà appliqué accepté : helper absent et zéro policy consommatrice ; la réexécution recrée les mêmes policies puis termine sans erreur.
- Les trois tables et policies, leur commande, leur rôle attendu (`PUBLIC` avant ou `authenticated` après) et RLS actif sont vérifiés.
- `EXECUTE` est révoqué de `PUBLIC`, `anon`, `authenticated` et `service_role` avant `DROP FUNCTION ... RESTRICT`.
- `RESTRICT` reste le dernier verrou contre une dépendance non détectée.
- Le post-check exige helper absent, zéro policy consommatrice et trois policies `authenticated` conformes avant `COMMIT`.
- Toute erreur annule l'ensemble des changements.

## ROLLBACK REVIEW

Le rollback est transactionnel et rejouable. Il restaure les sémantiques exactes observées avant le lot :

- fonction détenue par `postgres`, `STABLE`, `SECURITY DEFINER` ;
- `search_path = pg_catalog, public` ;
- `PUBLIC EXECUTE` révoqué ;
- `EXECUTE` réaccordé à `anon`, `authenticated` et `service_role` ;
- trois policies restaurées `TO PUBLIC` avec le helper.

Conséquence importante : le rollback réouvre volontairement la surface RPC `SECURITY DEFINER`, réintroduit la policy `ai_usage` ciblée sur `PUBLIC` et restaure les alertes Security Advisor associées. Il doit donc rester un rollback d'urgence après régression fonctionnelle confirmée, pas un état cible durable. Il ne contient aucun DML métier.

## Validation locale

- TYPESCRIPT: **PASS** — `npx tsc --noEmit --incremental false`.
- TESTS PRO-03: **PASS — 72/72**.
- TESTS PRO-04: **PASS — 13/13**.
- BUILD: **PASS** — Next.js 15.5.23, 89/89 pages générées.
- BUILD WARNING: détection de plusieurs lockfiles et inférence du workspace root ; warning préexistant sans échec.

## Statut demandé

- DEPENDENT POLICIES: **3 EXACTLY**
- AI_USAGE PUBLIC REMOVED: **YES**
- DIRECT RLS PREDICATES: **YES — CORRELATED + `(select auth.uid())`**
- CROSS-SCHOOL ISOLATION: **PASS FOR OWNER-CONTROLLED OPERATIONS**
- HELPER CONSUMERS REMAINING: **0 ACTIVE AFTER THEORETICAL APPLY**
- HELPER REMOVAL SAFE: **YES**
- ROLLBACK REVIEW: **PASS WITH DOCUMENTED SECURITY REGRESSION**
- TYPESCRIPT: **PASS**
- TESTS: **PASS — PRO-03 72/72; PRO-04 13/13**
- BUILD: **PASS**
- DATABASE WRITES: **0**
- READY FOR LOT 1 EXECUTION APPROVAL: **YES**

Migration executed: **NO**  
Business data changed: **NO**  
Invitations activated: **NO**  
Push/deployment: **NO**
