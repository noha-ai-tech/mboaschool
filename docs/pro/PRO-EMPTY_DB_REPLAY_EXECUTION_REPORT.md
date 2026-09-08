# ÉCOLES237 — Empty-database canonical replay execution report

Date: 2026-08-28  
Scope: local disposable environment only  
Outcome: **FAIL — container runtime unavailable**

## Safety boundary

- Production project ref: `umcwwynrftidytxgqkwi`.
- Remote Supabase writes: **0**.
- Remote migration-history operations: **0**.
- Files created under repository `supabase/migrations`: **0**.
- Temporary project root:
  `C:\Users\User\Documents\mboaschool\.tmp\pro-empty-db-replay-7d42adde978246a89e341c17cb88be98`.
- Temporary project destroyed after capture: **YES**.

## Canonical assembly

The isolated project contained exactly:

- one autonomous historical baseline;
- three bridges: `0021`, `0022`, `0023`;
- 37 exact remote migration renderings;
- 41 migration files total;
- 41 distinct timestamp versions;
- first version: `20260819120000`;
- last version: `20260825054125`;
- remaining draft execution guards in the isolated copies: 0;
- detected persistent `staff_members` business backfill: no;
- detected existing-admissions status/tracking backfill: no.

The repository's active migration directory was not used or modified.

## Runtime preflight

- Node.js: `v24.18.0`.
- npm: `11.16.0`.
- Supabase CLI: `2.116.0`.
- Docker CLI/daemon: **NOT INSTALLED**.
- Podman: **NOT INSTALLED**.
- nerdctl: **NOT INSTALLED**.
- WSL: **NOT INSTALLED**.

## Start attempt

Exactly one local start attempt was made:

```text
LegacyDockerLifecycleInspectError
failed to inspect container health: docker: command not found
(podman also not found)
```

The failure occurred before any container or local database was created.

## Required checks

| Check | Result |
|---|---|
| Canonical order assembled | PASS |
| Duplicate timestamp versions | PASS — none |
| Persistent business backfills absent | PASS — static |
| Local Supabase instance started | FAIL |
| Migrations applied in order | NOT RUN — 0/41 |
| Double-DDL runtime check | NOT RUN |
| Final schema compared with production | NOT RUN |
| Tables/enums/constraints/indexes parity | NOT RUN |
| Functions/triggers/policies parity | NOT RUN |
| ACL and `search_path` parity | NOT RUN |
| Five Storage buckets after replay | NOT RUN |
| Empty business tables after replay | NOT RUN |
| PRO-03/04/05 runtime conformance | NOT RUN |
| First `db reset` | NOT RUN |
| Second `db reset` | NOT RUN |
| Temporary environment destroyed | PASS |

## Conclusion

The canonical path is assembled and statically coherent, but the requested
database proof cannot be produced on this workstation without Docker Desktop
or Podman. Installing a system container runtime was outside the authorization
and would be a material host-level change.

**EMPTY-DB REPLAY FAIL**

