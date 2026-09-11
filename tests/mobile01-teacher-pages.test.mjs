import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql";

// ============================================================================
// Migration structure — RLS/security properties not already covered by the
// real-Postgres execution tests (mobile01-attendance-security-postgres.test.mjs).
// ============================================================================

test("students table is never publicly readable, unlike classes — a nominative roster is personal data", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /create table if not exists public\.students/);
  assert.doesNotMatch(src, /"students_public_read"|for select to anon/);
});

test("student_attendance carries no direct insert/update policy for authenticated users — writes are RPC-only", async () => {
  const src = await source(MIGRATION);
  const tableStart = src.indexOf("create table if not exists public.student_attendance");
  const tableSection = src.slice(tableStart, src.indexOf("-- 4. MARQUE DE PRÉSENCE"));
  assert.doesNotMatch(tableSection, /for insert|for update|for all/, "no RLS policy should allow a direct write — only SELECT policies and the SECURITY DEFINER function");
});

test("lesson_sessions has no direct insert policy either — created only via the atomic upsert inside the RPC", async () => {
  const src = await source(MIGRATION);
  const tableStart = src.indexOf("create table if not exists public.lesson_sessions");
  const tableSection = src.slice(tableStart, src.indexOf("-- 3. APPEL ÉLÈVE"));
  assert.doesNotMatch(tableSection, /for insert|for update|for all/);
});

test("the teacher-read policy on students is derived from emplois_du_temps, matching the existing 'mes classes' pattern — no separate teacher-class assignment table invented", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /from public\.emplois_du_temps edt\s*\n\s*join public\.enseignants ens on ens\.id = edt\.enseignant_id\s*\n\s*where ens\.user_id = auth\.uid\(\)/);
});

test("sync_apply_attendance_mark applies the P1 fix from day one: both replay paths revalidate actor and establishment before returning", async () => {
  const src = await source(MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_attendance_mark");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));

  assert.match(fnBody, /if v_existing\.actor_user_id != v_caller or v_existing\.establishment_id != p_establishment_id then/);
  assert.match(fnBody, /if v_existing\.mutation_id is null or v_existing\.actor_user_id != v_caller or v_existing\.establishment_id != p_establishment_id then/);
});

test("conflict detection compares last_recorded_by (actor identity), never a bare updated_at timestamp — avoids false self-conflicts", async () => {
  const src = await source(MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_attendance_mark");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /v_existing_attendance\.last_recorded_by != v_caller/);
  assert.doesNotMatch(fnBody, /v_existing_attendance\.updated_at != /);
});

test("authorization verifies BOTH the teacher's assignment to the course AND the student's membership in that course's class", async () => {
  const src = await source(MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_attendance_mark");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /enseignant_id = v_teacher_id/);
  assert.match(fnBody, /s\.classe_id = v_edt\.classe_id/);
});

test("the session is upserted idempotently on (emploi_du_temps_id, session_date) — the client never needs a server-generated session id to act", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /unique \(emploi_du_temps_id, session_date\)/);
  assert.match(src, /on conflict \(emploi_du_temps_id, session_date\) do update/);
});

test("a genuine concurrent double-submit is caught by a unique_violation handler, same pattern as sync_apply_absence_create", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /exception\s*\n\s*when unique_violation then/);
});

test("marked as not applied to production, like every other migration this sprint", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /PRÉPARÉE MAIS NON EXÉCUTÉE/);
});

test("no existing table is modified (classes, emplois_du_temps, enseignants, establishments)", async () => {
  const src = await source(MIGRATION);
  assert.doesNotMatch(src, /alter table public\.classes\b/);
  assert.doesNotMatch(src, /alter table public\.emplois_du_temps\b/);
  assert.doesNotMatch(src, /alter table public\.enseignants\b/);
  assert.doesNotMatch(src, /drop table/i);
});

// ============================================================================
// Offline engine wiring
// ============================================================================

