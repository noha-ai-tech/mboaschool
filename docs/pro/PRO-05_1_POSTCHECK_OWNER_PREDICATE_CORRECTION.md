# PRO-05.1 — Post-check owner predicate correction

Date : 2026-08-24  
Branche : `feat/pro-school-organization`

## Scope

Correction locale uniquement de
`PRO05_1_POSTCHECK_OWNER_PREDICATE_FAILED`. Aucune policy cible, ACL, table,
fonction ou donnée métier n'a été modifiée en production.

## Root cause

Le contrôle précédent lisait les expressions décompilées par `pg_policies`,
supprimait les espaces puis comparait leur texte. PostgreSQL peut ajouter des
alias, parenthèses ou variations de rendu sans changer l'arbre logique. Le
post-check pouvait donc rejeter une policy correcte.

## Catalog structure validation

Le préflight de rejeu et le post-check utilisent maintenant directement
`pg_policy` et `pg_depend` :

- `classes_owner_insert.polwithcheck` ;
- `classes_owner_update.polqual` ;
- `classes_owner_update.polwithcheck` ;
- `classes_owner_delete.polqual`.

Les commandes, rôles, présence/absence de `polqual` et `polwithcheck`, nombre et
noms des policies sont vérifiés séparément. Chacune des trois policies owner
doit cataloguer des dépendances vers `auth.uid()`, `classes.establishment_id`,
`classes.section_id`, `establishments.id`, `establishments.owner_id`,
`sections.id` et `sections.etablissement_id`. Toute dépendance à
`is_platform_admin()` est refusée. Aucun `pg_get_expr`, cast `pg_node_tree` en
texte, `LIKE` ou `regexp_replace` n'est utilisé pour valider le prédicat owner.

## Behavioral truth table

Le SQL corrigé sélectionne deux établissements possédés par deux propriétaires
distincts, sans exposer ni persister leurs identifiants. Après création des
policies, il exécute la truth table suivante sous les rôles réels :

| Cas | Résultat requis |
|---|---|
| Owner A → School A → INSERT/UPDATE/DELETE | ALLOW |
| Owner A → School B → INSERT | DENY 42501 |
| Owner B → School A → INSERT/UPDATE/DELETE | DENY/0 ligne |
| anon → School A → INSERT | DENY 42501 |

Le cas owner autorisé insère une classe éphémère, la met à jour puis la supprime
dans une sous-transaction qui lève volontairement un SQLSTATE sentinelle et est
rollbackée. Les cas refusés doivent lever `insufficient_privilege`; toute
réussite inattendue est elle aussi rollbackée puis fait échouer le post-check.
Les trois compteurs métier sont revérifiés après la truth table.

## Target policies unchanged

Les quatre définitions cibles restent inchangées :

- `classes_public_read` — SELECT `anon, authenticated` ;
- `classes_owner_insert` — INSERT `authenticated` ;
- `classes_owner_update` — UPDATE `authenticated`, `USING` et `WITH CHECK` ;
- `classes_owner_delete` — DELETE `authenticated`.

Les tests vérifient toujours les quatre occurrences exactes de
`e.owner_id = (select auth.uid())`, la corrélation établissement, la garde
section/établissement et l'absence d'exception platform admin.

## Validation

- Tests ciblés PRO-05.1 : **9/9 PASS**
- Tests locaux PRO-03/PRO-04/PRO-05 : **112/112 PASS**
- Délimiteurs PL/pgSQL : **PASS**, chaque dollar-tag apparaît exactement deux
  fois
- Policies cibles : **4/4 présentes une seule fois dans le SQL**
- `psql` local : indisponible
- Supabase CLI local : indisponible
- Migration exécutée : **NO**
- Database writes : **0**
- Business data changed : **NO**
- Invitations activated : **NO**

## Checksum

- Ancien SHA-256 :
  `d2a1a5342f325360d1140a483e3a659efdd4a9b29c4cce0232aca313ab907b99`
- Nouveau SHA-256 :
  `5876a923c67aff8282371d2b1406f3d8545ba15280d6a614446b2cd48700e5f4`

Le fichier corrigé est prêt pour une nouvelle revue architecturale. Il ne doit
pas être exécuté sans une autorisation explicite distincte.
