# ÉCOLES237 — canonical empty-database replay manifest

> Local preparation only. No SQL replay, migration-history repair, production
> write, push or deployment is authorized by this document.

## Preview and cost state

The temporary preview `pro-05-3-auth-preview-eddy`:

- former project ref: `aeuotedgyhdvjxtcahcj`;
- former branch id: `ee1c7e17-af4a-4faf-b5ef-15d93ded14a1`;
- deletion API result: `success=true`;
- post-delete inventory: only `main`, project ref
  `umcwwynrftidytxgqkwi`;
- preview present after deletion: **NO**.

Future Branching Compute accumulation for that preview has stopped. Usage already
accrued before deletion remains billable and can appear later in Billing.

## Canonical rules

1. The autonomous baseline and all replay artifacts remain under `docs/pro/`.
2. No artifact from this work is active under `supabase/migrations/`.
3. The baseline source cut is commit
   `a3d06575395ba0cf7635805ac8c07d17af9634b7`, before the first remote
   timestamped migration `20260819130053`.
4. Remote `statements[]` are archived exactly in
   `canonical-replay-remote/REMOTE_MIGRATIONS_EXACT.json`.
5. A numerical migration and its timestamped equivalent must never both be
   replayed.
6. The three historically untracked tables are embedded once in the baseline;
   their separate draft files are reference snapshots, not canonical replay
   steps.
7. Persistent business backfills are excluded. The five idempotent
   `storage.buckets` rows are configuration and remain included.

## Corrected chronology of the three tables

Production OIDs establish the exact relative creation order:

| Object | Production OID | Canonical position |
|---|---:|---|
| `school_announcements` | 17794 | historical Auth/CMS setup |
| `school_dashboard_context` | 17827 | immediately after school announcements |
| `class_announcements` | 17850 | after dashboard context |
| `school_images` | 17939 | after both recovered tables |
| `school_documents` | 17955 | after school images |
| `sessions_impersonation` | 18142 | after both media tables, before `0001` |
| `enseignants` | 18315 | later numerical migrations |
| `establishment_registry_identifiers` | 20285 | historical `0021` |

Consequences:

- `school_dashboard_context` and `class_announcements` are embedded inside
  the historical `auth-setup.sql` phase, before media tables.
- `sessions_impersonation` is embedded after the Auth/CMS phase and before
  `0001_timetable_schema.sql`.
- `DRAFT_20260819121000_school_dashboard_context.sql`,
  `DRAFT_20260819122000_class_announcements.sql` and
  `DRAFT_20260819123000_sessions_impersonation.sql` are **reference-only**.
  They must not enter the executable replay path.

## Canonical replay order

There are 41 canonical steps: one baseline, three historical bridges, and 37
exact remote migrations.

| Order | Version | Canonical artifact |
|---:|---|---|
| 1 | `20260819120000` draft | autonomous historical baseline, including the three recovered tables |
| 2 | `20260819130053` | exact remote migration |
| 3 | `20260819133012` | exact remote migration |
| 4 | `20260819134849` draft | bridge `0021`, old two-column index to final three-column index |
| 5 | `20260819184429` | exact remote migration |
| 6 | `20260819184517` | exact remote migration |
| 7 | `20260819192235` | exact remote migration |
| 8 | `20260819192340` | exact remote migration |
| 9 | `20260819192427` | exact remote migration |
| 10 | `20260820053907` | exact remote migration |
| 11 | `20260820053923` | exact remote migration |
| 12 | `20260820054026` | exact remote migration |
| 13 | `20260820212659` | exact remote migration |
| 14 | `20260820212709` | exact remote migration |
| 15 | `20260820212727` | exact remote migration |
| 16 | `20260820212752` | exact remote migration |
| 17 | `20260820235152` | exact remote migration |
| 18 | `20260820235451` | exact remote migration |
| 19 | `20260821012026` | exact remote migration |
| 20 | `20260821061820` | exact remote migration |
| 21 | `20260821191654` draft | bridge `0022`, add `MINTRANSPORT` |
| 22 | `20260822011243` | exact remote migration |
| 23 | `20260822011259` | exact remote migration |
| 24 | `20260822154940` | exact remote migration |
| 25 | `20260822155238` | exact remote migration |
| 26 | `20260822194239` | exact remote migration |
| 27 | `20260822194251` | exact remote migration |
| 28 | `20260822194302` | exact remote migration |
| 29 | `20260823045123` draft | bridge `0023`, registry-column protection |
| 30 | `20260823060906` | exact remote migration |
| 31 | `20260823202851` | exact remote migration |
| 32 | `20260824043833` | exact remote migration |
| 33 | `20260824055719` | exact remote migration |
| 34 | `20260824062038` | exact remote migration |
| 35 | `20260824062810` | exact remote migration |
| 36 | `20260824070848` | exact remote migration |
| 37 | `20260824172928` | exact remote migration |
| 38 | `20260824212610` | exact remote migration |
| 39 | `20260824214831` | exact remote migration |
| 40 | `20260824234025` | exact remote migration |
| 41 | `20260825054125` | exact remote migration |

