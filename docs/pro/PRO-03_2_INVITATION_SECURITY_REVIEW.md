# PRO-03.2.2 — Closed Invitation Creation Surface

Date: 2026-08-20  
Status: creation/revocation surface closed locally; SQL proposed, not validated, not executed.

## Architect blockers resolved

| Control | Final decision | Result |
|---|---|---|
| Creator identity | Derived from `auth.uid()` inside the dormant RPC | PRESERVED |
| Caller-controlled creator | `p_created_by` removed; superseded signature dropped | REMOVED |
| Revoker identity | Derived from `auth.uid()` inside the dormant RPC | PRESERVED |
| Create EXECUTE | No beneficiary among application/Data API roles | CLOSED |
| Revoke EXECUTE | No beneficiary among application/Data API roles | CLOSED |
| Consume EXECUTE | `authenticated` only | OPEN, NARROW |
| School authority | Current caller must own the exact establishment | PASS |
| Platform exception | None admitted in V1 | FAIL CLOSED |
| Token transport | POST body to same-origin bootstrap, then HttpOnly cookie | PASS |
| Callback URL | Auth code only; no invitation token parameter | PASS |
| Consumption trigger | Explicit same-origin POST only | PASS |
| Terminal cleanup | Cookie expired on success and every terminal failure | PASS |

## Creator and revoker authority

`create_targeted_invitation` no longer accepts `p_created_by`. It assigns `v_creator_id := auth.uid()`, confirms that identity exists in `auth.users`, then requires `establishments.owner_id = v_creator_id` for the requested establishment. The stored `created_by` and any automatic expiry revocation are attributed to that derived identity.

`revoke_targeted_invitation` no longer accepts `p_revoked_by`. It locks the invitation, derives `v_revoker_id := auth.uid()` and verifies ownership of the invitation's actual establishment before revoking it. A caller cannot choose another identity or move the authorization check to another school.

Both functions revoke execution from `PUBLIC`, `anon`, `authenticated` and `service_role`, with no subsequent grant. They remain versioned but dormant. The old service-role signatures are dropped and there is no platform-admin shortcut. `consume_targeted_invitation` independently revokes all four roles, then grants only `authenticated`.

The three invitation functions remain `SECURITY DEFINER` because the private history table and atomic teacher/staff writes are intentionally inaccessible directly. Every function has an empty `search_path` and uses schema-qualified objects. Only consumption currently exposes an executable RPC contract.

## Token confidentiality and transport

The raw token is never accepted from a URL:

1. a same-origin `POST /auth/preparer-invitation` receives the token in the request body;
2. the route validates its exact format and places it in a ten-minute `HttpOnly` cookie, `Secure` in production, `SameSite=Lax`, scoped to `/auth`;
3. the browser may then authenticate with Supabase;
4. `/auth/callback` exchanges only the Supabase Auth `code`, checks only for cookie presence and never reads an invitation query parameter;
5. the callback redirects to the confirmation resource without any secret;
6. `GET /auth/consommer-invitation` displays a confirmation form and performs no RPC;
7. only same-origin `POST /auth/consommer-invitation` consumes the token with the authenticated session;
8. every terminal result expires the cookie, whether consumption succeeds or fails.

Redirects contain only generic status and, after success, non-secret resource identifiers that the result page revalidates against `user.id`. No token is placed in a redirect, rendered page, error, log or analytics event. All relevant responses retain `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.

### Delivery boundary

Because a bearer token in an email link would itself be a URL leak, activation must not generate such a link. The future delivery mechanism must use a non-secret same-origin landing page plus an out-of-band code entry, or another reviewed mechanism that submits the secret in a POST body. The creation routes remain HTTP 503, so no token is currently minted or delivered by the application.

## GET preloading review

The earlier GET consumer was unsafe because browser/link prefetch, security scanners or speculative navigation could consume the invitation. The corrected GET only renders a static confirmation form. The mutation is POST-only, checks the exact same origin and uses `SameSite=Lax`. Thus preloading the GET cannot consume, revoke or link anything.

## Atomic consumption and isolation

Consumption still requires `auth.uid()`, matches the authenticated user's normalized Auth email, locks and revalidates the invitation, then locks teacher before staff. Teacher and staff must belong to the invitation establishment and must be unlinked or already linked to the same caller. Any mismatch, expiry, revocation, replay or concurrent loss raises an exception and rolls back all changes.

The proposal retains the composite same-school foreign key, unique companion rule, advisory lock, `FOR UPDATE`, conditional consumed marker and history. `private.targeted_invitations` remains outside the exposed schema with RLS enabled and no direct privileges for `PUBLIC`, `anon`, `authenticated` or `service_role`.

## Conclusion

The final direct-creation bypass is closed locally. Runtime ACL, SQL and concurrency tests remain prepared but unexecuted. Delivery alternatives are documented separately in `PRO-03_3_INVITATION_DELIVERY_OPTIONS.md`; none is activated. Eddy and architect approval are required before any migration validation, execution, route activation or deployment.
