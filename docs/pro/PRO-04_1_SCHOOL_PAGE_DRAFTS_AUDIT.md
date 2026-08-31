# PRO-04.1 — school_page_drafts provenance and parity audit

Date : 22 août 2026  
Projet : `Ecoles237` (`umcwwynrftidytxgqkwi`)  
Mode : lecture seule

## Verdict

`school_page_drafts` possède une origine distante identifiable, mais le fichier
local `0026_school_page_drafts.sql` n'est pas le SQL exact enregistré en
production.

- Parité structurelle : **YES**.
- Parité exacte du fichier/SQL enregistré : **NO**.
- Association de `0026` à la migration distante : **INTERDITE**.
- Action sur l'historique : **NONE**.

## Origine et date

La production contient déjà :

- version distante : `20260822154940` ;
- nom : `school_page_drafts` ;
- nombre de statements enregistrés : 1 ;
- taille exacte du statement : 3 058 octets ;
- SHA-256 du statement enregistré :
  `fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21` ;
- rollback enregistré : non ;
- log PostgreSQL d'application :
  `2026-08-22T15:49:40.997000Z`.

Le log contient le marqueur `apply sql from post body` suivi de l'insertion
automatique dans `supabase_migrations.schema_migrations`. Cela constitue une
preuve forte que le DDL a été appliqué via le mécanisme de migration Supabase,
et non par un simple `db push` du fichier numérique local.

Le fichier local a été créé à `2026-08-22T15:35:45.7545557Z`, environ quatorze
minutes avant l'application distante. Les objets et commentaires partagent la
même conception CMS-F.1. L'origine probable du SQL distant est donc une version
condensée dérivée du même travail, mais pas le fichier local exact.

## Structure réelle

Table : `public.school_page_drafts`  
Owner : `postgres`  
RLS : activé, non forcé  
Lignes estimées : 0

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `gen_random_uuid()` |
| `establishment_id` | `uuid` | non | aucun |
| `payload` | `jsonb` | non | `'{}'::jsonb` |
| `is_dirty` | `boolean` | non | `false` |
| `created_at` | `timestamptz` | non | `now()` |
| `updated_at` | `timestamptz` | non | `now()` |

Contraintes :

- PK sur `id` ;
- UNIQUE sur `establishment_id` ;
- FK `establishment_id → establishments(id) ON DELETE CASCADE` ;
- CHECK `jsonb_typeof(payload) = 'object'`.

Les deux index de contrainte sont présents et valides.

## Policy réelle

`school_page_drafts_owner_only` :

- `PERMISSIVE` ;
- commande `ALL` ;
- rôle `PUBLIC` ;
- `USING is_own_establishment(establishment_id)` ;
- `WITH CHECK is_own_establishment(establishment_id)`.

Cette policy est structurellement conforme au fichier `0026`. Son ciblage
`PUBLIC` et sa dépendance au helper privilégié sont audités séparément dans le
lot PRO-04 01 ; aucun changement n'est exécuté ici.

## Grants réels

| Rôle | Privilèges |
|---|---|
| `authenticated` | SELECT, INSERT, UPDATE, DELETE |
| `service_role` | tous les privilèges table |
| `postgres` | tous les privilèges table |
| `anon` | aucun |
| `PUBLIC` | aucun |

Ces grants correspondent à l'effet du statement distant.

## Trigger et fonction

Trigger :

- `school_page_drafts_touch_updated_at` ;
- `BEFORE UPDATE FOR EACH ROW` ;
- actif ;
- appelle `public.touch_school_page_drafts_updated_at()`.

Fonction :

- owner `postgres` ;
- `VOLATILE` ;
- `SECURITY INVOKER` ;
- `search_path` non fixé ;
- corps : affecte `new.updated_at = now()` puis retourne `new` ;
- EXECUTE : `PUBLIC`, `anon`, `authenticated` et `service_role`.

Le corps et le trigger correspondent au fichier local. La surface EXECUTE et le
`search_path` mutable méritent un futur durcissement, mais ne doivent pas être
modifiés pendant ce gate.

## school_images associé

Le statement distant contient aussi :

- `public.school_images.status text not null default 'live'` ;
- CHECK limité à `live` et `draft_pending_add` ;
- commentaire CMS-F présent.

La structure courante correspond à cette partie du SQL enregistré et au fichier
local.

## Écart exact local/distant

| Élément | Local `0026` | Statement distant | Résultat |
|---|---|---|---|
| Taille | 8 338 octets | 3 058 octets | différent |
| SHA-256 | `183b142a86d502c463e55ebe395930fb2b052fc36e7e3288f8e7c2cbf7154845` | `fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21` | différent |
| Commentaire table | inclut la forme JSON cible détaillée | s'arrête après la description des domaines | différent |
| DDL structurel | table/policy/grants/trigger/fonction/status | mêmes objets | conforme |
| DML métier | 0 | 0 | conforme |

Le commentaire de table réellement stocké correspond au statement distant
court, pas au commentaire local étendu. La parité exacte est donc formellement
refusée même si les objets fonctionnels sont équivalents.

## Décision d'historique

Ne pas :

- renommer `0026` en `20260822154940` ;
- marquer `0026` comme appliquée ;
- remplacer la migration distante par le checksum local ;
- exécuter de réparation `applied` ou `reverted` pour
  `20260822154940_school_page_drafts`.

Une future consolidation nécessiterait d'abord de matérialiser le statement
distant exact comme artefact canonique distinct, puis une décision architecte
sur le commentaire et le rollback absent. Cette étape est hors PRO-04.1.

