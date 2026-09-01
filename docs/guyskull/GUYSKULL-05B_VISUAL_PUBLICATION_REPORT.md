# GUYSKULL-05B — VISUAL PUBLICATION REPORT

> Historical first-batch report. Eddy subsequently authorized the three remaining concepts; see `GUYSKULL-05C_REMAINING_VISUALS_PUBLICATION_REPORT.md`.

Date: 2026-08-31  
Branch: `codex/guyskull-01b-reconciliation`  
Project: `Ecoles237` — `umcwwynrftidytxgqkwi`  
Target school: `a4cc4966-0d85-4c63-9c24-0538b8d5133b` (`guyskull`)

## AUTHORIZATION AND SELECTION

Eddy explicitly authorized Codex to select and integrate the Guyskull images. The published core selection contains exactly eight visuals:

1. campus master;
2. facade;
3. courtyard;
4. classroom;
5. pedagogical activity;
6. school life;
7. sanitary facilities;
8. canteen.

Computer room, library and play/sports remain local and unpublished because those facilities have not been confirmed by Guyskull.

## PRE-WRITE GATES

- Exact Supabase project ref: **PASS**.
- Exact school UUID, name, category and owner: **PASS**.
- Bucket `school-images` exists and is public: **PASS**.
- Eight local files present, each below 5 MiB: **PASS**.
- Frozen size and SHA-256 for every selected file: **PASS**.
- Duplicate selected captions in the Guyskull gallery: **0**.
- Guyskull gallery before publication: **1 row**.
- Existing row retained as baseline; no deletion or update was authorized.
- Rollback evidence written locally before the first write: **YES**.

Executed script SHA-256: `4fe1800b242326161fefa19acdb1a59ad2cbc6465874c2f6f10109236b7d9e03`  
Rollback script SHA-256: `fdf3241a3cb7c149bf86fe11a4505ff21e09fcd879901f6d8363871ccc932101`

## WRITES

- Storage objects uploaded: **8**.
- `school_images` rows inserted: **8**.
- Status: **`live`**, to make the explicitly authorized selection visible on the public school page without a deployment.
- Captions: every new row explicitly says `conceptuel`, `démonstration`, `à confirmer`, or `équipement à confirmer`.
- Existing Guyskull row changed or deleted: **NO**.
- Other school rows changed: **0**.
- Schema, migration, Auth or invitation changes: **0**.

The service-role maintenance path was used because there is no Guyskull owner session available and the regular CMS publication function intentionally has no owner/admin bypass. The operation was hard-scoped to the exact project, school UUID, planned row IDs and planned Storage paths.

## POST-CHECK

- Guyskull gallery after publication: **9 rows** = 1 prior + 8 new.
- Eight planned rows found with exact UUID, path, URL, caption and `live` status: **PASS**.
- Anonymous gallery read sees all eight new rows: **PASS**.
- Eight public image downloads: **8/8 HTTP 200**.
- MIME type: **8/8 `image/png`**.
- Downloaded byte counts equal frozen local byte counts: **8/8 PASS**.
- Prior gallery row preserved: **PASS**.
- Non-Guyskull image-row count unchanged: **PASS**.
- Rollback executed: **NO — not required**.
- Exact rollback remains available from the local, gitignored evidence file.

## LOCAL QUALITY

- TypeScript: **PASS** — `npx tsc --noEmit --incremental false`, exit 0.
- Targeted lint: **PASS**, exit 0.
- Tests: **187/187 PASS**.
- Build: **PASS**, exit 0; 88 static pages generated.
- Push: **NO**.
- Deployment: **NO**.

## RESULT

- SELECTED VISUALS PUBLISHED: **8/8**.
- SANITARY VISUAL INCLUDED: **YES**.
- CANTEEN VISUAL INCLUDED: **YES**.
- UNCONFIRMED COMPUTER/LIBRARY/SPORT CONCEPTS PUBLISHED: **NO**.
- OTHER SCHOOLS AFFECTED: **NO**.
- BUSINESS DATA CHANGED: **YES — eight authorized Guyskull gallery rows only**.
- DATABASE WRITES: **8 inserts**.
- STORAGE WRITES: **8 uploads**.
- READY FOR EDDY VISUAL REVIEW: **YES**.
- READY TO INFORM CLAUDE: **YES**.
