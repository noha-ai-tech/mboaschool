# Registry / CMS Boundary

SPRINT REGISTRY-NATIONAL-D §26. Defines which `establishments` data belongs
to the national registry pipeline (never owner-editable) versus ordinary CMS
content (safe for CMS-A to expose to establishment owners).

Source data for this document: live schema read (`registry-national-d-cms-schema-audit.json`),
live RLS/trigger read (`registry-national-d-cms-rls-audit.json`), and the app-layer
audit (`registry-national-d-claim-security.json`).

## REGISTRY_PROTECTED

These fields must never be exposed as ordinary owner-editable CMS fields.

**`establishments` columns:**
- `id`
- `official_id`
- `source_ministry`
- `source_reference`
- `source_url`
- `source_updated_at`
- `registry_import_batch`

**`establishment_registry_identifiers.*`** (separate table — RLS restricts read to `platform_admin` only, per migration 0021)

Also protected, though not strictly "registry" fields — pre-existing platform-trust
fields already identified as sensitive by `0014_rc1_security_fixes.sql`:
- `is_verified`, `is_featured`, `subscription_plan`, `forfait`, `verification_status`, `owner_id`

**Registry provenance and government-source evidence**, wherever it is
derived from the fields above (e.g. `resolveEstablishmentTrustState()`'s
`official_verification` output) — CMS-A must render this read-only, sourced
only from `establishment_registry_identifiers` + the columns above, never
from a freeform owner-editable field.

**`official_verification`** is computed exclusively by
`src/lib/trust/resolveEstablishmentTrustState.ts` from
`establishment_registry_identifiers.verification_status` (`CORROBORATED`/`CONFIRMED`)
— never from `is_verified`, `is_claimed`, `owner_id`, or the mere presence of
`official_id`/`source_ministry` (which yield `OFFICIAL_SOURCE_FOUND` at most).
CMS-A must call this resolver, never reimplement the logic.

**`promoted_establishment_id`** (on `establishment_import_staging`) and
**duplicate/matching/audit relationships** produced by the registry matching
engine (`scripts/school-registry/lib/matching/`) — provenance metadata, not
CMS content.

## ✅ RESOLVED (2026-08-23, REGISTRY-NATIONAL-D.1)

The gap described below (REGISTRY-NATIONAL-D) has been fixed. Migration
`supabase/migrations/0023_registry_column_protection.sql` was executed on
Écoles237 production 2026-08-23 (operator: Jean Merlain, approved by: Eddy —
`reports/registry/registry-national-d1-migration-approval.json`) and
independently live-verified this same sprint via a transaction-safe
throwaway fixture (real authenticated owner session, not service role):
all 6 registry-provenance columns are now blocked for owner writes,
legitimate content updates (single- and multi-field) remain fully
functional, mixed updates are rejected atomically (no partial write), and
the trusted service-role pipeline is completely unaffected. Full evidence:
`reports/registry/registry-national-d1-migration-result.json`,
`registry-national-d1-owner-write-after.json`,
`registry-national-d1-post-migration-full-check.json`.

<details>
<summary>Historical gap description (REGISTRY-NATIONAL-D, now fixed)</summary>

As of REGISTRY-NATIONAL-D, the REGISTRY_PROTECTED `establishments` columns
above were **not actually enforced** against direct owner writes. The base
RLS policy (`supabase/schema.sql:143`, `"Owners can update own establishments"`)
is row-level only — it has no column restriction. The `0014_rc1_security_fixes.sql`
trigger protects the platform-trust fields listed above, but was authored
before migration `0018` added the registry-provenance columns, so it never
covered them. An owner could set `source_ministry`, `official_id`,
`registry_import_batch`, etc. on their own row via a direct Supabase REST
call, bypassing the Next.js settings page entirely. This was live-reproduced
with a throwaway fixture in REGISTRY-NATIONAL-D.1 before the fix
(`reports/registry/registry-national-d1-owner-write-reproduction.json`) to
confirm it was a real, exploitable bug and not merely theoretical.

</details>

CMS-A may now launch additional owner-editable surface on `establishments`
without reopening this specific gap — the trigger protects the 6 registry
columns regardless of what else CMS-A adds.

## Owner-editable candidate fields

Confirmed via live schema + the existing owner settings page
(`src/app/dashboard/ecole/parametres/page.tsx`), which already restricts its
own form to exactly these fields:

- `name`, `city`, `neighborhood`, `phone`, `email`, `whatsapp`, `website`,
  `description`, `main_category`, `address`

Additional columns present live and reasonably CMS-content (not yet exposed
in the settings form, no known blocker found this sprint):
`quartier`, `region`, `latitude`, `longitude`, `emoji_logo`,
`couleur_primaire`, `couleur_secondaire`, `cover_image_url`, `hero_mode`.

`slug`, `created_at`, `main_category`/`sub_category`/`education_family` are
`EXISTS_BUT_NEEDS_POLICY` — technically present, but changing them has
knock-on effects (routing, search taxonomy, registry unique-index on
`(source_ministry, official_id)` is independent of slug, so no direct
registry conflict, but a product decision is still needed on whether an
owner should be allowed to rename their own slug).

## Schema gaps (MISSING_SCHEMA — needs a new migration + product decision)

No `establishments` column or obviously-named table was found this sprint for:
- `opening_hours`
- `social_links`
- `admission_info`

Separate tables exist and likely already back these content areas, but were
not audited in depth this sprint — CMS-A needs a product decision on which
table is authoritative before building UI:
- **gallery** → `establishment_images` (present)
- **programs** / **courses** → `school_programs` / `school_courses` (present)
- **tuition_info** → `school_fees` (present)
- **facilities** → `school_infrastructures` (present)

Full detail: `reports/registry/registry-national-d-cms-schema-audit.json`.

## RLS summary

- Row-level: owners can only touch rows where `auth.uid() = owner_id`
  (`supabase/schema.sql:143`). No `WITH CHECK` is specified, so Postgres
  reuses the `USING` expression — this means an owner **cannot** reassign
  `owner_id` to another user or null it out (implicitly protected), but
  **can** write any other column's value, including registry-protected ones
  (see gap above).
- Column-level: enforced via two independent, coexisting triggers, both
  **confirmed live** as of 2026-08-23 (REGISTRY-NATIONAL-D.1, behavioral
  verification — this session still has no direct `pg_catalog` query access,
  so liveness was proven by observing each trigger's exact error message
  fire on a real owner write attempt, not by static file reading):
  - `protect_establishment_privileged_columns` (`0014`) — platform-trust fields
    (`is_verified`, `is_featured`, `subscription_plan`, `forfait`, `verification_status`).
  - `protect_establishment_registry_columns` (`0023`) — registry-provenance
    fields (`official_id`, `source_ministry`, `source_reference`, `source_url`,
    `source_updated_at`, `registry_import_batch`).
- `service_role` (used by all `/api/admin/*` routes and all
  `scripts/school-registry/*` scripts) bypasses RLS entirely — `auth.uid()`
  is always `NULL` for these calls, so neither trigger ever blocks them.

Full detail: `reports/registry/registry-national-d-cms-rls-audit.json`.
