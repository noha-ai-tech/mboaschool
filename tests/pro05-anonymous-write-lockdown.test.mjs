import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proposalPath =
  "docs/pro/PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_PROPOSED.sql";
const rollbackPath =
  "docs/pro/PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_ROLLBACK.sql";
const executedMigrationPath =
  "supabase/migrations/20260824214831_pro_05_1_anonymous_public_write_lockdown.sql";
const reportPath =
  "docs/pro/PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_AUDIT.md";

async function text(path) {
  return readFile(path, "utf8");
}

test("PRO-05.1 proposal is atomic, guarded and contains no persistent business DML", async () => {
  const sql = await text(proposalPath);

  assert.match(sql, /^begin;/im);
  assert.match(sql, /set local lock_timeout = '5s'/i);
  assert.match(sql, /set local statement_timeout = '2min'/i);
  assert.match(
    sql,
    /lock table[\s\S]*public\.classes,[\s\S]*public\.class_announcements,[\s\S]*public\.school_dashboard_context[\s\S]*in access exclusive mode/i,
  );
  assert.match(sql, /lock table public\.applications in access share mode/i);
  assert.match(sql, /PRO05_1_INTERMEDIATE_OR_DRIFTED_STATE/i);
  assert.match(sql, /current_setting\('pro05_1\.state'/i);
  assert.match(sql, /59f185d3f0bbf13bbfda775de0d551a7/i);
  assert.match(sql, /PRO05_1_BUSINESS_ROWS_CHANGED/i);
  assert.match(sql, /PRO05_1_TRUTH_TABLE_ROWS_CHANGED/i);
  assert.match(sql, /commit;\s*$/i);
  assert.doesNotMatch(
    sql,
    /^\s*(insert\s+into|update|delete\s+from)\s+public\.(class_announcements|school_dashboard_context|applications)\b/im,
  );
  assert.doesNotMatch(sql, /^\s*(merge\s+into|truncate\s+)/im);
  assert.match(sql, /PRO05_1_TRUTH_ROLLBACK_OWNER/i);
});

test("all legacy anonymous and PUBLIC class policies are removed", async () => {
  const sql = await text(proposalPath);

  for (const name of [
    "Allow all classes delete",
    "Allow all classes insert",
    "Allow all classes select",
    "Owners can manage classes",
    "Public can read classes",
    "Allow class announcements delete",
    "Allow class announcements insert",
    "Allow class announcements select",
    "Allow all dashboard context insert",
    "Allow all dashboard context select",
    "Allow all dashboard context update",
  ]) {
    assert.match(sql, new RegExp(`drop policy "${name}"`, "i"), name);
  }
});

test("classes keeps explicit public read and authenticated owner-only writes", async () => {
  const sql = await text(proposalPath);

  assert.match(
    sql,
    /create policy classes_public_read[\s\S]*for select[\s\S]*to anon, authenticated[\s\S]*using \(true\)/i,
  );
  assert.match(
    sql,
    /create policy classes_owner_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check/i,
  );
  assert.match(
    sql,
    /create policy classes_owner_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using[\s\S]*with check/i,
  );
  assert.match(
    sql,
    /create policy classes_owner_delete[\s\S]*for delete[\s\S]*to authenticated[\s\S]*using/i,
  );

  const ownerChecks = sql.match(/e\.owner_id = \(select auth\.uid\(\)\)/gi) ?? [];
  assert.equal(ownerChecks.length, 4);
  assert.match(sql, /e\.id = classes\.establishment_id/i);
  assert.match(sql, /section_row\.id = classes\.section_id/i);
  assert.match(
    sql,
    /section_row\.etablissement_id = classes\.establishment_id/i,
  );
  const policyStart = sql.indexOf("create policy classes_public_read");
  const policyEnd = sql.indexOf(
    "elsif current_setting('pro05_1.state'",
    policyStart,
  );
  assert.ok(policyStart >= 0 && policyEnd > policyStart);
  assert.doesNotMatch(
    sql.slice(policyStart, policyEnd),
    /is_platform_admin\s*\(/i,
  );
});

test("owner validation uses catalog dependencies and a rollback-only real truth table", async () => {
  const sql = await text(proposalPath);

  assert.doesNotMatch(sql, /v_owner_predicate/i);
  assert.doesNotMatch(
    sql,
    /regexp_replace\(policy_row\.(qual|with_check)/i,
  );
  assert.doesNotMatch(sql, /pol(?:qual|withcheck)::text/i);
  assert.match(sql, /from pg_policy policy_row/i);
  assert.match(sql, /join pg_depend dependency_row/i);
  assert.match(sql, /dependency_row\.refobjid = 'auth\.uid\(\)'::regprocedure/i);
  assert.match(sql, /'public\.classes'::regclass, 'establishment_id'/i);
  assert.match(sql, /'public\.establishments'::regclass, 'owner_id'/i);
  assert.match(sql, /'public\.sections'::regclass, 'etablissement_id'/i);
  assert.match(sql, /'public\.is_platform_admin\(\)'::regprocedure/i);

  assert.match(sql, /set local role authenticated/i);
  assert.match(sql, /PRO05_1_TRUTH_OWNER_ALLOW_FAILED/i);
  assert.match(sql, /PRO05_1_TRUTH_OWNER_A_FOREIGN_DENY_FAILED/i);
  assert.match(sql, /PRO05_1_TRUTH_AUTHENTICATED_NON_OWNER_DENY_FAILED/i);
  assert.match(sql, /set local role anon/i);
  assert.match(sql, /PRO05_1_TRUTH_ANON_DENY_FAILED/i);
  assert.match(sql, /when insufficient_privilege then v_denied := true/i);

  assert.match(
    sql,
    /update public\.classes[\s\S]*truth_class_a[\s\S]*delete from public\.classes[\s\S]*truth_class_a/i,
  );

  for (const code of ["P5101", "P5102", "P5103", "P5104", "P5105"]) {
    assert.match(sql, new RegExp(code), code);
  }

  assert.match(sql, /reset role;[\s\S]*PRO05_1_TRUTH_TABLE_ROWS_CHANGED/i);
});

test("final ACL is least privilege and closes both inactive tables", async () => {
  const sql = await text(proposalPath);

  assert.match(
    sql,
    /revoke all on table public\.classes from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.class_announcements from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.school_dashboard_context from public, anon, authenticated, service_role/i,
  );
  assert.match(sql, /grant select on table public\.classes to anon, authenticated/i);
  assert.match(
    sql,
    /grant insert, update, delete on table public\.classes to authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+[^;]+on table public\.(class_announcements|school_dashboard_context)/i,
  );
  assert.doesNotMatch(sql, /grant\s+[^;]+\s+to service_role/i);
});

test("applications_public_insert is checksum-guarded and never changed", async () => {
  const sql = await text(proposalPath);
  const rollback = await text(rollbackPath);
  const combined = `${sql}\n${rollback}`;

  assert.match(combined, /c53e8fd1b720fc18e2dca2c131ad109c/i);
  assert.doesNotMatch(
    combined,
    /(drop|create|alter)\s+policy\s+"?applications_public_insert/i,
  );
  assert.doesNotMatch(
    combined,
    /(grant|revoke)\s+[^;]*on(?: table)? public\.applications/i,
  );
});

test("truth model denies every cross-school or non-owner write", () => {
  const schoolA = "school-a";
  const schoolB = "school-b";
  const ownerA = "owner-a";
  const ownerB = "owner-b";
  const sectionA = { id: "section-a", school: schoolA };
  const sectionB = { id: "section-b", school: schoolB };

  function canWriteClass({ role, actor, school, owner, section }) {
    return role === "authenticated"
      && actor === owner
      && school != null
      && (section == null || section.school === school);
  }

  assert.equal(
    canWriteClass({ role: "authenticated", actor: ownerA, school: schoolA, owner: ownerA, section: sectionA }),
    true,
  );
  assert.equal(
    canWriteClass({ role: "anon", actor: null, school: schoolA, owner: ownerA, section: null }),
    false,
  );
  assert.equal(
    canWriteClass({ role: "authenticated", actor: ownerB, school: schoolA, owner: ownerA, section: null }),
    false,
  );
  assert.equal(
    canWriteClass({ role: "authenticated", actor: ownerA, school: schoolA, owner: ownerA, section: sectionB }),
    false,
  );
  assert.equal(
    canWriteClass({ role: "service_role", actor: ownerA, school: schoolA, owner: ownerA, section: null }),
    false,
  );
});

test("rollback is exact-final-state gated and restores the captured initial state", async () => {
  const rollback = await text(rollbackPath);

  assert.match(rollback, /PRO05_1_ROLLBACK_POLICY_STATE_DRIFT/i);
  assert.match(rollback, /PRO05_1_ROLLBACK_ACL_DRIFT/i);
  assert.match(rollback, /PRO05_1_ROLLBACK_STRUCTURE_DRIFT/i);
  assert.match(rollback, /ad19aadfc8bd8d0f7b326322cf5aa623/i);
  assert.match(rollback, /82c5366e02982c43ff95945ded8b928c/i);
  assert.match(rollback, /7910f825740bddd3163519aaed6bd630/i);
  assert.match(
    rollback,
    /grant all on table public\.classes to anon, authenticated, service_role/i,
  );
  assert.match(rollback, /PRO05_1_ROLLBACK_BUSINESS_ROWS_CHANGED/i);
  assert.match(rollback, /commit;\s*$/i);
});

test("executed PRO-05.1 migration is an exact traceable copy", async () => {
  const proposal = await text(proposalPath);
  const executed = await text(executedMigrationPath);

  assert.equal(executed, proposal);
});

test("the audit records every mandatory decision without widening scope", async () => {
  const report = await text(reportPath);

  for (const heading of [
    "TABLES AUDITED",
    "ANON EFFECTIVE WRITES",
    "APPLICATION CONSUMERS",
    "REQUIRED WRITE MODEL",
    "POLICIES TO REMOVE",
    "POLICIES TO CREATE",
    "GRANTS TO REVOKE",
    "CROSS-SCHOOL TRUTH TABLE",
    "APPLICATIONS PUBLIC INSERT UNCHANGED",
    "PREFLIGHT",
    "POST-CHECK",
    "ROLLBACK",
    "SECURITY ADVISOR",
  ]) {
    assert.match(report, new RegExp(heading, "i"), heading);
  }

  assert.match(report, /class_announcements[\s\S]*inactive/i);
  assert.match(report, /school_dashboard_context[\s\S]*inactive/i);
  assert.match(report, /DATABASE WRITES:\s*0/i);
  assert.match(report, /INVITATIONS ACTIVATED:\s*NO/i);
});
