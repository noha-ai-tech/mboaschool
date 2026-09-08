# PRO-03 — Plan de migration RLS

Statut : proposé, non validé, non exécuté.

## Principes

1. Préserver les droits owner actuellement disponibles ; ne pas activer de responsabilités métier réelles.
2. Remplacer la sélection implicite par un predicate corrélé à l’école de la ligne.
3. Utiliser des migrations distinctes et transactionnelles.
4. Écrire explicitement `USING` et `WITH CHECK` pour les policies `ALL`.
5. Cibler `authenticated`; ne créer aucun privilège `anon`.
6. Préserver les policies self-read et les policies admin existantes.
7. Ne supprimer `current_establishment_id()` qu’après zéro policy, zéro fonction et zéro appel applicatif.

## Prérequis applicatifs avant SQL

- Introduire la résolution explicite par URL/body et `requireEstablishmentAccess`.
- Adapter toutes les pages Pro, routes et composants listés dans l’audit.
- Transmettre `p_etablissement_id` dans les deux appels owner qui l’omettent.
- Remplacer le rattachement d’invitation basé sur l’e-mail par un jeton ciblé avant toute extension staff multi-école.
- Déployer ces adaptations de manière rétrocompatible alors que la fonction SQL accepte encore son paramètre optionnel.

## Vague A — faible risque, lecture seule

Fichier : `PRO-03_WAVE_A_PROPOSED.sql`

- 1 policy : lecture `ai_usage`.
- Aucun droit d’écriture modifié.
- Objectif : valider le predicate owner direct, les rôles, plans et tests cross-school sur un périmètre minimal.

Critère de passage : tests owner A/A+C/B, `anon`, forged ID, `EXPLAIN`, advisors, logs sans erreur.

Rollback : redéployer la définition exacte sauvegardée de la policy `Directeur lit le cout IA de son etablissement`; `current_establishment_id()` est encore présente.

## Vague B — personnel, enseignants, sections, matières

Fichier : `PRO-03_WAVE_B_PROPOSED.sql`

- 12 policies : absences, congés, disponibilités, enseignant-matières, enseignants, matières, volumes, sections, contrats, documents, staff, Storage documents.
- Préserver les self-read existantes.
- Vérifier les parents indirects et le bucket sensible.

Critère de passage : CRUD owner multi-école, self-read teacher/staff, cross-school child IDs, fichiers, policy recursion, advisors.

Rollback : restaurer les 12 définitions de la carte production dans une migration dédiée ; la fonction deprecated reste disponible.

## Vague C — emplois du temps et présence

Fichier : `PRO-03_WAVE_C_PROPOSED.sql`

- 11 policies : années, trimestres, contraintes, créneaux, emplois, indisponibilités, salles, indisponibilités salles, pointages, remplacements, Storage pointages.
- Remplacer `calculer_heures_enseignant` par la version explicite `SECURITY INVOKER`.
- Cette vague exige que les trois call sites envoient `p_etablissement_id`.

Critère de passage : génération/publication A et C, pointage, espace enseignant, agrégat heures, noms de fichiers malformés, absence d’erreur scalaire.

Rollback : restaurer policies et définition à quatre paramètres avec défaut. Comme la signature PostgreSQL reste la même, le rollback doit restaurer explicitement le `DEFAULT` et le corps historiques.

## Vague D — paie, imports, messagerie et opérations sensibles

Fichier : `PRO-03_WAVE_D_PROPOSED.sql`

- 14 policies : insertion `ai_usage`, bulletins/historique/lignes, messages, config paie, primes/retenues/types, quatre tables d’import.
- Déployer seulement après validation complète des routes et ressources enfants.

Critère de passage : cycle paie, transitions autorisées, imports, messagerie, cross-school et forged IDs, service-role précontrôlé, advisors.

Rollback : restaurer les 14 définitions sauvegardées ; aucune donnée ne doit être transformée par la migration de policy.

## Gate finale — dépréciation

Fichier : `PRO-03_FINAL_DEPRECATION_PROPOSED.sql`

Préconditions :

- requête catalogue = zéro policy dont `qual`/`with_check` mentionne la fonction ;
- `pg_depend`/définitions = zéro autre fonction ou vue dépendante ;
- `rg` = zéro appel nouveau dans le code ;
- toutes les versions applicatives encore servies sont compatibles ;
- approbation Eddy + architecte.

La migration révoque les exécutions puis fait `DROP FUNCTION ... RESTRICT`. `RESTRICT` est volontaire : toute dépendance oubliée doit faire échouer la migration au lieu d’être supprimée en cascade.

## Ordre de livraison recommandé

1. Tests et helpers applicatifs explicites, sans SQL.
2. Release applicative rétrocompatible.
3. Vague A en staging, tests, advisors, observation.
4. Vagues B, C et D séparément, chacune avec son gate.
5. Requête zéro consommateur.
6. Gate de dépréciation dans une dernière release séparée.

Il ne faut jamais appliquer les quatre vagues comme un seul changement non observé.

## Plan de tests

### SQL/RLS

- Créer les fixtures uniquement dans une base locale/staging jetable : owners A/B, schools A/B/C, staff actif/inactif, responsabilités valides/révoquées/expirées.
- Exécuter chaque opération sous claims distincts via `SET LOCAL ROLE authenticated` et claims JWT de test.
- Tester SELECT/INSERT/UPDATE old row/UPDATE new row/DELETE.
- Vérifier qu’une ligne ne peut pas changer de school via UPDATE.
- Tester parents enfants cross-school, policies self-read et Storage.
- Tester un owner possédant A+C : aucun appel scalaire, résultats disjoints.

### Application

- Middleware : 0, 1, plusieurs écoles ; forfaits différents ; teacher ; platform admin.
- Routes : auth absente, UUID absent/invalide, école autorisée, école falsifiée, enfant étranger, succès confirmé après écriture.
- Service role : démontrer qu’aucun appel admin ne survient avant contrôle métier.
- Invitations : jeton ciblé, expiré, rejoué, mauvaise école, e-mail identique dans plusieurs écoles.
- Changement d’école : toutes les données dépendantes rechargées, caches/query keys incluent l’école.
- Deux onglets : A et C simultanés sans écrasement de contexte.
- Basse connexion : changement explicite déclenche un seul rechargement cohérent, sans refetch massif par page.
- Non-régression : espace enseignant, Pro, Personnel, Enseignants, pointage, paie, timetable, imports, callback, plateforme.

### Qualité et exploitation

- `npx tsc --noEmit`
- `npm run build`
- lint ciblé des fichiers modifiés
- tests unitaires et intégration
- `EXPLAIN (ANALYZE, BUFFERS)` sur predicates représentatifs en staging
- Supabase security/performance advisors après chaque vague
- comparaison du nombre de policies et recherche des dépendances restantes

## Stratégie de rollback

- Capturer avant chaque vague `pg_get_expr`/`pg_policies` et les grants dans l’artefact de release.
- Préparer une migration inverse spécifique à la vague, jamais un `git reset` ou une modification manuelle de production.
- Les changements de policies sont sans backfill et ne modifient aucune donnée métier.
- En cas d’incident applicatif, revenir d’abord à la release rétrocompatible puis appliquer la migration inverse approuvée.
- Ne jamais utiliser `DROP ... CASCADE`.

## Invariants métier

PRO-03 ne crée aucune responsabilité, aucun département, aucune appartenance et ne change aucune ligne métier. Les champs registre (`official_id`, `source_ministry`, `source_reference`, `registry_import_batch`, `is_verified`, `forfait`, `subscription_plan`) sont hors scope.
