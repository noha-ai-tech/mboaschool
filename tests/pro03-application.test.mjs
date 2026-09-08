import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isValidEstablishmentId,
  resolveEstablishmentContext,
  withEstablishmentQuery,
} from "../src/lib/school/establishmentContext.ts";
import {
  EstablishmentAccessError,
  requireEstablishmentAccess,
} from "../src/lib/school/establishmentAccess.ts";

const SCHOOL_A = "11111111-1111-4111-8111-111111111111";
const SCHOOL_B = "22222222-2222-4222-8222-222222222222";
const SCHOOL_C = "33333333-3333-4333-8333-333333333333";
const OWNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const routeFiles = [
  "src/app/api/enseignants/creer/route.ts",
  "src/app/api/enseignants/[id]/inviter/route.ts",
  "src/app/api/messagerie/envoyer/route.ts",
  "src/app/api/payroll/calculer/route.ts",
  "src/app/api/payroll/[id]/valider-direction/route.ts",
  "src/app/api/payroll/[id]/valider-rh/route.ts",
  "src/app/api/personnel/creer/route.ts",
  "src/app/api/personnel/[id]/code-acces/route.ts",
  "src/app/api/personnel/[id]/inviter/route.ts",
  "src/app/api/pointage/enregistrer/route.ts",
  "src/app/api/timetable/generate/route.ts",
  "src/app/api/timetable/publish/route.ts",
];

function resolution(explicitId, cookieId, accessibleIds) {
  return resolveEstablishmentContext({ explicitId, cookieId, accessibleIds });
}

function ownerClient({ userId = OWNER_A, school = null, authError = null } = {}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
        error: authError,
      }),
    },
    from(table) {
      assert.equal(table, "establishments");
      const filters = new Map();
      const query = {
        select() { return query; },
        eq(column, value) { filters.set(column, value); return query; },
        async maybeSingle() {
          const matches = school
            && school.id === filters.get("id")
            && school.owner_id === filters.get("owner_id");
          return { data: matches ? school : null, error: null };
        },
      };
      return query;
    },
  };
}

test("UUID validation accepts canonical UUIDs and rejects forged identifiers", () => {
  assert.equal(isValidEstablishmentId(SCHOOL_A), true);
  assert.equal(isValidEstablishmentId("school-a' OR true --"), false);
  assert.equal(isValidEstablishmentId(null), false);
});

test("URL context has priority over a different valid cookie", () => {
  assert.deepEqual(resolution(SCHOOL_A, SCHOOL_B, [SCHOOL_A, SCHOOL_B]), {
    establishmentId: SCHOOL_A,
    source: "url",
    reason: "resolved",
  });
});

test("invalid explicit URL fails closed instead of falling back to cookie", () => {
  assert.equal(resolution("bad-id", SCHOOL_A, [SCHOOL_A]).reason, "invalid_url");
});

test("inaccessible explicit school fails closed instead of falling back", () => {
  assert.equal(resolution(SCHOOL_B, SCHOOL_A, [SCHOOL_A]).reason, "inaccessible_url");
});

test("a valid accessible cookie is only a preference fallback", () => {
  assert.equal(resolution(null, SCHOOL_A, [SCHOOL_A, SCHOOL_B]).establishmentId, SCHOOL_A);
});

test("invalid and inaccessible cookies are ignored", () => {
  assert.equal(resolution(null, "bad-id", [SCHOOL_A, SCHOOL_B]).reason, "selection_required");
  assert.equal(resolution(null, SCHOOL_C, [SCHOOL_A, SCHOOL_B]).reason, "selection_required");
});

test("zero, one and multiple schools have deterministic states", () => {
  assert.equal(resolution(null, null, []).reason, "none");
  assert.equal(resolution(null, null, [SCHOOL_A]).source, "single");
  assert.equal(resolution(null, null, [SCHOOL_A, SCHOOL_B]).reason, "selection_required");
});

