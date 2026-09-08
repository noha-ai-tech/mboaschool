# PRO-04.1 — MIGRATION HISTORY RECONCILIATION EXECUTION REPORT

Date d'exécution : 2026-08-22 (America/Los_Angeles)  
Branche : `feat/pro-school-organization`  
Projet : `Ecoles237` (`umcwwynrftidytxgqkwi`), `ACTIVE_HEALTHY`  
Supabase CLI : `2.115.0`

## Résultat

La réconciliation de l'historique B/C/D/gate a été exécutée avec succès au moyen exclusif de la procédure officielle `supabase migration repair --status applied`. Les quatre commandes ont été lancées séparément et validées avant de passer à la suivante.

| Ordre | Version | Nom distant | Résultat | Statements enregistrés |
|---:|---|---|---|---:|
| 1 | `20260822155238` | `pro_03_wave_b_rls_consolidation` | `applied` | 28 |
| 2 | `20260822194239` | `pro_03_wave_c_rls_and_hours_consolidation` | `applied` | 30 |
| 3 | `20260822194251` | `pro_03_wave_d_rls_consolidation` | `applied` | 32 |
| 4 | `20260822194302` | `pro_03_final_deprecation_gate_consolidation` | `applied` | 5 |

Les statements locaux ont été enregistrés dans les lignes de suivi par le CLI, mais n'ont pas été exécutés. Aucun `db push`, `migration up`, `apply migration`, rejeu SQL ou lot PRO-04 n'a été lancé.

## Gate pré-exécution

- Le CLI indiquait `Ecoles237` comme projet lié, ref exacte `umcwwynrftidytxgqkwi`.
- L'API Supabase confirmait le même projet, en état sain.
- Les quatre versions étaient absentes de l'historique distant dans les vérifications CLI et API.
- Hashes SHA-256 locaux inchangés :
  - B : `37271b9bc4f462962c33c3ac8796bc35ca767d7ed64db7414c002e59abaf8fd3`
  - C : `869c7602ba5ead6fd44875715f3963ad3a8d58de551cf320afd98938e6e986ed`
  - D : `1cce86ceec60d5b4ddd729fdc3a43fecdd9b874ab92078c780432b07e8d5546d`
  - gate : `8f167c7e0289fd1c954ffb4755299515d769248a336b273eb02b8e34e32dfb70`
- DML métier détecté dans les quatre migrations : 0.
- Parité production avant réparation : B 12/12, C 11/11, D 14/14 ; rôles `authenticated` uniquement et RLS actif.
- Baseline métier capturé à `2026-08-23 05:40:37.770615+00`.

## Contrôle post-réconciliation

Contrôle catalogue capturé à `2026-08-23 05:43:59.252217+00` :

- Historique : 4/4 versions présentes avec les noms attendus.
- Vague B : 12/12 policies, zéro manquante, `authenticated` uniquement, RLS actif.
- Vague C : 11/11 policies, zéro manquante, `authenticated` uniquement, RLS actif.
- Vague D : 14/14 policies, zéro manquante, `authenticated` uniquement, RLS actif.
- Policy A `ai_usage` : présente et RLS actif ; non modifiée.
- Total PRO-03 A–D : 38/38 policies.
- Fonction `public.calculer_heures_enseignant(uuid,date,date,uuid)` :
  - propriétaire `postgres` ;
  - `SECURITY INVOKER` ;
  - `STABLE` ;
  - `search_path=''` ;
  - aucun argument `DEFAULT` ;
  - `EXECUTE` applicatif uniquement pour `authenticated` ;
  - SHA-256 de la définition avant/après identique : `304f2df7e5126f4da88d781215e95314db3c337fadf1cbc606f53705f47e1880`.
- `public.current_establishment_id()` : absente.

La procédure de réparation ne rejoue pas le DDL. Cette propriété du CLI, combinée à l'identité de la définition C, aux 38 policies conformes et aux compteurs métier identiques, confirme qu'aucun DDL des quatre migrations n'a été rejoué.

## Compteurs métier

Le snapshot post-réconciliation a été capturé à `2026-08-23 05:44:01.258789+00`.

- Objets comparés : 37/37.
- Différences avant/après : 0.
- `public.enseignants` : 5 → 5.
- `public.pointages` : 6 → 6.
- `public.staff_members` : 3 → 3.
- `storage.objects` / `pointages-photos` : 6 → 6.
- Les 33 autres objets contrôlés : 0 → 0.

Aucune donnée métier n'a été modifiée.

## school_page_drafts

- Version distante unique : `20260822154940`.
- Nom : `school_page_drafts`.
- Statements : 1.
- Taille : 3058 octets.
- SHA-256 avant/après : `fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21`.

Cette migration est inchangée, demeure séparée et n'a fait l'objet d'aucune réparation ou association locale.

## Détection de dérive

La commande `supabase migration list --linked` confirme que B/C/D/gate sont maintenant alignées local/distant. Elle continue de signaler les migrations locales historiques numérotées `0001`–`0026`, les migrations distantes historiques déjà documentées et `school_page_drafts` comme éléments non alignés globalement. Cette dérive préexistante est hors du périmètre autorisé et n'a pas été réparée.

## Statut obligatoire

- PROJECT REF VERIFIED: **YES — Ecoles237 / `umcwwynrftidytxgqkwi`**
- FOUR HISTORY REPAIRS EXECUTED: **YES — 4/4, B → C → D → gate**
- REMOTE HISTORY VERIFIED: **YES — CLI + API + catalogue SQL**
- DDL REPLAYED: **NO**
- POST-CHECK: **PASS**
- BUSINESS COUNTS: **PASS — 37/37 UNCHANGED**
- SCHOOL_PAGE_DRAFTS UNCHANGED: **YES**
- ROLLBACK REQUIRED: **NO**
- DATABASE WRITES: **4 HISTORY RECORDS; 0 BUSINESS WRITES**
- READY FOR PRO-04 LOT 1 REVIEW: **YES**

Invitations activées : **NO**  
Push : **NO**  
Déploiement : **NO**
