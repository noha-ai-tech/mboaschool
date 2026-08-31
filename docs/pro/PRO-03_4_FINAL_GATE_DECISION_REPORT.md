# PRO-03.4 — Rapport de décision du gate final

Date : 21 août 2026  
Branche : `feat/pro-school-organization`  
Projet : `Ecoles237` (`umcwwynrftidytxgqkwi`)

## Décision exécutée

Le gate de suppression de `public.current_establishment_id()` a été autorisé
séparément, exécuté en production et vérifié le 21 août 2026.

## Prérequis vérifiés après la vague D

| Contrôle | Résultat |
|---|---:|
| Policies utilisant le helper | 0 |
| Fonctions autres que le helper | 0 |
| Vues utilisant le helper | 0 |
| Vues matérialisées utilisant le helper | 0 |
| Dépendances catalogue vers le helper | 0 |
| Appels applicatifs exécutables | 0 |
| Policies A–D présentes | 38/38 |
| Cibles A–D avec RLS actif | 38/38 |
| Isolation propriétaire/étranger | PASS |
| Incohérences métier après D | 0 |
| Données métier modifiées par D | 0 |

## État final du helper

- La signature exacte `public.current_establishment_id()` n'existe plus.
- Aucun overload du même nom ne subsiste.
- Policies, fonctions, vues et vues matérialisées : zéro référence résiduelle.
- L'alerte Supabase `authenticated_security_definer_function_executable`
  spécifique au helper a disparu.

## Portée de la recherche statique

- `src/` : aucune invocation ; une mention dans un commentaire.
- `tests/` : aucune invocation runtime.
- Les migrations historiques `0001` à `0015` contiennent l'ancien modèle. Dans
  un replay ordonné, `0023_multi_school_rls_context.sql` remplace ces usages et
  ne contient plus d'appel exécutable au helper.
- `PRO-03_FINAL_DEPRECATION_PROPOSED.sql` référence volontairement le helper pour
  révoquer son EXECUTE et le supprimer ; ce n'est pas un consommateur.

## Contrôles réalisés après exécution

1. Les cinq compteurs de consommateurs étaient à zéro avant le gate.
2. Le gate seul a été exécuté dans sa transaction.
3. La fonction a été supprimée avec `DROP ... RESTRICT` sans erreur.
4. Les 38/38 policies sont présentes, avec RLS actif et checksum inchangé.
5. La policy A a conservé exactement le même checksum.
6. L'isolation propriétaire/étranger passe après suppression.
7. Les compteurs métier avant/après sont identiques.

## Point distinct à ne pas confondre avec le gate

La policy A `Directeur lit le cout IA de son etablissement` cible encore
`PUBLIC` et utilise `is_own_establishment(etablissement_id)`. Elle ne dépend pas
de `current_establishment_id()` et ne bloque donc pas son gate, mais son ciblage
de rôle mérite une décision architecturale séparée. Il n'a pas été modifié dans
la vague D.

## Statut

- FINAL GATE TECHNICALLY READY: YES
- FINAL GATE AUTHORIZED: YES
- FINAL GATE EXECUTED: YES
- HELPER REMOVED: YES
- DATABASE WRITES FOR GATE: 1 DDL transaction / 0 business rows
- WAITING FOR EDDY + ARCHITECT APPROVAL: NO
