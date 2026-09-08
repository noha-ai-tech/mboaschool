# PRO-04.1 — Migration History Reconciliation Gate

Date : 22 août 2026  
Branche : `feat/pro-school-organization`  
Projet : `Ecoles237` (`umcwwynrftidytxgqkwi`)  
Mode : audit production read-only + préparation locale

## Verdict

La réparation d'historique est sûre **uniquement pour les quatre versions
B/C/D/gate**, sous réserve d'un dernier preflight identique au moment de
l'approbation. Elle doit employer exclusivement la commande officielle
`supabase migration repair --status applied`, qui modifie la table de suivi sans
rejouer le SQL.

Cette action ciblée ne prétend pas réconcilier tout l'ancien historique local
numérique. `school_page_drafts` est explicitement exclue : une migration
distante existe, mais son statement enregistré n'est pas identique au fichier
local `0026`.

Aucune commande de réparation n'a été exécutée.

## Tableau de décision

| MIGRATION | ÉTAT LOCAL | ÉTAT PRODUCTION | PARITÉ | ACTION PROPOSÉE | RISQUE | ROLLBACK |
|---|---|---|---|---|---|---|
| B / `20260822155238` | fichier canonique, transaction, 12 policies, DML métier 0 | 12/12 présentes, `authenticated` uniquement, RLS actif, `USING/WITH CHECK` conformes ; version absente de l'historique | PASS catalogue + source | `migration repair --status applied 20260822155238` | mauvaise ligne d'historique si drift entre preflight et action | `migration repair --status reverted 20260822155238` |
| C / `20260822194239` | fichier canonique, transaction, 11 policies + fonction corrigée, DML métier 0 | 11/11 ; fonction `postgres`, `STABLE`, `SECURITY INVOKER`, `search_path=''`, défaut 0, EXECUTE authenticated seul ; version absente | PASS catalogue + source | `migration repair --status applied 20260822194239` | idem ; signature fonction à recontrôler juste avant | `migration repair --status reverted 20260822194239` |
| D / `20260822194251` | fichier canonique, transaction, 14 policies, DML métier 0 | 14/14 présentes, `authenticated` uniquement, RLS actif, commandes et checks conformes ; version absente | PASS catalogue + source | `migration repair --status applied 20260822194251` | idem ; ne pas confondre avec la policy A séparée | `migration repair --status reverted 20260822194251` |
| Gate / `20260822194302` | revoke + `DROP ... RESTRICT` transactionnels, aucune policy/DML métier | `public.current_establishment_id()` absent ; version absente | PASS catalogue + source | `migration repair --status applied 20260822194302` | marquer appliqué alors qu'une dépendance aurait été recréée après le snapshot | `migration repair --status reverted 20260822194302` |
| `0026_school_page_drafts.sql` | fichier local 8 338 octets, DML métier 0 | migration distante déjà enregistrée sous `20260822154940_school_page_drafts` ; statement 3 058 octets | STRUCTURE PASS / EXACT FAIL | NONE — aucune association ou réparation | collision de provenance, commentaire différent, rollback distant absent | NONE ; conserver la ligne distante existante |

## Checksums

Algorithme : SHA-256.

Deux empreintes sont conservées pour chaque consolidation :

- `file_sha256` : octets exacts du fichier local ;
- `canonical_body_lf_sha256` : UTF-8, fins de ligne LF, quatre lignes de
  bannière PRO-04 retirées. Cette empreinte est identique à la source
  `PRO-03_*_PROPOSED.sql`.

| Migration | file_sha256 | canonical_body_lf_sha256 |
|---|---|---|
| B | `37271b9bc4f462962c33c3ac8796bc35ca767d7ed64db7414c002e59abaf8fd3` | `5fdbe2d67125d1b20c335d3b9420b63fbbfdbd304e84a295f2d228abdbe784f8` |
| C | `869c7602ba5ead6fd44875715f3963ad3a8d58de551cf320afd98938e6e986ed` | `27a16343c562bc21bea8950859efa07346c7a450308d5b08351ebeb94535545a` |
| D | `1cce86ceec60d5b4ddd729fdc3a43fecdd9b874ab92078c780432b07e8d5546d` | `b029817be866f7bfcb164525ebe8d45c350d40a7ce9f7e36d3fe9c3f2ba71441` |
| Gate | `8f167c7e0289fd1c954ffb4755299515d769248a336b273eb02b8e34e32dfb70` | `83d478461082573d54bd2a97ff900cfe5dd0633437d20704f2be7654fd9e58dd` |

Autres preuves :

- snapshot catalogue production :
  `bacbe8f9704fcc398eab0ef60ea1d5587b20d011e6f930d46ca4f2bed3658caa` ;
- baseline 37 compteurs :
  `29da1b659af11ea64b86e1a94817675324c3a82117646abe7e8f4738a03bf281` ;
- `0026` local :
  `183b142a86d502c463e55ebe395930fb2b052fc36e7e3288f8e7c2cbf7154845` ;
