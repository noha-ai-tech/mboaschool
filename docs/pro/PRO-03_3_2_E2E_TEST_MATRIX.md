# PRO-03.3.2 — E2E test matrix

Status: staging plan — **NOT EXECUTED**.

| Area | Case | Expected result |
|---|---|---|
| Lock | Missing configuration | Teacher/staff issue routes return HTTP 503 |
| Lock | Complete-looking environment while source is locked | HTTP 503; no pool connection |
| Lock | Source/config present but simulated provider | HTTP 503; no issuance |
| Supavisor | Exact staging ref, exact configured regional host, suffixed LOGIN, port 6543, database postgres, verify-full | Sanitized configuration accepted; no connection |
| Supavisor | Missing/wrong ref or unsuffixed/generic/privileged user | Generic rejection; no connection |
| Supavisor | Arbitrary host, IP, localhost, or suffix-spoofed host | Generic rejection; no connection |
| Supavisor | Weaker/missing TLS, wrong port/database, extra/duplicate parameter or fragment | Generic rejection; no connection |
| Confidentiality | Invalid URI contains a synthetic password | Generic exception contains neither URI nor password |
| ACL preflight | Read-only PUBLIC audit returns rows | Stop before LOGIN creation; review each function; no automatic revoke |
| Identity | Browser supplies `actor_id`, `owner_id`, or `created_by` | Generic 400; ignored nowhere |
| Ownership | Owner A targets School B | Denied before issuer call |
| Resource | School A request uses a School B resource UUID | Not found/denied before issuer call |
| Email | Body email differs from stored normalized resource email | Body field rejected; stored email used |
| Page | Open `/auth/activer-invitation` without parameters | Non-secret form, no external resources |
| Page | Submit code | Same-origin POST only; no code in URL/redirect |
| Cookie | Valid preparation | HttpOnly, short, scoped `/auth`, Secure in production |
| Cookie | Invalid, success, expired, revoked, replay | Cookie cleared on every terminal path |
| Consumption | GET confirmation | No mutation/RPC |
| Consumption | POST valid delivered code by matching user | One atomic link, one consumption |
| Consumption | Pending/failed/revoked/expired/second use | Rejected without partial link |
| Executor | Unknown function or extra parameter | Rejected before connection/query |
| Executor | Valid allow-listed call | Bound values, `SET LOCAL ROLE`, exact columns, commit |
| Executor | SQL/result/timeout failure | Rollback or connection destruction; release exactly once |
| Confidentiality | Synthetic code in DB/provider error | Generic response/error; no code in logs |
| Rate limit | Six concurrent actor+school keys | At most five accepted in one hour |
| Rate limit | Four concurrent resource keys | At most three accepted in 24 hours |
| Idempotency | Same key and same payload replayed | Same status, no code, no provider redelivery |
| Idempotency | Same key with changed payload | Conflict, no new row/delivery |
| Retry | New key references terminal failed/revoked attempt | New invitation/attempt and one new delivery |
| Provider | Confirmed success + SQL success | Atomically delivered/consumable |
| Provider | Confirmed failure | Atomically failed/revoked |
| Provider | Ambiguous or timeout | Pending, non-consumable, then stale-revoked |
| Provider | Success but SQL confirmation throws | Pending and non-consumable; reconciliation required |
| Expiry | Code expires during delivery | Failed/revoked; never delivered/consumable |
| ACL | LOGIN before `SET ROLE` | No user-defined function executable |
| ACL | `SET LOCAL ROLE invitation_issuer` | Exactly five private functions executable; no table access |
| Cleanup | Revoke/drop temporary LOGIN and secret | Sessions gone; role/secret absent; final row audit clean |

Evidence must be secret-free: status codes, catalog booleans, counts, transition names, and synthetic identifiers only. Do not capture cookies, connection strings, activation codes, raw provider bodies, or SQL parameter arrays in screenshots or CI artifacts.