## Autonomous baseline composition

`DRAFT_20260819120000_historical_baseline.sql` contains, in order:

1. `supabase/schema.sql`;
2. historical `auth-setup.sql`, with the two recovered tables embedded at
   their catalogued positions;
3. recovered `sessions_impersonation`;
4. `0001`–`0020` except nonexistent `0017`;
5. historical `0021` from the source cut, still using
   `UNIQUE (registry, identifier)`;
6. transactional preflight and post-checks.

Consolidation-specific changes are limited to:

- declaring `teacher` in the initial `user_role` enum and omitting the later
  same-transaction `ALTER TYPE ... ADD VALUE`;
- omitting the `0009` `enseignants -> staff_members` business backfill;
- omitting the two `0012` updates of existing admissions;
- embedding the three recovered tables at their catalogued positions.

Expected baseline inventory: 66 public tables, 39 public enums, one public view,
12 named application triggers, the historical `0021` index, and five known
Storage bucket configuration rows.

## Bridge 0021 safety

`DRAFT_20260819134849_bridge_0021_registry_identifier_uniqueness.sql`:

- accepts only the exact initial two-key index or exact final three-key index;
- validates B-tree, unique, valid, ready, non-partial, no expressions, exact
  key count and exact key order using `indkey[0]`, `indkey[1]`,
  `indkey[2]`;
- rejects a named index with any structural drift;
- preserves and post-checks table columns, defaults, constraints, unrelated
  indexes and row count;
- is transactional, replay-safe from the exact final state, and contains no
  DML.

## Numerical/timestamped equivalences

| Numerical/local source | Canonical replacement | Replay decision |
|---|---|---|
| `schema.sql`, `auth-setup.sql`, `0001`–`0020` | baseline draft `20260819120000` | replay baseline only |
| historical `0021` | baseline + bridge draft `20260819134849` | split at the historical source cut |
| `0022` | bridge draft `20260821191654` | bridge only |
| `0023` | bridge draft `20260823045123` | bridge only |
| `0024` | `20260820212659` + `20260820212727` | exact remote pair only |
| `0025` | `20260820212709` + `20260820212752` | exact remote pair only |
| `0026` | `20260820235451` | exact remote only |
| `0027` | `20260821012026` | exact remote only |
| `0028` | `20260821061820` | exact remote only |
| `0029` | `20260822154940` | exact remote only |
| `0030` | `20260824055719` | exact remote only |
| `0031` | `20260824062810` + `20260824070848` | exact remote pair only |
| `0032` | `20260824172928` | exact remote only |
| `0033` | `20260824212610` | exact remote only |
| `0034` | `20260824234025` | exact remote only |
| local PRO-01 `20260819150540` | `20260819184429` + `20260819184517` | exact remote pair only |
| timestamped B/C/D/gate, PRO-04 and PRO-05 | same remote versions | one file per version |

## Remote snapshot

- production project read: `umcwwynrftidytxgqkwi`;
- remote migration rows: 37;
- raw remote statement elements: 128;
- authoritative archive:
  `canonical-replay-remote/REMOTE_MIGRATIONS_EXACT.json`;
- replay renderings: 37 SQL files in `canonical-replay-remote/`;
- exact archive SHA-256:
  `85c63692c8f3fdb0e97ad94adae784c0ffebb4c3bc6ada2ab0ecd23be5e685b2`;
- autonomous baseline SHA-256:
  `afbfa5b2e6f9b6d56b7cfd31709eb406ed28af247a28afd31bb82b06dd44e7b9`;
- bridge `0021` SHA-256:
  `ef4315853d0c57c42df5de5169d934ca4c0ebf7b249cdcdf4275f8b78d49ebdc`;
- per-file checksums: `canonical-replay-remote/SHA256SUMS.txt`;
- production writes: 0;
- migration history changes: 0.

## Required next gate

The next authorized action can be a local disposable Supabase empty-database
replay. Before any active migration files are created, that test must prove:

1. all 41 steps replay in chronological order;
2. there is no duplicate DDL from numerical migrations;
3. final catalog parity covers tables, columns, constraints, indexes,
   functions, triggers, policies, ACLs, owners and `search_path`;
4. no business seed/backfill is present;
5. no production or remote-history operation occurs.

## Current state

- preview deleted: **YES**;
- future preview compute accrual stopped: **YES**;
- autonomous baseline assembled locally: **YES**;
- exact remote migrations retrieved read-only: **YES**;
- active migration file created by this task: **NO**;
- migration replayed: **NO**;
- history repaired: **NO**;
- production database writes: **0**;
- PRO-05.3: **PENDING**.