test("two tabs keep independent URL authority despite cookie changes", () => {
  assert.equal(resolution(SCHOOL_A, SCHOOL_C, [SCHOOL_A, SCHOOL_B, SCHOOL_C]).establishmentId, SCHOOL_A);
  assert.equal(resolution(SCHOOL_B, SCHOOL_C, [SCHOOL_A, SCHOOL_B, SCHOOL_C]).establishmentId, SCHOOL_B);
});

test("internal links preserve useful query parameters and set school", () => {
  assert.equal(
    withEstablishmentQuery("/pro/personnel?status=actif#liste", SCHOOL_A),
    `/pro/personnel?status=actif&school=${SCHOOL_A}#liste`,
  );
});

test("Owner A can access owned School A", async () => {
  const access = await requireEstablishmentAccess({
    supabase: ownerClient({
      school: { id: SCHOOL_A, owner_id: OWNER_A, forfait: "pro" },
    }),
    requestedEstablishmentId: SCHOOL_A,
    capability: "pro:view",
  });
  assert.equal(access.establishment.id, SCHOOL_A);
  assert.equal(access.accessSource, "owner");
});

test("Owner A is denied for foreign School B", async () => {
  await assert.rejects(
    requireEstablishmentAccess({
      supabase: ownerClient({
        school: { id: SCHOOL_B, owner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", forfait: "pro" },
      }),
      requestedEstablishmentId: SCHOOL_B,
      capability: "pro:view",
    }),
    (error) => error instanceof EstablishmentAccessError && error.code === "ESTABLISHMENT_FORBIDDEN",
  );
});

test("inactive staff and users without ownership receive no PRO-03.1 capability", async () => {
  await assert.rejects(
    requireEstablishmentAccess({
      supabase: ownerClient(),
      requestedEstablishmentId: SCHOOL_A,
      capability: "personnel:manage",
    }),
    (error) => error.code === "ESTABLISHMENT_FORBIDDEN",
  );
});

test("unauthenticated and forged identifiers are controlled denials", async () => {
  await assert.rejects(
    requireEstablishmentAccess({
      supabase: ownerClient({ userId: null }),
      requestedEstablishmentId: SCHOOL_A,
      capability: "pro:view",
    }),
    (error) => error.code === "UNAUTHENTICATED",
  );
  await assert.rejects(
    requireEstablishmentAccess({
      supabase: ownerClient(),
      requestedEstablishmentId: "forged",
      capability: "pro:view",
    }),
    (error) => error.code === "INVALID_ESTABLISHMENT_ID",
  );
});

test("all 12 mono-school routes require explicit validated establishment context", async () => {
  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    assert.match(source, /requestedEstablishmentId/, file);
    assert.match(source, /authorizeEstablishmentRoute/, file);
    assert.doesNotMatch(source, /\.eq\(["']owner_id["'],\s*user\.id\)\s*\.single\(\)/s, file);
  }
});

test("teacher-matter relation validates both children against the same school", async () => {
  const source = await readFile("src/app/api/enseignants/[id]/matieres/route.ts", "utf8");
  assert.match(source, /\.eq\("id", enseignantId\)[\s\S]*\.eq\("etablissement_id", access\.establishment\.id\)/);
  assert.match(source, /\.from\("matieres"\)[\s\S]*\.eq\("etablissement_id", access\.establishment\.id\)[\s\S]*\.in\("id", matiereIds\)/);
});

test("every RPC call passes p_etablissement_id", async () => {
  const files = [
    "src/app/enseignant/mon-espace/page.tsx",
    "src/app/pro/pointage/historique/page.tsx",
    "src/app/api/payroll/calculer/route.ts",
  ];
  let count = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const calls = source.split(/\.rpc\("calculer_heures_enseignant"/).slice(1);
    count += calls.length;
    for (const call of calls) assert.match(call.slice(0, 500), /p_etablissement_id/, file);
  }
  assert.equal(count, 4);
});

test("invitation flow is blocked until hashed-token SQL is approved", async () => {
  const welcome = await readFile("src/app/auth/enseignant-bienvenue/page.tsx", "utf8");
  const teacherInvite = await readFile("src/app/api/enseignants/[id]/inviter/route.ts", "utf8");
  const staffInvite = await readFile("src/app/api/personnel/[id]/inviter/route.ts", "utf8");
  const proposedSql = await readFile("docs/pro/PRO-03_1_INVITATIONS_PROPOSED.sql", "utf8");
  assert.doesNotMatch(`${welcome}\n${teacherInvite}\n${staffInvite}`, /createAdminClient|\.eq\(["']email["']/);
  assert.match(teacherInvite, /503/);
  assert.match(staffInvite, /503/);
  assert.match(proposedSql.split(/\r?\n/, 1)[0], /PROPOSED, NOT VALIDATED, NOT EXECUTED/);
  assert.match(proposedSql, /token_hash/);
  assert.match(proposedSql, /gen_random_bytes\(32\)/);
  assert.match(proposedSql, /digest\(v_raw_token, 'sha256'\)/);
  assert.match(proposedSql, /for update/);
  assert.match(proposedSql, /consumed_at/);
});

test("PRO-03 waves replace all 38 legacy policies with explicit school-safe checks", async () => {
  const wavePaths = [
    ["docs/pro/PRO-03_WAVE_A_PROPOSED.sql", 1],
    ["docs/pro/PRO-03_WAVE_B_PROPOSED.sql", 12],
    ["docs/pro/PRO-03_WAVE_C_PROPOSED.sql", 11],
    ["docs/pro/PRO-03_WAVE_D_PROPOSED.sql", 14],
  ];

  let combined = "";
  for (const [path, expectedPolicyCount] of wavePaths) {
    const sql = await readFile(path, "utf8");
    assert.equal((sql.match(/^create policy /gim) ?? []).length, expectedPolicyCount, path);
    combined += `\n${sql}`;

    for (const statement of sql.split(/^create policy /gim).slice(1)) {
      if (!/for all to authenticated/i.test(statement)) continue;
      assert.match(statement, /\busing\s*\(/i, path);
      assert.match(statement, /\bwith check\s*\(/i, path);
    }
  }

  assert.equal((combined.match(/^create policy /gim) ?? []).length, 38);
  assert.doesNotMatch(combined, /current_establishment_id\s*\(/i);
  assert.doesNotMatch(combined, /is_own_establishment\s*\(/i);
  assert.match(combined, /on public\.ai_usage\s+for select\s+to authenticated/i);
  assert.match(combined, /on public\.ai_usage\s+for insert\s+to authenticated/i);

  for (const invariant of [
    /responsable_staff_member_id[\s\S]*responsible\.etablissement_id = sections\.etablissement_id/,
    /classroom\.establishment_id = emplois_du_temps\.etablissement_id/,
    /subject\.etablissement_id = emplois_du_temps\.etablissement_id/,
    /teacher\.etablissement_id = pointages\.etablissement_id/,
    /slot\.etablissement_id = pointages\.etablissement_id/,
    /schedule\.etablissement_id = remplacements\.etablissement_id/,
    /batch\.etablissement_id = school_setup_files\.etablissement_id/,
    /related_draft\.etablissement_id = school_setup_issues\.etablissement_id/,
  ]) assert.match(combined, invariant);
});

test("hours RPC becomes explicit, invoker-scoped and authenticated-only", async () => {
  const sql = await readFile("docs/pro/PRO-03_WAVE_C_PROPOSED.sql", "utf8");
  const functionSql = sql.slice(sql.indexOf("create or replace function public.calculer_heures_enseignant"));
  assert.match(functionSql, /p_etablissement_id uuid\s*\)/);
  assert.doesNotMatch(functionSql, /p_etablissement_id uuid\s+default/i);
  assert.match(functionSql, /security invoker/i);
  assert.match(functionSql, /set search_path = ''/i);
  assert.match(functionSql, /arrival\.etablissement_id = p_etablissement_id/);
  assert.match(functionSql, /from public, anon, service_role;/i);
  assert.match(functionSql, /to authenticated;/i);
});