test("attendance is a registered offline entity type", async () => {
  const src = await source("src/lib/offline/types.ts");
  assert.match(src, /"absence" \| "attendance" \| "draft-note"/);
});

test("attendance has an explicit conflict strategy: server-wins-explicit-conflict, never silent last-write-wins", async () => {
  const src = await source("src/lib/offline/conflict.ts");
  assert.match(src, /attendance: "server-wins-explicit-conflict"/);
});

test("the sync push route dispatches attendance mutations to the atomic RPC, never a direct table write", async () => {
  const src = await source("src/app/api/sync/push/route.ts");
  assert.match(src, /entityType === "attendance"/);
  assert.match(src, /\.rpc\("sync_apply_attendance_mark"/);
  assert.doesNotMatch(src, /\.from\("student_attendance"\)\.insert/);
});

test("the route still never uses createAdminClient, even with the new entity type added", async () => {
  const src = await source("src/app/api/sync/push/route.ts");
  assert.doesNotMatch(src, /createAdminClient/);
});

// ============================================================================
// Frontend — authorization defense in depth, empty states, offline UX
// ============================================================================

test("the course workspace page filters emplois_du_temps by the caller's OWN enseignant_id — defense in depth beyond RLS, never trusts the URL id alone", async () => {
  const src = await source("src/app/enseignant/cours/[id]/page.tsx");
  assert.match(src, /\.eq\("id", id\)/);
  assert.match(src, /\.eq\("enseignant_id", enseignant\.id\)/);
  assert.match(src, /if \(!edt\) notFound\(\);/);
});

test("the course workspace never fetches another teacher's enseignant row — it resolves the caller's own via user_id", async () => {
  const src = await source("src/app/enseignant/cours/[id]/page.tsx");
  assert.match(src, /\.eq\("user_id", user\.id\)/);
});

test("RollCall reuses the shared SyncStatus component, never a second concurrent offline indicator", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  assert.match(src, /import \{ SyncStatus \} from "@\/components\/offline\/SyncStatus"/);
  assert.match(src, /<SyncStatus \/>/);
});

test("RollCall reads its active user from the shared syncIdentity, the same source the sync engine uses — no separate getUser() call", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  assert.match(src, /getActiveSyncIdentity\(\)\.userId/);
  assert.match(src, /subscribeActiveSyncIdentity/);
});

test("RollCall enqueues every tap as a 'create' operation on the offline outbox, matching the attendance.mark event model", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  assert.match(src, /entityType: "attendance"/);
  assert.match(src, /operation: "create"/);
  assert.match(src, /enqueueMutation\(/);
});

test("RollCall's payload matches exactly what the RPC/route expect: emploi_du_temps_id, student_id, session_date, status", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  assert.match(src, /emploi_du_temps_id: emploiDuTempsId, student_id: studentId, session_date: sessionDate, status/);
});

test("'Tout le monde présent' only marks students not already marked, never overwrites an existing exception", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  const fn = src.slice(src.indexOf("async function markAllPresent"), src.indexOf("async function markAllPresent") + 300);
  assert.match(fn, /if \(!statuses\[student\.id\]\)/);
});

test("an empty roster shows an honest empty state, never a fabricated student list", async () => {
  const src = await source("src/components/enseignant/RollCall.tsx");
  assert.match(src, /Aucun élève enregistré dans cette classe pour l&apos;instant\./);
});

test("the teacher home page never shows a fake next course — an honest empty state exists for a day with no remaining courses", async () => {
  const src = await source("src/app/enseignant/page.tsx");
  assert.match(src, /Aucun cours restant aujourd&apos;hui\./);
  assert.match(src, /Aucun cours prévu aujourd&apos;hui\./);
});

test("the home page computes course status (à venir/maintenant/terminé) from real creneau times, not a hardcoded default", async () => {
  const src = await source("src/app/enseignant/page.tsx");
  assert.match(src, /function statutCours/);
  assert.match(src, /"a_venir" \| "maintenant" \| "termine"/);
});

