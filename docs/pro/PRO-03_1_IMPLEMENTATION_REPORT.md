# PRO-03.1 — Application Multi-Establishment Prerequisites

Updated: 2026-08-20 — PRO-03.2.2 closed invitation creation surface  
Branch: `feat/pro-school-organization`  
Baseline HEAD: `e93bc28cb6285ba62589cd45c8bdaab0f9acc9fa`

## Outcome

The application prerequisites for an explicit multi-establishment context are implemented locally. Production Wave A is recorded as executed and verified from the supplied operational context; Waves B–D and the invitation migration were not executed during this work. No Supabase operation was run, no business data was changed, and nothing was pushed or deployed.

Invitation creation remains deliberately unavailable until the proposed token migration is reviewed and applied. Both invitation endpoints fail closed with HTTP 503 and do not instantiate a service-role client.

## URL context decision

Selected contract: `/pro/...?school=[establishmentId]`.

This is safer than `/pro/[establishmentId]/...` for this prerequisite phase because it avoids relocating all existing route segments, changing route params, and risking incompatibilities in links and bookmarks. The shared `withEstablishmentQuery()` helper preserves existing query parameters and fragments.

Resolution order is:

1. explicit, valid and accessible `school` URL value;
2. valid and accessible cookie as a UX fallback only;
3. automatic resolution only when exactly one school is available;
4. explicit selection when several schools are available;
5. empty/restricted state when no school is available.

An invalid or inaccessible explicit URL value fails closed and never falls back to the cookie. Consequently, two tabs with two explicit URL values remain isolated even if another tab changes the preference cookie.

## Server authorization

`requireEstablishmentAccess()` validates the UUID, authenticates with `auth.getUser()`, performs a targeted `establishments.id + owner_id` lookup, verifies the Pro plan, returns the validated establishment and the `owner` source, and produces controlled 400/401/403/500 errors.

PRO-03.1 deliberately grants capabilities only to existing owners. Active staff memberships can be listed for context discovery, but staff and PRO-02 responsibilities do not gain new business capabilities. Organization membership is not an access source. Platform admins continue through their explicit platform workflows and never auto-load all 2,180 establishments.

`listAccessibleEstablishments()` returns a deduplicated union of owned schools and active staff memberships. If legacy staff RLS prevents that optional lookup before Wave A, it degrades safely to owned schools without widening access.

## Client and middleware boundary

- `SchoolContext` obtains its list from an authenticated server endpoint. It resolves UI state only; it does not authorize business operations.
- `ProSchoolSwitcher`, Pro navigation, dashboard navigation and mutation callers preserve the explicit school in links and request bodies.
- The cookie only records the last selection and is revalidated against the server-derived list.
- Middleware now chooses only the general authenticated zone. It does not query or select a business establishment.
- No polling or global cross-tab establishment authority was added.

## Routes, resources and RPC

All 12 audited mono-school routes accept `requestedEstablishmentId` and call the central authorization helper. Child resources are scoped by their own ID and the validated establishment. The teacher-to-matter write was additionally moved from a browser mutation to `/api/enseignants/[id]/matieres`, which validates the teacher and every matter against the same establishment.

All four real calls to `calculer_heures_enseignant` pass `p_etablissement_id`: two in the teacher space, one in Pro attendance history and one in payroll calculation. Payroll also verifies the staff member in the validated school before using its teacher ID.

## Invitations

The previous broad email attachment path was removed. The hardened proposal stores invitation history in `private.targeted_invitations` and grants no direct table access. Creation and revocation remain versioned but revoke `EXECUTE` from `PUBLIC`, `anon`, `authenticated` and `service_role`, with no grant to any application role. Their internal `auth.uid()` ownership checks are preserved for future review, but neither function can currently be called through PostgREST. Only authenticated token consumption is granted. No platform-admin exception is admitted in V1.

The token is random, hash-only at rest, expiring, revocable and single-use. Email is normalized as `lower(trim(email))` and confirms the identity of the resource already selected by UUID + establishment; it is never used to discover resources. Consumption locks and revalidates the invitation, then links a teacher and its optional HR staff row atomically, or a staff row and its optional teacher row atomically.

