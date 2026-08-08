# API — Routes du parcours de revendication

## `POST /api/claims`

Soumission d'une nouvelle demande. Réservé aux utilisateurs authentifiés.

**Body** : `{ establishment_id, first_name, last_name, role_title, phone, email, comments? }`

**Vérifications** (dans l'ordre) : authentification → établissement existe → établissement non déjà revendiqué
(`owner_id is null`) → aucune demande concurrente déjà `new`/`in_review` pour cet établissement.

**Effets** : insert dans `establishment_claims` (déclenche le trigger DB qui passe l'établissement à
`claim_requested`) → notification `claim_received`.

**Réponses** : `200 { ok: true, claimId }` · `401` non authentifié · `404` établissement introuvable · `409`
déjà revendiqué ou demande concurrente en cours · `400` champs manquants.

## `POST /api/admin/claims/[id]/review`

Fait passer une demande de `new` à `in_review`. Réservé à `platform_admin`.

**Effets** : `establishment_claims.status = 'in_review'`, `establishments.verification_status = 'under_review'`,
notification `claim_in_review`.

**Réponses** : `200 { ok: true }` · `401`/`403` · `404` · `409` si la demande n'est plus `new`.

## `POST /api/admin/claims/[id]/approve`

Valide une demande — lie automatiquement utilisateur → établissement → dashboard. Réservé à `platform_admin`.

**Body** : `{ comment?: string }` (optionnel).

**Vérification critique (Phase 8)** : revérifie **atomiquement**, au moment même de l'approbation, que
`establishments.owner_id` est toujours `null` — empêche une double revendication en cas d'approbation
concurrente de deux demandes pour la même école (voir `SECURITY.md`).

**Effets** :
- `establishments.owner_id = requester_user_id`, `verification_status = 'active'`, `is_claimed = true`, `is_verified = true`.
- `establishment_claims.status = 'accepted'`.
- Toute autre demande `new`/`in_review` pour le même établissement → `rejected` automatiquement.
- Notification `claim_accepted`.

**Réponses** : `200 { ok: true }` · `401`/`403` · `404` · `409` si déjà traitée ou établissement déjà revendiqué.

## `POST /api/admin/claims/[id]/reject`

Refuse une demande. Réservé à `platform_admin`. **Commentaire obligatoire** (`comment` requis, sinon `400`).

**Effets** : `establishment_claims.status = 'rejected'` + `admin_comment`, `establishments.verification_status =
'referenced'` (uniquement si toujours sans propriétaire — garde-fou), notification `claim_rejected`.

**Réponses** : `200 { ok: true }` · `400` commentaire manquant · `401`/`403` · `404` · `409` si déjà traitée.

## Pourquoi ces routes utilisent le client service role (`createAdminClient()`)

Les trois routes admin écrivent sur `establishments` (`verification_status`, et pour `approve` également
`owner_id`/`is_claimed`/`is_verified`). La policy RLS `platform_admin` sur `establishments` est **préparée mais
non exécutée** (`0007_production_security_reconciliation.sql`) — ces routes ne peuvent donc pas compter sur RLS
pour cette écriture tant que 0007 n'est pas validée et exécutée. Chaque route **vérifie elle-même**, en premier,
que l'appelant est authentifié et a `profiles.role = 'platform_admin'`, **avant** d'utiliser le client service
role — l'autorisation est donc garantie par le code de la route, pas par une hypothèse sur l'état de la base.
C'est exactement la recommandation déjà documentée dans `docs/00_CURRENT_STATE_AUDIT/06_SECURITY_AUDIT.md`
(R-001) : "faire transiter les mutations administratives sensibles par une route API serveur utilisant
`createAdminClient()`".

## Ce qui N'utilise PAS de route API (direct client + RLS)

- Upload des documents justificatifs (`revendiquer/[id]/page.tsx` → `supabase.storage.from('claim-documents')`)
  et insertion dans `establishment_claim_documents` — protégés uniquement par les policies RLS/Storage de la
  migration 0008 (le demandeur ne peut agir que sur sa propre demande).
- Lecture de la liste des demandes par l'admin (`dashboard/admin/verifications/page.tsx`) — protégée par la
  policy RLS `"platform_admin reads all claims"` (nouvelle table, RLS correctement scopée dès sa création,
  contrairement au gap historique sur `establishments`).
