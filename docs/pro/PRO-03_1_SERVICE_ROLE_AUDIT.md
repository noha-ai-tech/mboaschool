# PRO-03.1 — Service Role Audit

## PRO-03.1 touched invitation flow

| Location | Previous risk | Current state | Decision |
|---|---|---|---|
| `api/enseignants/[id]/inviter` | Invitation could lead to broad attachment by email | Authenticated owner access + teacher ID + school correlation; HTTP 503 before any service-role client or email | REMOVED / FAIL CLOSED |
| `api/personnel/[id]/inviter` | Invitation could lead to broad attachment by email | Authenticated owner access + staff ID + school correlation; HTTP 503 before any service-role client or email | REMOVED / FAIL CLOSED |
| `auth/preparer-invitation` | Token transport through URL | Same-origin POST body sets a short-lived `HttpOnly` cookie before Auth | HARDENED |
| `auth/callback` | Token propagation could leak into callback URL | Never accepts the invitation token; checks only cookie presence | HARDENED |
| `auth/consommer-invitation` | GET preloading or privileged broad attachment | GET has no mutation; same-origin POST uses authenticated session RPC only | HARDENED / BLOCKED UNTIL SQL |
| `auth/enseignant-bienvenue` | Service-role update selected resources by connected email | Displays only a non-secret success/invalid status | REMOVED |

PRO-03.1 service-role writes are therefore **zero**. Authorization uses the session-scoped server client before any future privileged operation.

## Repository-wide retained service-role clients

These existing platform workflows are outside the establishment-context migration and were not changed. They are documented because they share the same admin client:

| Workflow | Authorization before admin client | Targeting | Audit conclusion |
|---|---|---|---|
| School plan | `requireAdmin("manage_subscriptions")` | Establishment primary key; only Pro synchronizes `forfait` | Targeted |
| Verify/reactivate/suspend school | `requireAdmin("manage_schools")` | Establishment primary key | Targeted |
| Change/remove administrator | `requireAdmin("manage_admins")` | Profile primary key | Targeted |
| Promote administrator | `requireAdmin("manage_admins")` | Email locates an existing Auth user, then update is by user/profile ID | Targeted identity operation; unrelated to school membership |
| Claim review/reject | Authenticated `platform_admin` profile | Claim primary key, then claim establishment primary key | Targeted |
| Claim approve | Authenticated `platform_admin` profile | Claim primary key and establishment primary key; `owner_id is null` concurrency guard | Targeted; competing claims are intentionally closed for that one establishment |

No retained service-role client is used by `requireEstablishmentAccess()` or by the accessible-school list. No retained PRO-03.1 write uses email as evidence of school membership. `raw_user_meta_data` is not used for authorization.

## Proposed invitation privileged boundary

After approval, the issuance path must:

1. authorize the actor with the normal session client;
2. validate one establishment and one resource;
3. call the service-only creation RPC, which revalidates creator ownership and the exact resource in the database;
4. receive one cryptographically random raw token and store only its SHA-256 hash;
5. send the raw token only in the recipient link;
6. never log or persist the raw token.

The table is in the non-exposed `private` schema with RLS and no direct grants, including to `service_role`. The three `SECURITY DEFINER` functions use `search_path = ''`, fully qualified objects and explicit EXECUTE revocations. Creation and revocation have no executable application role; consumption is callable only by `authenticated` and checks `auth.uid()`.

`create_targeted_invitation` remains versioned in `public`, but PRO-03.2.2 revokes EXECUTE from `PUBLIC`, `anon`, `authenticated` and `service_role` and grants it to nobody. The same closure applies to revocation. Only authenticated consumption is executable. A future delivery release must select a server-only issuer boundary; it must not reopen direct browser execution of the token-returning function.