The raw token is submitted only in the body of same-origin `POST /auth/preparer-invitation`, before Supabase Auth, and is stored in a ten-minute `HttpOnly` cookie (`Secure` in production, `SameSite=Lax`). The callback never accepts an invitation token query parameter and only checks for cookie presence after exchanging the Supabase Auth code. `GET /auth/consommer-invitation` has no side effect and renders an explicit confirmation form; only same-origin POST performs authenticated consumption. Every terminal success or failure expires the cookie. All responses send `no-store`, `noindex` and `Referrer-Policy: no-referrer`.

No URL, redirect, rendered page, log, error or analytics event contains the invitation token. Since a bearer token in an email link would violate that rule, future activation requires a separately reviewed out-of-band code-entry or equivalent POST-only delivery design. The result page receives only non-sensitive identifiers and re-verifies the exact resource, establishment and authenticated user before displaying success.

The SQL is in `PRO-03_1_INVITATIONS_PROPOSED.sql` and is marked `PROPOSED, NOT VALIDATED, NOT EXECUTED`. Until it is approved and applied:

- invitation creation endpoints return 503;
- no invitation email is sent;
- no service-role write occurs;
- authenticated consumption fails closed because the RPC is absent.

## Local verification

- TypeScript: PASS — `npx tsc --noEmit`.
- Targeted lint: PASS — 0 errors, 0 warnings on the PRO-03.2.1 files.
- Tests: PASS — 37/37 with `npm run test:pro03`, including 20/20 invitation security tests.
- Build: PASS — `npm run build`, 81/81 pages generated. A non-blocking workspace-root warning reports the parent lockfile.
- Static search: no `.eq("owner_id", user.id).single()` pattern remains.
- Static search: every real RPC call contains `p_etablissement_id`.
- Static search: no invitation service-role write or email-based resource update remains.

## Files changed for PRO-03.1

Core and tooling:

- `package.json`
- `tsconfig.json`
- `src/lib/school/establishmentContext.ts`
- `src/lib/school/establishmentAccess.ts`
- `src/lib/school/establishmentRoute.ts`
- `src/lib/supabase/activeEstablishment.ts`
- `src/lib/school/SchoolContext.tsx`
- `src/middleware.ts`
- `tests/pro03-application.test.mjs`

Context UI and pages:

- `src/app/api/establishments/accessible/route.ts`
- `src/app/pro/selection-etablissement/page.tsx`
- `src/components/pro/EstablishmentSelectionList.tsx`
- `src/components/pro/ProNavigation.tsx`
- `src/components/pro/ProSchoolSwitcher.tsx`
- `src/app/pro/layout.tsx`
- `src/app/dashboard/ecole/layout.tsx`
- Pro pages under absences, configuration, timetables, teachers, matters, messaging, payroll, personnel, attendance, replacements and rooms.

Mutation callers and routes:

- the 12 routes listed in `PRO-03_1_ROUTE_MIGRATION_MAP.md`
- `src/app/api/enseignants/[id]/matieres/route.ts`
- `BoutonInviter`, `FormulaireCalculPaie`, `FormulaireMessage`, `FormulaireNouveauPersonnel`, `FormulaireNouvelEnseignant`, `PaieValidation`, `PersonnelAcces`, `BoutonGenerer` and `BoutonPublier`

Invitation flow:

- `src/app/auth/callback/route.ts`
- `src/app/auth/preparer-invitation/route.ts`
- `src/app/auth/consommer-invitation/route.ts`
- `src/app/auth/enseignant-bienvenue/page.tsx`
- `src/lib/invitations/targetedInvitation.ts`
- `docs/pro/PRO-03_1_INVITATIONS_PROPOSED.sql`
- `docs/pro/PRO-03_2_INVITATION_SQL_TESTS.sql`
- `docs/pro/PRO-03_3_INVITATION_DELIVERY_OPTIONS.md`
- `tests/pro03-invitations.test.mjs`

Pre-existing local PRO-01, PRO-02, PRO-03 architecture documents, the organization page and the PRO-01 migration were preserved and were not executed.

## Gate

Wave A production status: **EXECUTED AND VERIFIED (supplied operational state)**.  
Ready for final invitation architect review: **YES**.  
Ready to execute invitation migration or Waves B–D: **NO — Eddy and architect approval still required**.
