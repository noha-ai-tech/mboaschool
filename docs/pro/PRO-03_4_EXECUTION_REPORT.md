# PRO-03.4 — Finalisation du contexte multi-écoles et des policies RLS

Date : 21 août 2026  
Branche : `feat/pro-school-organization`  
Projet Supabase contrôlé : `Ecoles237` (`umcwwynrftidytxgqkwi`)

## Verdict

Les vagues B, C et D ont été exécutées dans cet ordre et vérifiées en
production. La vague D a été appliquée dans une transaction unique avec
`lock_timeout = '5s'` et `statement_timeout = '60s'`. Elle a remplacé exactement
14 policies et n'a modifié aucune ligne métier.

Le gate final de suppression de `current_establishment_id()` a ensuite été
autorisé séparément, exécuté dans une transaction unique et vérifié. Le helper
n'existe plus en production.

## Contrôles production

- Projet : `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Vague B : 12/12 policies présentes, 12/12 limitées à `authenticated`,
  12/12 avec `USING` et `WITH CHECK`, RLS 12/12.
- Vague C : 11/11 policies présentes, 11/11 limitées à `authenticated`,
  11/11 avec `USING` et `WITH CHECK`, RLS 11/11.
- Fonction C : sans `DEFAULT NULL`, propriétaire `postgres`, `STABLE`,
  `SECURITY INVOKER`, `search_path` vide et EXECUTE limité à `authenticated`.
- Vague D : 14/14 policies présentes, 14/14 limitées à `authenticated`, commandes
  exactes 14/14 et RLS 14/14.
- Policies D `ALL` : 13/13 avec `USING` et `WITH CHECK`.
- Policy D `INSERT` : 1/1 avec `WITH CHECK` et sans `USING`, conformément à la
  syntaxe PostgreSQL.
- Gardes propriétaire et relations inter-écoles D : 14/14 présentes.
- Ensemble A–D : 38/38 policies présentes et RLS actif pour les 38 cibles de
  policy. 37/38 ciblent `authenticated` ; la policy de lecture A historique
  cible encore `PUBLIC` et appelle `is_own_establishment`, pas
  `current_establishment_id`. Elle n'a pas été modifiée par D.

## Isolation et données

- Fixture production propriétaire légitime / école propre : ALLOW.
- Propriétaire A / école étrangère B : DENY.
- Utilisateur étranger B / école A : DENY.
- Fixture inter-écoles distincte : PASS.
- Les 14 tables D contenaient 0 ligne avant la transaction et contiennent 0
  ligne après la transaction.
- Contrôles d'intégrité D : 0 incohérence avant et 0 après.
- Champs sensibles du registre : aucun touché.

Les tables D étant vides, aucune fixture métier n'a été créée en production.
La vérité d'accès a été validée avec des établissements et propriétaires réels,
le catalogue RLS et les tests locaux synthétiques.

## Consommateurs finaux de current_establishment_id()

- Policies production : 0.
- Fonctions production autres que le helper : 0.
- Vues production : 0.
- Vues matérialisées production : 0.
- Dépendances catalogue production : 0.
- Code applicatif exécutable : 0 appel.
- Une occurrence applicative demeure dans un commentaire, sans exécution.
- Les anciennes migrations SQL contiennent les définitions historiques ; elles
  sont supplantées, dans l'ordre de replay, par `0023_multi_school_rls_context.sql`.

Avant le gate, le helper était exécutable par `authenticated` et `service_role`,
et ne l'était pas par `PUBLIC` ou `anon`. Le gate a révoqué ces privilèges puis
exécuté `DROP ... RESTRICT`. Après commit : signature absente, zéro overload et
zéro référence SQL résiduelle.

## Validation locale

- TypeScript : PASS (`npx tsc --noEmit --incremental false`).
- Tests PRO-03 : PASS, 72/72.
- Build : PASS, 88/88 pages.
- Invitations : routes 503 inchangées, aucun envoi activé.

## État demandé

- WAVES B–D REVIEWED: YES
- WAVE B EXECUTED: YES
- WAVE C EXECUTED: YES — corrected retry
- WAVE D EXECUTED: YES
- RLS POLICIES VERIFIED: YES — 38/38 present and RLS-enabled
- CROSS-SCHOOL ISOLATION: PASS
- CURRENT_ESTABLISHMENT_ID REMAINING CONSUMERS: 0 active consumers
- FINAL DEPRECATION GATE READY: EXECUTED AND VERIFIED
- TYPESCRIPT: PASS
- TESTS: PASS, 72/72
- BUILD: PASS, 88/88 pages
- DATABASE WRITES: 4 committed DDL transactions across B/C/D/gate; 37 policy replacements, 1 function recreation, 1 function removal, 0 business rows
- BUSINESS DATA CHANGED: NO
- READY FOR PRO-03 CLOSURE: YES

No LOGIN or secret was created. No invitation was activated. No email was sent.
No push or deployment was performed.
