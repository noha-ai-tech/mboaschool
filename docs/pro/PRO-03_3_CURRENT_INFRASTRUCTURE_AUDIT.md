# PRO-03.3 — Current infrastructure audit

Status: **PREPARED LOCALLY — NOT EXECUTED — NOT DEPLOYED**  
Audit date: 2026-08-20  
Branch: `feat/pro-school-organization`

## Scope and method

This is a read-only repository audit. Environment **names** were inspected; no
environment value or secret was printed. No Supabase command, database request,
email delivery, Vercel operation, push, or deployment was performed.

## Findings

| Area | Repository evidence | Consequence for PRO-03.3 |
|---|---|---|
| Next.js runtime | Next `15.5.23`, App Router route handlers, no invitation route declares `runtime = "edge"` | The invitation issuer can use the default Node.js runtime. Pin it explicitly when activated. |
| User Supabase client | `src/lib/supabase/server.ts` uses `@supabase/ssr` and request cookies | Existing verified-user session path is reusable. |
| Browser Supabase client | `src/lib/supabase.ts` contains only public URL/anon configuration | It must never receive issuer credentials or the raw token. |
| Admin Supabase client | `src/lib/supabase/admin.ts` uses the server-only service-role key | Too broad for invitation issuance; do not reuse it. |
| Session and school check | `authorizeEstablishmentRoute` → `requireEstablishmentAccess` → `auth.getUser()`, explicit UUID, exact `establishments.id` and `owner_id` | Reuse as the first application check; retain an independent database check. |
| Personnel/teacher routes | Both `/api/personnel/[id]/inviter` and `/api/enseignants/[id]/inviter` verify explicit resource + establishment + normalized email and return HTTP 503 | Good closed entry points; keep closed until approved implementation. |
| Provider | No email SDK, provider adapter, API key name, or outbound-email implementation found | Provider selection and configuration are prerequisites, not part of this preparation. |
| Existing notification code | Claim/admission notification helpers are no-op console stubs and swallow delivery absence | They are not suitable for invitations or delivery acknowledgment. |
| Environment names | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`; `NODE_ENV` is read by code | A future server-only `INVITATION_ISSUER_DATABASE_URL` and provider key are missing. No value was read. |
| Vercel | Deployment checklist exists; no `vercel.json` or `.vercel/project.json` was found | The repo suggests Vercel intent but cannot prove a linked project or runtime settings. |
| Supabase Edge Functions | No `supabase/functions` and no `supabase/config.toml` | Option C adds a new runtime and operational surface. |
| Queue/worker | No outbox, PGMQ, queue client, worker, cron, `waitUntil`, or `after` implementation | Option B is viable later, but not an existing capability. |
| Audit/logging | `platform_audit_log` is platform-admin oriented; application code has ordinary console logs; no invitation audit ledger exists | Add a private, secret-free delivery-attempt ledger. Do not put tokens in the platform log. |
| Database proposal | PRO-03.2.2 leaves create/revoke dormant, consume authenticated only, and the table private | Preserve that boundary. Add a separate private internal issuer surface. |

## Confirmed gaps before activation

1. No direct PostgreSQL server driver is installed. A future implementation must
   choose and pin one (for example `postgres`) rather than use the Data API.
2. No dedicated runtime login or server-only connection secret exists.
3. No email provider, sender domain, provider credential, or delivery adapter is
   configured.
4. No durable cleanup/reconciliation runner exists for stale pending attempts.
5. No production observability redaction test exists for invitation secrets.

These gaps are intentional blockers. The design and migration are prepared; the
application issuer is **not implemented or activated** in PRO-03.3.

## Production facts supplied for this review

PRO-03.2.2 is treated as the production baseline: private table and RLS present,
direct table access denied, create/revoke inaccessible, consume authenticated
only, zero invitations, creation routes returning 503, and no business-data
change. This audit did not query production to reconfirm those facts.

