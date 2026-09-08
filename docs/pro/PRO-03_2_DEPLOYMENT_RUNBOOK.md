# PRO-03.2.2 — Closed Invitation Deployment Runbook

Status: proposed sequence only. No step was executed during PRO-03.2.1.

## Gate 0 — deployed fail-closed baseline

Production must already return HTTP 503 from both invitation creation routes before the migration is considered. Local code does not prove the deployed state. If the legacy email attachment flow is still deployed, first deploy the minimal fail-closed patch after explicit approval.

## Gate 1 — final SQL review

- Confirm `p_created_by` and `p_revoked_by` are absent from active signatures.
- Confirm creation and revocation derive identity from `auth.uid()`.
- Confirm exact-establishment ownership and no platform-admin exception.
- Confirm legacy service-role signatures are dropped.
- Confirm create and revoke have no `EXECUTE` beneficiary among `PUBLIC`, `anon`, `authenticated` or `service_role`.
- Confirm only consume is granted, and only to `authenticated`.
- Confirm `service_role` is not a member of `authenticated` in the target project, so it cannot inherit the consume grant.
- Confirm `SECURITY DEFINER`, empty `search_path` and schema qualification.
- Confirm table RLS and zero direct table privileges.

## Ordered rollout after approval

1. Apply the approved invitation migration in an isolated disposable database.
2. Run advisors and all prepared SQL authorization, lifecycle and concurrency cases.
3. Verify function ACLs directly, including negative `anon` and `service_role` calls.
4. Verify the preflight aborts on duplicate companions or cross-school links without repairing data.
5. Obtain Eddy + architect approval of the isolated validation evidence.
6. Confirm the production creation routes are still fail-closed.
7. Apply only the approved invitation migration through the controlled production process; do not combine Waves B–D.
8. Verify schema, RLS, ACLs, indexes, constraints and invitation-row count.
9. Deploy the application correction with closed invitation routes.
10. Smoke-test that callback, preparation, confirmation and result responses are `no-store` and `no-referrer`.
11. Verify `GET /auth/consommer-invitation` performs no RPC or write.
12. Verify invalid preparation, Auth failure, invalid cookie, wrong origin, RPC failure and success all clear the cookie on terminal paths.
13. Activate invitation creation only in a separate reviewed release.

## Future activation contract

Creation cannot be activated by granting the token-returning RPC to `authenticated`. A future release must first select and review a server-only issuer boundary from `PRO-03_3_INVITATION_DELIVERY_OPTIONS.md`. That boundary must preserve proof of the current owner, exact establishment, resource, normalized resource email and bounded TTL without returning the token to browser code.

The raw token must not be returned to browser JavaScript or placed in an email URL. A future reviewed delivery design must submit it through same-origin POST before Auth, for example after out-of-band code entry on a non-secret landing page. Application and infrastructure logging must exclude request bodies and invitation cookies.

Revocation remains dormant while issuance is dormant. A future issuer design must introduce a matching controlled revocation capability for delivery failures; it must not broadly grant the current RPC to browser roles.

## Migration-first answer

Conditionally safe only after the gates above. The migration exposes authenticated consumption but no creation or revocation capability. Production routes must still be fail-closed and operators must not manually seed tokens. The correction does not authorize migration execution, application deployment, invitation activation or Waves B–D.
