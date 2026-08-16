# Production Migration State — vérité constatée

Ce fichier existe parce que plusieurs migrations de `supabase/migrations/` portent un commentaire d'en-tête
("PRÉPARÉE MAIS NON EXÉCUTÉE") qui s'est révélé **obsolète** lors de l'audit SPRINT P.1 (2026-08-16). Les
commentaires ont été corrigés dans les fichiers concernés, mais leur contenu SQL n'a jamais été modifié — ce
fichier documente l'état réel constaté, à tenir à jour manuellement (aucune requête automatique ne le fait).

Méthode de constat : requêtes `select` en lecture seule (clé anon) sur chaque table via l'API REST Supabase.
Une table qui répond `HTTP 200` (même avec 0 ligne) existe. Une table absente répond `404` /
`PGRST205 — Could not find the table`.

| Migration | Commentaire d'origine | État réel constaté | Preuve |
|---|---|---|---|
| `0006_national_registry_staging.sql` | "PRÉPARÉE MAIS NON EXÉCUTÉE" | **Exécutée.** `establishment_data_sources` et `establishment_import_staging` existent, 0 ligne dans les deux. | Requête REST `HEAD` sur les deux tables → `HTTP 200`, `content-range: */0` (SPRINT P.1) |
| `0016_geographic_hierarchy.sql` | "PRÉPARÉE MAIS NON EXÉCUTÉE" | **Exécutée.** `geo_regions`, `geo_departments`, `geo_arrondissements` existent, 0 ligne. Colonnes `region_id`/`department_id`/`arrondissement_id` présentes sur `establishments`, toutes `null`. | Idem + colonnes visibles sur un `select=*` d'un établissement existant (constaté dès SPRINT O) |

## Ce que ça veut dire concrètement

- Le schéma des deux migrations est en place. **Aucune donnée n'y a jamais été écrite** (staging comme géographie
  restent vides à ce jour).
- Rien n'indique *qui* ni *quand* ces migrations ont été exécutées — probablement manuellement via le Supabase
  SQL Editor, avant ou pendant SPRINT N, sans mise à jour du commentaire du fichier ni trace dans ce dépôt.
  Aucun journal d'audit Supabase n'a été consulté (non accessible depuis cet environnement — à vérifier
  directement dans Dashboard Supabase → Database → Logs si une confirmation exacte de date/auteur est nécessaire).
- Ne pas se fier au commentaire d'en-tête d'un fichier de migration pour savoir si son SQL a réellement été
  appliqué en production — vérifier l'état réel (comme ci-dessus) avant toute décision.

## Historique des écritures réelles sur `establishments`

| Date (`created_at`) | Lignes | Origine confirmée |
|---|---|---|
| 2026-05-20 | 4 | Antérieur au registre national — origine non tracée dans ce fichier (hors périmètre SPRINT P.1) |
| 2026-07-04 | 40 | `supabase/seed_schools.sql` (commit `7baaf27`, 2026-07-08 — écart de quelques jours entre commit et exécution probable) |
| 2026-07-21 | 2 | Antérieur au registre national — origine non tracée |
| 2026-08-15 | 2 | Antérieur au registre national — origine non tracée |
| 2026-08-16 | 673 | `scripts/school-registry/promote-batch-002.ts` (commit `c1cdde3`) — SPRINT O, approbation Eddy confirmée par l'utilisateur en conversation. 100% des 673 matricules retrouvés dans `data/registry/master/minesec-master-v1.json`. |

Total : 48 (pré-registre) + 673 (SPRINT O) = 721 — confirmé par audit SPRINT P.1.