test("the 'Faire l'appel' quick action is disabled (not a dead link) when there is no course left today", async () => {
  const src = await source("src/app/enseignant/page.tsx");
  assert.match(src, /cursor-not-allowed/);
});

test("TeacherDayCachePrimer only caches today's schedule and the rosters of classes actually taught today — never the whole school", async () => {
  const homeSrc = await source("src/app/enseignant/page.tsx");
  assert.match(homeSrc, /classeIdsAujourdhui/);
  assert.doesNotMatch(homeSrc, /\.from\("students"\)\.select\([^)]*\)(?!\s*\.in\("classe_id")/);
});

test("the schedule page fetches across ALL of the teacher's enseignant rows (multi-school), not just one establishment", async () => {
  const src = await source("src/app/enseignant/emploi-du-temps/page.tsx");
  assert.match(src, /for \(const ens of enseignants\)/);
  assert.doesNotMatch(src, /\.eq\("etablissement_id",/);
});

test("post-login destination for teachers points to the new mobile-first home, hard navigation mechanism untouched", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /profile\?\.role === "teacher"[\s\S]{0,500}destination = "\/enseignant"/);
  assert.match(src, /window\.location\.href = destination;/);
  assert.doesNotMatch(src, /router\.push\(destination\)/);
});

test("mon-espace no longer duplicates 'Prochain cours'/'Ma journée' now that /enseignant owns that surface", async () => {
  const src = await source("src/app/enseignant/mon-espace/page.tsx");
  // Vérifie l'absence des BLOCS JSX rendus (titres de section), pas d'une
  // simple sous-chaîne — ce fichier mentionne "Prochain cours" dans son
  // propre commentaire expliquant la suppression.
  assert.doesNotMatch(src, /uppercase text-text-secondary mb-4">Prochain cours</);
  assert.doesNotMatch(src, /uppercase text-text-secondary mb-4">Ma journée</);
  assert.doesNotMatch(src, /const coursDuJour/);
  assert.doesNotMatch(src, /const prochainCours/);
});

test("mon-espace still preserves hours/salary/documents/messages sections, untouched by the MOBILE-01 trim", async () => {
  const src = await source("src/app/enseignant/mon-espace/page.tsx");
  assert.match(src, /Mes heures/);
  assert.match(src, /Mon salaire/);
  assert.match(src, /Mes documents/);
  assert.match(src, /Messages de la direction/);
});

// MOBILE-01.2 — regression for a real bug found by browser E2E: the time
// label in the "Ma journée" list (both on /enseignant and
// /enseignant/emploi-du-temps) sits in a fixed w-12 (48px) box sized for a
// 5-character "08:00" string. Postgres `time` columns serialize as
// "08:00:00" (8 characters) over PostgREST, so the un-truncated value
// visually overflowed its box and overlapped the subject name next to it —
// confirmed by an actual screenshot at 390px, not just a DOM overflow
// check (the page's overall scrollWidth/clientWidth stayed equal, since
// this was text overlapping text, not a layout overflow). Fixed by
// trimming to HH:MM at the display call site in both places.
test("MOBILE-01.2: the schedule time label is trimmed to HH:MM before display, never the raw HH:MM:SS from Postgres — prevents it overlapping the subject name in its fixed-width box", async () => {
  const scheduleViewSrc = await source("src/components/enseignant/ScheduleView.tsx");
  assert.match(
    scheduleViewSrc,
    /w-12 shrink-0">\{e\.heureDebut\.slice\(0, 5\)\}/,
    "ScheduleView must trim heureDebut to 5 characters (HH:MM) before rendering it in its fixed-width box"
  );

  const enseignantHomeSrc = await source("src/app/enseignant/page.tsx");
  assert.match(
    enseignantHomeSrc,
    /w-12 shrink-0">\{c\.creneaux_horaires\?\.heure_debut\?\.slice\(0, 5\)\}/,
    "/enseignant's 'Ma journée' list must trim heure_debut to 5 characters (HH:MM) before rendering it in its fixed-width box"
  );
});
