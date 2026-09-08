# PRO-04.4 — Lot 3 legacy deny-all ACL final review

Date de capture production : 2026-08-24 UTC  
Projet : Ecoles237 (`umcwwynrftidytxgqkwi`)  
Statut : préparation locale uniquement — aucune migration exécutée

## Correction de périmètre

Le brouillon initial de `PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql`
révoquait des privilèges de **tables** sur `payments` et
`sessions_impersonation`. Il ne contenait aucune fonction et ne pouvait donc
pas satisfaire la revue demandée. Ces opérations de table ont été retirées du
lot 3 révisé. Les alertes `rls_enabled_no_policy` de ces deux tables restent
hors périmètre et inchangées.

## Fonction incluse

| Contrôle | État production validé |
|---|---|
| Signature | `public.protect_establishment_registry_columns()` |
| OID observé | `21108` — capturé pour preuve, non codé en dur dans la migration |
| Retour / langage | `trigger` / `plpgsql` |
| Propriétaire | `postgres` |
| Sécurité | `SECURITY DEFINER` |
| Volatilité | `VOLATILE` |
| `search_path` | `public` |
| MD5 du corps (`prosrc`) | `aa21b9b769cef6bebd5080027064d356` |
| MD5 de `pg_get_functiondef` | `17e58602c8454c70c160e191e3c3ca9e` |
| ACL initiale normalisée | `PUBLIC`, `anon`, `authenticated`, `service_role`, `postgres`: `EXECUTE`, grantor `postgres` |
| ACL finale | `postgres` uniquement |

Le lot ne change ni le corps, ni le propriétaire, ni le mode de sécurité, ni
le `search_path`. Le maintien de `search_path=public` est une dette distincte :
le présent lot ferme d'abord toute exécution RPC cliente et conserve strictement
le comportement du trigger.

## Dépendances actives

La fonction n'est pas inutilisée. Elle est appelée indirectement par exactement
un trigger actif :

- `establishments_protect_registry_columns` ;
- table `public.establishments` ;
- `BEFORE UPDATE FOR EACH ROW` (`tgtype=19`) ;
- état `O` ;
- MD5 de définition `df0b3d9ff934dfa3e8c918adf4ed6f2d`.

Aucune dépendance de policy RLS, fonction, vue ou vue matérialisée n'a été
trouvée dans `pg_depend`, ni par recherche textuelle complémentaire. Le dépôt
ne contient aucun appel RPC ou applicatif de cette fonction. La production ne
possède pas de relation `cron.job`, aucune Edge Function n'est déployée, et
aucune intégration serveur locale ne la référence.

PostgreSQL vérifie `EXECUTE` lors de la création d'un trigger, pas à chaque
déclenchement. Le trigger existant reste donc opérationnel après révocation des
rôles clients. `postgres` conserve explicitement `EXECUTE` pour l'administration,
la maintenance et une éventuelle recréation contrôlée du trigger.

## Fonctions exclues

| Fonction ou groupe | Motif d'exclusion |
|---|---|
| `get_admission_by_tracking(text,text)` | RPC publique réellement utilisée par `/suivi-admission`; fermeture fonctionnellement cassante. |
| `consume_targeted_invitation(text)` | RPC authentifiée intentionnelle, atomique et à usage unique; invitations toujours désactivées côté émission. |
| `is_platform_admin()` / `is_commercial_admin()` | Dépendances actives de sept policies RLS; retirer `authenticated` ferait échouer les policies. |
| `log_platform_action(text,text,uuid,jsonb)` | Appels serveur actifs dans les routes d'administration et `src/lib/platform/audit.ts`. |
| `generate_admission_tracking_code()` | Appel indirect actif depuis le trigger d'admission; les insertions anon/authenticated en dépendent. |
| `f_unaccent(text)` / `search_establishments(...)` | Recherche applicative active; pas des fonctions deny-all. |
| `touch_school_page_drafts_updated_at()` | Provenance `school_page_drafts` toujours séparée et durcissement explicitement exclu du lot 2; doit recevoir sa propre décision de parité/search_path. |
| Autres fonctions de trigger déjà fermées à `PUBLIC`, `anon`, `authenticated` | Leur grant `service_role` historique mérite un lot séparé avec tests fonctionnels des flux Auth/admission/CRM; aucune alerte Advisor cliente actuelle ne les cible. |
| `create_targeted_invitation(...)` / `revoke_targeted_invitation(...)` | Déjà fermées à tous les rôles clients; aucune modification nécessaire. |

## Garde-fous du lot

Le préflight n'accepte que l'état initial exact ou l'état final exact. Il
vérifie signature unique, retour, langage, propriétaire, sécurité, volatilité,
`search_path`, deux checksums, ACL avec grantor, privilèges effectifs, trigger,
dépendances catalogue et textuelles, éventuelle tâche `cron`, ainsi que le
compteur de `establishments`.

Le post-check exige l'OID inchangé, la définition inchangée, l'ACL finale
`postgres` uniquement, le trigger actif et identique, et le compteur métier
inchangé. La migration ne contient qu'un `REVOKE EXECUTE` transactionnel.

Le rollback refuse tout état autre que le résultat final exact, restaure les
cinq bénéficiaires et le grantor `postgres`, puis vérifie l'ACL initiale
normalisée, la fonction, le trigger et le compteur métier. Il réouvre
volontairement les deux alertes Security Advisor et ne doit être utilisé
qu'après régression confirmée.

## Effet Advisor attendu

Deux alertes devraient disparaître après une future exécution approuvée :

- `anon_security_definer_function_executable` pour la fonction incluse ;
- `authenticated_security_definer_function_executable` pour la même fonction.

Les autres alertes, notamment `touch_school_page_drafts_updated_at`,
`get_admission_by_tracking`, les helpers admin, la consommation d'invitation et
les tables legacy, restent intentionnellement inchangées.
