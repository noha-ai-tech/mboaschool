# PRO-03.1 — Route Migration Map

Every route below now receives `requestedEstablishmentId`, authenticates through `requireEstablishmentAccess()`, preserves owner-only capabilities for PRO-03.1, and scopes child resources to the validated establishment.

| # | Route | Capability | Child/resource correlation | Result |
|---|---|---|---|---|
| 1 | `POST /api/enseignants/creer` | `teachers:manage` | New teacher receives only the validated `etablissement_id` | PASS |
| 2 | `POST /api/enseignants/[id]/inviter` | `teachers:manage` | Teacher ID + `etablissement_id`; real flow blocked pending token migration | PASS / BLOCKED BY DESIGN |
| 3 | `POST /api/messagerie/envoyer` | `messaging:manage` | Message always receives validated `etablissement_id` and authenticated author | PASS |
| 4 | `POST /api/payroll/calculer` | `payroll:manage` | Staff member + school; dependent teacher, timetable and bulletin queries remain school-scoped | PASS |
| 5 | `POST /api/payroll/[id]/valider-direction` | `payroll:manage` | Bulletin ID + `etablissement_id`; update repeats both predicates | PASS |
| 6 | `POST /api/payroll/[id]/valider-rh` | `payroll:manage` | Bulletin ID + `etablissement_id`; update repeats both predicates | PASS |
| 7 | `POST /api/personnel/creer` | `personnel:manage` | Teacher/staff rows receive only validated `etablissement_id` | PASS |
| 8 | `POST /api/personnel/[id]/code-acces` | `personnel:manage` | Staff ID + `etablissement_id`; update repeats both predicates | PASS |
| 9 | `POST /api/personnel/[id]/inviter` | `personnel:manage` | Staff ID + `etablissement_id`; real flow blocked pending token migration | PASS / BLOCKED BY DESIGN |
| 10 | `POST /api/pointage/enregistrer` | `attendance:manage` | Teacher code is resolved only inside validated school; path and row use that school | PASS |
| 11 | `POST /api/timetable/generate` | `timetable:manage` | Classes, matters, volumes, teachers, links, availability and generated rows are school-scoped | PASS |
| 12 | `POST /api/timetable/publish` | `timetable:manage` | Draft selection, archive and publish updates all include `etablissement_id` | PASS |

## Additional child hardening

`POST /api/enseignants/[id]/matieres` replaces a direct browser insert. It verifies:

1. requested establishment access;
2. teacher UUID and teacher establishment;
3. every matter UUID and matter establishment;
4. relation insertion only after the full set matches.

This prevents a teacher from School A being associated with a matter from School B through client tampering.

## Removed mono-school assumptions

- No audited route discovers a school with `.eq("owner_id", user.id).single()`.
- Collection lookups are not collapsed with ambiguous `.single()` calls.
- Targeted `.single()`/`.maybeSingle()` remains valid only after a unique resource ID and establishment predicate have been supplied.
- The explicit request school, not the cookie, drives authorization.
