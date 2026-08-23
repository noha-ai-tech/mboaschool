# CMS-A Handoff

SPRINT REGISTRY-NATIONAL-D §30. Handoff package from REGISTRY V1 closure to
the CMS-A team. All figures below are live-verified as of 2026-08-23 unless
stated otherwise — see the cited reports for raw data.

## 1. Final REGISTRY V1 baseline

- `establishments`: 2252
- `establishment_import_staging`: 2378 total (1526 promoted, 852 unpromoted)
- `establishment_registry_identifiers`: 2242
- Per ministry (staging / live): MINESUP 92/89, MINEFOP 0/0, MINSANTE 22/8, MINTRANSPORT 12/3

Source: `reports/registry/registry-national-d-live-baseline.json`.

## 2. Published batch status

The only registry-national publication executed to date: 3 establishments
(EFO-CCAA, Centre de formation professionnelle maritime « Le Paquebot »,
AUTO ECOLE ASTRALE — all MINTRANSPORT Tier-3), published 2026-08-22 under
REGISTRY-NATIONAL-C, checksum `c22e1b88e1cb1026f0115d7d118abcccc4a832bb3375e9fd62e7ed754f7849ce`.
Independently re-verified live this sprint: all 3 present, `is_verified=false`,
`owner_id=null`, `official_id=null`, 0 registry identifiers created, staging
correctly linked (3/3 `status=promoted`). Idempotence re-confirmed (second
dry-run: 0 would-insert).

Source: `reports/registry/registry-national-d-publication-audit.json`,
`registry-national-d-publication-reconciliation.json`,
`registry-national-d-publication-idempotence.json`.

## 3. Trust model

`src/lib/trust/resolveEstablishmentTrustState.ts` is the SINGLE resolver for
public trust display. Four independent dimensions, never merged:
`directory_status` (always `LISTED`), `claim_status`, `platform_verification`
(from legacy `is_verified`), `official_verification` (`OFFICIALLY_VERIFIED`
only from a `CORROBORATED`/`CONFIRMED` `establishment_registry_identifiers`
row — never from `is_verified`/`owner_id`/mere presence of `official_id`).
CMS-A **must** call this resolver for any new UI surface that displays trust
signals — never reimplement locally. 158 tests pass for this module + related
publication-policy/matching guards (see QA below).

## 4. Registry-protected fields

See `docs/03_DATA_REGISTRY/REGISTRY_CMS_BOUNDARY.md` for the full list and
the current enforcement gap (registry-provenance columns are not yet
column-protected against direct owner writes — a migration is prepared,
`supabase/migrations/0023_registry_column_protection.sql`, not executed).

## 5. Owner-editable candidate fields

`name`, `city`, `neighborhood`, `phone`, `email`, `whatsapp`, `website`,
`description`, `main_category`, `address` are already live and owner-edited
via `src/app/dashboard/ecole/parametres/page.tsx`. Additional live columns
(`quartier`, `region`, `latitude`, `longitude`, `emoji_logo`,
`couleur_primaire`, `couleur_secondaire`, `cover_image_url`, `hero_mode`) are
plausible CMS-A candidates, not yet exposed, no blocker found.

## 6. RLS gaps

Row-level RLS (`auth.uid() = owner_id`) has no column-level restriction
beyond what the `0014` trigger covers (platform-trust fields only, live
status unconfirmed this sprint — verify directly in Supabase SQL Editor
before relying on it). **Do not add new owner-facing UPDATE surface to
`establishments` until this is resolved** — any new owner-editable field
added to the settings page today would rely on the same unprotected RLS
policy as the registry-provenance gap.

## 7. Claim flow behavior

`/api/claims` only creates an `establishment_claims` row for admin review; it
never writes to `establishments` directly. `owner_id` is only ever set by
`/api/admin/claims/[id]/approve` (service-role, fixed payload). The claim
flow itself cannot escalate trust. The escalation risk found this sprint is
entirely at the RLS layer (item 6), not the claim flow's application code.

## 8. API implications

All existing `/api/admin/*` writes to `establishments` use fixed,
hardcoded payloads (never forward request-body fields directly) — this
pattern should be followed for any new CMS-A admin route. `/api/recherche`
reads only `establishments` (never `establishment_import_staging`); confirmed
this sprint via a canary search term unique to a staging-only candidate
(0 results) — see `registry-national-d-search-v2.json`.

## 9. Storage/media implications

`establishment_images` exists and likely backs "gallery" (not deeply audited
this sprint — needs its own RLS/ownership check before CMS-A builds gallery
upload UI). `cover_image_url` is a plain establishments column.

## 10. Migrations potentially required

- `0023_registry_column_protection.sql` — prepared, not executed. Recommended
  before any new owner-editable surface ships.
- Confirm live status of `0014_rc1_security_fixes.sql` and `0018_registry_identity_fields.sql`
  directly in Supabase SQL Editor (this session could not query
  `pg_trigger`/`information_schema` — no RPC, no direct Postgres connection
  string available).
- New schema needed (no existing column/table found this sprint) for:
  `opening_hours`, `social_links`, `admission_info` — product decision needed
  on scope before authoring a migration.

## 11. Mandatory CMS security tests

Before CMS-A ships any new owner-editable field:
1. Attempt a direct PATCH to `/rest/v1/establishments` with an owner JWT,
   setting a registry-protected column — must be rejected (currently is
   NOT, until item 6/10 is resolved).
2. Attempt the same for `is_verified`/`owner_id`/etc. — should already be
   rejected if `0014`'s trigger is live (unconfirmed — verify first).
3. Confirm `resolveEstablishmentTrustState()` output is unaffected by any
   new owner-editable field (it only reads the fields documented in
   `EstablishmentTrustInput` — adding unrelated columns should not change
   its behavior, but re-run `src/lib/trust/__tests__/resolveEstablishmentTrustState.test.ts`
   after any establishments schema change).

## 12. Deferred REGISTRY V2 work

243 candidates frozen into `reports/registry/registry-v2-deferred-snapshot.json`
(checksum in `registry-v2-deferred-checksum.json`): 221 MINESUP
(197 duplicate-review, 20 source-review, plus 11 rejected-invalid tracked
separately), 16 MINSANTE (14 pilot category/duplicate-review + 2 quarantined
programs — notably "Imagerie Médicale", which must never be silently marked
safe, see the snapshot entry), 6 MINTRANSPORT (5 missing-source-url + 1
grouped placeholder for 9 still-under-review Tier-3 candidates). MINEFOP
remains 100% discovery-blocked (source portal unreachable,
`docs/03_DATA_REGISTRY/MINEFOP_IMPORT_CONTRACT.md`) — 0 candidates exist,
this is documented, not an omission.

## 13. V2 backlog does not block CMS-A

None of the above 243 deferred candidates, nor MINEFOP's empty state, block
CMS-A. **What does block treating REGISTRY V1 as fully closed is item 6/10
(the RLS/column-protection gap)** — per this sprint's own rule (§28: "si un
chemin d'escalade réel existe, DECISION cannot be A"), see
`reports/registry/registry-national-d-summary.json` for the final decision.
