# PRO-04.4 — Lot 3 execution report

Execution UTC : 2026-08-24 04:38  
Projet : Ecoles237 (`umcwwynrftidytxgqkwi`)  
Migration : `20260824043833_pro_04_lot_03_legacy_deny_all_acl`  
SHA-256 SQL : `c651ca9b7695bc8db8e8829bcc8154ec9705d9b02a9a69581bb386cad217786e`

## Préflight

- fonction : `public.protect_establishment_registry_columns()` ;
- OID : `21108` ;
- propriétaire : `postgres` ;
- mode : `SECURITY DEFINER` ;
- `search_path=public` ;
- corps MD5 : `aa21b9b769cef6bebd5080027064d356` ;
- définition MD5 : `17e58602c8454c70c160e191e3c3ca9e` ;
- ACL initiale : `PUBLIC`, `anon`, `authenticated`, `service_role`, `postgres` ;
- trigger unique : OID `21109`, MD5
  `df0b3d9ff934dfa3e8c918adf4ed6f2d` ;
- dépendances inattendues : `0` ;
- établissements : `2252`.

Tous les préflights intégrés ont réussi.

## Résultat

L'ACL finale est exactement `postgres=X/postgres`. `PUBLIC`, `anon`,
`authenticated` et `service_role` ne disposent plus de `EXECUTE`.

L'OID, le corps, la définition, le propriétaire, `SECURITY DEFINER`, le
`search_path`, le trigger et son état actif sont inchangés. Le SQL enregistré
dans l'historique distant est un statement unique et son SHA-256 correspond
octet pour octet au fichier local approuvé.

La protection registre a été testée avec un contexte `auth.uid()` de
propriétaire et une tentative de modification de `source_reference`. Le trigger
a refusé l'opération avec SQLSTATE `42501` et le message exact attendu. La
transaction de test a ensuite été annulée. Le compteur final reste `2252`.

Security Advisor ne retourne plus les alertes
`anon_security_definer_function_executable` et
`authenticated_security_definer_function_executable` pour cette fonction.
Le nombre total de constatations Security Advisor passe de `15` à `13`.

## Validation locale

- TypeScript : PASS ;
- PRO-03 : PASS (`72/72`) ;
- PRO-04 : PASS (`26/26`) ;
- build Next.js : PASS (`91` pages) ;
- rollback : non exécuté ;
- lot 4 : non exécuté ;
- invitations : désactivées ;
- push / déploiement : aucun.
