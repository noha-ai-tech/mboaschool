# DATABASE — Schéma préparé (non exécuté)

Fichier : `supabase/migrations/0008_school_onboarding.sql`. **Non exécuté** — nécessite validation d'Eddy et de
l'architecte avant tout passage en SQL Editor Supabase.

## Nouvelles colonnes

### `establishments.verification_status`

Type `establishment_verification_status` (enum), `not null default 'referenced'`. Coexiste avec `is_claimed`
(colonne déjà utilisée par l'annuaire public, ajoutée par `seed_schools.sql` / reprise dans la migration 0007) —
les deux sont maintenues synchronisées par le code applicatif (`is_claimed = true` posé en même temps que
`verification_status = 'active'` dans la route d'approbation), pas par un trigger de synchronisation
automatique, pour rester explicite et simple à auditer.

## Nouvelles tables

### `establishment_claims`

Une ligne par demande de revendication (une école peut faire l'objet de plusieurs demandes successives si une
demande précédente est refusée).

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | — |
| `establishment_id` | uuid FK → establishments | `on delete cascade` |
| `requester_user_id` | uuid FK → auth.users | `on delete cascade` |
| `first_name`, `last_name`, `role_title`, `phone`, `email` | text | Champs du formulaire (Phase 4) |
| `comments` | text nullable | Commentaire libre du demandeur |
| `status` | claim_status | `new` par défaut |
| `admin_comment` | text nullable | Commentaire de l'équipe (obligatoire en cas de refus, imposé côté API) |
| `reviewed_by` | uuid FK → auth.users nullable | Admin ayant traité la demande |
| `reviewed_at` | timestamptz nullable | — |
| `created_at`, `updated_at` | timestamptz | — |

### `establishment_claim_documents`

Une ligne par document justificatif uploadé (plusieurs par demande possibles).

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | — |
| `claim_id` | uuid FK → establishment_claims | `on delete cascade` |
| `file_name` | text | Nom original du fichier |
| `storage_path` | text | Chemin dans le bucket `claim-documents` (`{claim_id}/{timestamp}-{nom}`) |
| `uploaded_at` | timestamptz | — |

## Fonction et trigger

`handle_new_establishment_claim()` (`security definer`) + trigger `establishment_claims_after_insert` : fait
passer l'établissement à `claim_requested` automatiquement à la création d'une demande — voir `SECURITY.md` pour
la justification (le demandeur n'a, à raison, aucun droit d'écriture RLS direct sur `establishments`).

## Storage

Bucket `claim-documents`, **privé** (contrairement à `school-images`/`school-documents`, ces documents — pièce
d'identité, registre de commerce... — ne doivent jamais être publics). Policies : le demandeur accède à ses
propres documents (chemin `{claim_id}/...` vérifié contre `establishment_claims.requester_user_id`),
`platform_admin` peut tout lire.

## Tables et colonnes NON touchées par cette migration

`establishments.owner_id`, `establishments.is_claimed`, tout le module Pro (`enseignants`, `pointages`,
`emplois_du_temps`, etc.), `applications`, `school_announcements` — aucune modification, conformément à la
consigne de la mission.

## Aucune opération destructive

Confirmé par relecture du fichier de migration : uniquement `create type`, `alter table ... add column if not
exists`, `create table if not exists`, `create policy` (précédées de `drop policy if exists` pour
l'idempotence), `create trigger` (idem). Aucun `drop column`, aucun `delete`, aucun `truncate`.
