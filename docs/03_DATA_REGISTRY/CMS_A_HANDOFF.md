# CMS-A Handoff

SPRINT REGISTRY-NATIONAL-D §30, updated by REGISTRY-NATIONAL-D.1. Handoff
package from REGISTRY V1 closure to the CMS-A team. All figures below are
live-verified as of 2026-08-23 unless stated otherwise — see the cited
reports for raw data.

**Update (REGISTRY-NATIONAL-D.1, 2026-08-23): the blocking RLS gap described
below is FIXED.** Migration `0023_registry_column_protection.sql` was
executed on production (operator: Jean Merlain, approved by: Eddy) and
independently live-verified. **READY_FOR_CMS_A = YES.** Section 6/10/11 below
are kept for historical context but no longer describe an open blocker —
see `reports/registry/registry-national-d1-summary.json` for the closing
decision.

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

See `docs/03_DATA_REGISTRY/REGISTRY_CMS_BOUNDARY.md` for the full list.
Column-level protection is now live and independently verified
(`supabase/migrations/0023_registry_column_protection.sql`, executed
2026-08-23) — registry-provenance columns are enforced the same way the
pre-existing platform-trust columns already were via `0014`.

## 5. Owner-editable candidate fields

`name`, `city`, `neighborhood`, `phone`, `email`, `whatsapp`, `website`,
`description`, `main_category`, `address` are already live and owner-edited
via `src/app/dashboard/ecole/parametres/page.tsx`. Additional live columns
(`quartier`, `region`, `latitude`, `longitude`, `emoji_logo`,
`couleur_primaire`, `couleur_secondaire`, `cover_image_url`, `hero_mode`) are
plausible CMS-A candidates, not yet exposed, no blocker found.

## 6. RLS gaps — RESOLVED

Row-level RLS (`auth.uid() = owner_id`) now has column-level restriction for
both the platform-trust fields (`0014`) and the registry-provenance fields
(`0023`, executed 2026-08-23) — both confirmed live via independent
behavioral testing. CMS-A may add new owner-facing UPDATE surface to
`establishments` freely; any NEW column CMS-A introduces would still need
its own protection decision if it's sensitive, but the 11 columns already
identified (6 registry + 5 platform-trust) are covered regardless of what
else is added.

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

- ~~`0023_registry_column_protection.sql`~~ — **executed 2026-08-23, verified live.**
- `0014_rc1_security_fixes.sql` and `0018_registry_identity_fields.sql` — both
  confirmed live this sprint via behavioral testing (their header comments
  claiming "prepared but not executed" are stale documentation; the actual
  database state is what matters and has now been independently proven, not
  just read from file headers).
- New schema still needed (no existing column/table found) for:
  `opening_hours`, `social_links`, `admission_info` — product decision needed
  on scope before authoring a migration. Not a security blocker.

## 11. Mandatory CMS security tests

Before CMS-A ships any new owner-editable field, re-run the same
transaction-safe throwaway-fixture methodology used this sprint
(`scripts/school-registry/registry-national-d1-owner-write-repro.ts` as a
template — create a disposable auth user + establishment, sign in as them
with the anon key, attempt writes, always clean up in a `finally` block):
1. Attempt a direct PATCH to `/rest/v1/establishments` with an owner JWT,
   setting a registry-protected column — now correctly rejected (verified
   2026-08-23, `reports/registry/registry-national-d1-owner-write-after.json`).
2. Attempt the same for `is_verified`/etc. — correctly rejected (`0014`,
   verified live 2026-08-23).
3. Confirm `resolveEstablishmentTrustState()` output is unaffected by any
   new owner-editable field (it only reads the fields documented in
   `EstablishmentTrustInput` — adding unrelated columns should not change
   its behavior, but re-run `src/lib/trust/__tests__/resolveEstablishmentTrustState.test.ts`
   after any establishments schema change).
4. Re-run this same fixture test after adding ANY new sensitive column to
   `establishments` — `0023`'s trigger only covers the 6 columns it names
   explicitly; a new sensitive column needs its own explicit protection.

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
CMS-A. The RLS/column-protection gap that previously blocked full closure
(REGISTRY-NATIONAL-D, `reports/registry/registry-national-d-summary.json`)
has been fixed and independently verified
(REGISTRY-NATIONAL-D.1, `reports/registry/registry-national-d1-summary.json`).
**REGISTRY V1 is closed. READY_FOR_CMS_A = YES.**