- statement distant `school_page_drafts` :
  `fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21`.

Manifest machine-readable : `PRO-04_1_CHECKSUMS.json`.

## DML métier

Un scan ancré sur les statements top-level `INSERT INTO`, `UPDATE`,
`DELETE FROM`, `MERGE INTO`, `TRUNCATE` et `COPY` donne :

- B : 0 ;
- C : 0 ;
- D : 0 ;
- gate : 0 ;
- `0026` local : 0.

Les occurrences `FOR INSERT` dans les policies ne sont pas du DML. La fonction C
ne contient que des `SELECT`. Le gate ne contient que contrôles catalogue,
`REVOKE` et `DROP FUNCTION RESTRICT`.

## Procédure officielle proposée

Documentation officielle :
[Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

### Preflight obligatoire

1. Recalculer les quatre checksums et comparer au manifest.
2. Exécuter le contrôle catalogue read-only et obtenir B=12, C=11, D=14.
3. Vérifier la fonction C et l'absence du helper.
4. Vérifier que les quatre versions sont toujours absentes :
   `supabase migration list --project-ref umcwwynrftidytxgqkwi`.
5. Vérifier que `20260822154940_school_page_drafts` reste l'unique version portant
   ce nom.
6. Arrêter si un seul résultat diffère.

### Commandes préparées — NE PAS EXÉCUTER AVANT APPROBATION

```powershell
npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status applied 20260822155238
npx.cmd supabase migration list --project-ref umcwwynrftidytxgqkwi

npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status applied 20260822194239
npx.cmd supabase migration list --project-ref umcwwynrftidytxgqkwi

npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status applied 20260822194251
npx.cmd supabase migration list --project-ref umcwwynrftidytxgqkwi

npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status applied 20260822194302
npx.cmd supabase migration list --project-ref umcwwynrftidytxgqkwi
```

Les versions sont traitées une par une pour rendre un échec partiel visible et
réversible. Ne pas employer `db push`, `db reset --linked`, `apply_migration` ou
une insertion manuelle dans `supabase_migrations`.

## Rollback officiel préparé

Le rollback porte uniquement sur l'historique. Il n'exécute aucun rollback DDL.
Il doit supprimer en ordre inverse seulement les lignes effectivement ajoutées :

```powershell
npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status reverted 20260822194302
npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status reverted 20260822194251
npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status reverted 20260822194239
npx.cmd supabase migration repair --project-ref umcwwynrftidytxgqkwi --status reverted 20260822155238
npx.cmd supabase migration list --project-ref umcwwynrftidytxgqkwi
```

Ne jamais appliquer ce bloc aveuglément : chaque `reverted` doit correspondre à
une ligne créée pendant la session de réconciliation.

## Contrôle post-réconciliation préparé

Fichier : `PRO-04_1_POST_RECONCILIATION_CHECK.sql`.

Il est strictement read-only et vérifie :

1. présence unique des quatre versions et noms attendus ;
2. 12/11/14 policies, rôles `authenticated` et RLS ;
3. signature, owner, sécurité, search_path, défauts et EXECUTE de la fonction C ;
4. absence persistante de `current_establishment_id()` ;
5. unicité et checksum inchangé de
   `20260822154940_school_page_drafts` ;
6. égalité des 37 compteurs avec la baseline pré-réconciliation.

Le `migration list` final doit montrer les quatre versions alignées local/remote.
Les autres divergences historiques numériques restent hors de ce gate et
doivent être signalées, pas corrigées implicitement.

## school_page_drafts

Audit détaillé : `PRO-04_1_SCHOOL_PAGE_DRAFTS_AUDIT.md`.

Conclusion : table, colonnes, contraintes, policy, grants, trigger, fonction et
`school_images.status` correspondent structurellement au statement distant.
Cependant le commentaire stocké et le SQL enregistré sont plus courts que le
fichier `0026`. Les checksums diffèrent. La parité exacte est donc refusée et
aucune action d'historique n'est proposée.

## Résultat attendu

- HISTORY RECONCILIATION SAFE: YES — SCOPED B/C/D/GATE, PREAPPROVAL ONLY
- B/C/D/GATE PARITY: PASS — 12/11/14 + FUNCTION + GATE
- SCHOOL_PAGE_DRAFTS PARITY: STRUCTURAL PASS / EXACT FILE PARITY FAIL
- PROPOSED HISTORY ACTIONS: 4 OFFICIAL `repair --status applied` COMMANDS PREPARED
- ROLLBACK READY: YES — OFFICIAL `repair --status reverted` IN REVERSE ORDER
- SQL/MIGRATIONS REPLAYED: 0
- PRO-04 LOTS EXECUTED: 0
- DATABASE WRITES: 0
- BUSINESS DATA CHANGED: NO
- INVITATIONS ACTIVATED: NO
- PUSH/DEPLOY: NO
- READY FOR ARCHITECT APPROVAL: YES

