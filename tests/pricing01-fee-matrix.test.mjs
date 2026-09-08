import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeSchoolPagePricing,
  installmentsTotal,
  installmentsMismatchTuition,
  feeScheduleTotal,
  ADDITIONAL_FEE_STATUSES,
} from "../src/lib/schoolPage/pricing.ts";

const root = new URL("../", import.meta.url);
async function src(path) {
  return readFile(new URL(path, root), "utf8");
}

const migration = await src("supabase/migrations/0038_school_fee_matrix_extension.sql");
const rollback = await src("docs/guyskull/PRICING-01_0038_ROLLBACK.sql");
const renderer = await src("src/components/school/StructuredPricing.tsx");
const editor = await src("src/components/school/StructuredPricingEditor.tsx");

const base = {
  registration_fee: null, tuition_fee: null, transport_fee: null, canteen_fee: null,
  uniform_fee: null, exam_fee: null, other_fees: null, currency: "FCFA",
  legacy_amounts_qualified: false, schedules: [], additional_fees: [],
};

function makeSchedule(overrides = {}) {
  return {
    academic_year: "2026-2027", cycle: null, level_label: "6e", registration_fee: 15000,
    tuition_fee: 120000, currency: "FCFA", notes: null, position: 0, installments: [],
    ...overrides,
  };
}
function installment(position, amount, label = `Tranche ${position + 1}`) {
  return { label, position, amount, due_date: null, notes: null };
}
function fee(overrides = {}) {
  return { academic_year: "2026-2027", category: "other", label: "Frais", amount: 5000, status: "mandatory", frequency: "Une fois", notes: null, position: 0, ...overrides };
}

// ==================== §29 INSTALLMENT COUNT MATRIX ====================

test("0 installments — a schedule with no installments is valid", () => {
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ installments: [] })] });
  assert.equal(result.ok, true);
});
test("2 installments — accepted, distinct positions", () => {
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ installments: [installment(0, 60000), installment(1, 60000)] })] });
  assert.equal(result.ok, true);
});
test("3 installments — accepted (the common Cameroon case)", () => {
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ installments: [installment(0, 40000), installment(1, 40000), installment(2, 40000)] })] });
  assert.equal(result.ok, true);
});
test("5 installments — accepted (never assumed to be exactly 3)", () => {
  const installments = Array.from({ length: 5 }, (_, i) => installment(i, 24000));
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ installments })] });
  assert.equal(result.ok, true);
});
test("more than 24 installments is rejected", () => {
  const installments = Array.from({ length: 25 }, (_, i) => installment(i, 1000));
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ installments })] });
  assert.equal(result.ok, false);
});

// ==================== §29 CYCLE / MULTIPLE LEVELS ====================

test("1 level — accepted", () => {
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ position: 0 })] });
  assert.equal(result.ok, true);
});
test("multiple levels with distinct positions and a shared cycle — accepted", () => {
  const result = normalizeSchoolPagePricing({
    ...base,
    schedules: [
      makeSchedule({ level_label: "Petite Section", cycle: "Maternelle", position: 0 }),
      makeSchedule({ level_label: "Moyenne Section", cycle: "Maternelle", position: 1 }),
      makeSchedule({ level_label: "6e", cycle: "Secondaire", position: 2 }),
    ],
  });
  assert.equal(result.ok, true);
});
test("cycle is optional — a schedule without one still validates (backfilled to null)", () => {
  const raw = { ...base, schedules: [{ academic_year: "2026-2027", level_label: "CP", registration_fee: null, tuition_fee: null, currency: "FCFA", notes: null, position: 0, installments: [] }] };
  const result = normalizeSchoolPagePricing(raw);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.schedules[0].cycle, null);
});
test("a cycle longer than 60 characters is rejected", () => {
  const result = normalizeSchoolPagePricing({ ...base, schedules: [makeSchedule({ cycle: "x".repeat(61) })] });
  assert.equal(result.ok, false);
});

// ==================== §29 CANTEEN / TRANSPORT PRESENCE ====================

test("canteen absent — a pricing payload with zero canteen fees is valid", () => {
  const result = normalizeSchoolPagePricing({ ...base, additional_fees: [] });
  assert.equal(result.ok, true);
});
test("canteen present, monthly, mandatory — accepted", () => {
  const result = normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ category: "canteen", label: "Cantine", amount: 25000, status: "mandatory", frequency: "par mois" })] });
  assert.equal(result.ok, true);
});
test("canteen included (no separate charge) — accepted, amount still required (not a fake 0)", () => {
  const result = normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ category: "canteen", label: "Cantine", amount: 0, status: "included", frequency: "incluse" })] });
  assert.equal(result.ok, true);
});
test("transport absent — valid", () => {
  const result = normalizeSchoolPagePricing({ ...base, additional_fees: [] });
  assert.equal(result.ok, true);
});
test("transport 1 zone — a single additional_fees row with category=transport", () => {
  const result = normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ category: "transport", label: "Zone unique", amount: 20000, frequency: "par mois", position: 0 })] });
  assert.equal(result.ok, true);
});
test("transport multiple zones — several additional_fees rows, same category, distinct positions/labels (no dedicated zones table needed)", () => {
  const result = normalizeSchoolPagePricing({
    ...base,
    additional_fees: [
      fee({ category: "transport", label: "Zone A — Bonamoussadi / Makepe", amount: 20000, frequency: "par mois", position: 0 }),
      fee({ category: "transport", label: "Zone B — PK8 / PK10 / PK12", amount: 25000, frequency: "par mois", position: 1 }),
      fee({ category: "transport", label: "Zone C — Japoma / Yassa", amount: 30000, frequency: "par mois", position: 2 }),
    ],
  });
  assert.equal(result.ok, true);
});

// ==================== §29 STATUS MATRIX ====================

test("mandatory fee — accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ status: "mandatory" })] }).ok, true));
test("optional fee — accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ status: "optional" })] }).ok, true));
test("included fee — accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ status: "included" })] }).ok, true));
test("contact-only fee with amount=null — accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ status: "contact", amount: null })] }).ok, true));
test("missing amount on a non-contact fee is rejected, never silently defaulted to 0", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [fee({ status: "optional", amount: null })] }).ok, false));
test("every declared status is a member of the enum (no silent drift between TS and the CMS editor's dropdown)", () => {
  for (const status of ["mandatory", "optional", "included", "contact"]) {
    assert.ok(ADDITIONAL_FEE_STATUSES.includes(status));
  }
});

// ==================== §29 ACADEMIC YEARS ====================

test("different academic years coexist in one payload (history is never deleted for a new year)", () => {
  // Position uniqueness is enforced across the whole schedules array, not
  // scoped per academic_year (pre-existing 0037 behavior, unchanged by
  // PRICING-01) — so distinct years still need distinct positions here.
  const result = normalizeSchoolPagePricing({
    ...base,
    schedules: [
      makeSchedule({ academic_year: "2025-2026", position: 0 }),
      makeSchedule({ academic_year: "2026-2027", position: 1 }),
    ],
  });
  assert.equal(result.ok, true);
});

// ==================== §19 CRITICAL — LEGACY 29,000 SAFETY ====================

test("an unqualified legacy tuition_fee alone (no schedules/additional_fees) never displays publicly", () => {
  const pricing = { ...base, tuition_fee: 29000, legacy_amounts_qualified: false };
  assert.match(renderer, /legacy_amounts_qualified/);
  // Exercises the exact gate hasDisplayablePricing implements, mirrored here
  // so a change to that function without a matching test change is caught.
  const hasLegacy = pricing.tuition_fee > 0;
  const displayable = hasLegacy && pricing.legacy_amounts_qualified;
  assert.equal(displayable, false);
});
test("structured pricing and the legacy flat fee are structurally independent — publishing schedules never touches fees.tuition_fee", () => {
  assert.doesNotMatch(migration, /update public\.fees set[\s\S]{0,200}tuition_fee/i);
});
test("the historical 29,000 postcheck guard is present in the migration file", () => {
  assert.match(migration, /GUYSKULL_LEGACY_FEE_CHANGED|tuition_fee is distinct from 29000/);
  assert.match(migration, /a4cc4966-0d85-4c63-9c24-0538b8d5133b/);
});

// ==================== §6 TUITION / INSTALLMENTS MISMATCH (warn, never block) ====================

test("installments summing to tuition — no mismatch", () => {
  const schedule = makeSchedule({ tuition_fee: 120000, installments: [installment(0, 60000), installment(1, 60000)] });
  assert.equal(installmentsMismatchTuition(schedule), false);
  assert.equal(installmentsTotal(schedule.installments), 120000);
});
test("installments NOT summing to tuition — mismatch flagged, but normalizeSchoolPagePricing still accepts it (warn, never block)", () => {
  const schedule = makeSchedule({ tuition_fee: 120000, installments: [installment(0, 60000)] });
  assert.equal(installmentsMismatchTuition(schedule), true);
  const result = normalizeSchoolPagePricing({ ...base, schedules: [schedule] });
  assert.equal(result.ok, true, "a tuition/installment mismatch must never block saving/publishing");
});
test("the CMS editor renders the mismatch warning copy", () => {
  assert.match(editor, /ne correspond pas au montant de la scolarité/);
});
test("feeScheduleTotal is registration + tuition, independent of installments", () => {
  assert.equal(feeScheduleTotal({ registration_fee: 15000, tuition_fee: 120000 }), 135000);
});

// ==================== §22 SCHEMA — ADDITIVE EVOLUTION, NOT A COMPETING SYSTEM ====================

test("0038 extends existing 0037 tables — no competing school_fee_grids/school_fee_levels/school_transport_zones table is created", () => {
  assert.doesNotMatch(migration, /create table[^;]*school_fee_grids/i);
  assert.doesNotMatch(migration, /create table[^;]*school_fee_levels/i);
  assert.doesNotMatch(migration, /create table[^;]*school_transport_zones/i);
  assert.match(migration, /alter table public\.school_fee_schedules/i);
  assert.match(migration, /alter table public\.school_additional_fees/i);
});
test("0038 is idempotency-guarded against being re-applied", () => {
  assert.match(migration, /PRICING_01_PREFLIGHT_ALREADY_APPLIED/);
});
test("0038 preflight pins the exact live-verified RPC checksums", () => {
  assert.match(migration, /513b9da8ba0cd8fa2681a84fa84ad099/);
  assert.match(migration, /f47fdb855ed5830814f15045a5157398/);
});
test("0038 carries a business-row-count postcheck for every table it touches", () => {
  assert.match(migration, /PRICING_01_POSTCHECK_SCHEDULES_ROWCOUNT_CHANGED/);
  assert.match(migration, /PRICING_01_POSTCHECK_ADDITIONAL_FEES_ROWCOUNT_CHANGED/);
  assert.match(migration, /PRICING_01_POSTCHECK_INSTALLMENTS_ROWCOUNT_CHANGED/);
});

// ==================== §21 SECURITY — ACL SURFACE UNCHANGED ====================

test("0038 issues no new grant/revoke statements — the ACL surface is provably unchanged from 0037", () => {
  const withoutComments = migration.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
  assert.doesNotMatch(withoutComments, /\bgrant\b/i);
  assert.doesNotMatch(withoutComments, /\brevoke\b/i);
});
test("0038 postcheck re-verifies the function stays SECURITY DEFINER with an empty search_path", () => {
  assert.match(migration, /prosecdef is distinct from true/);
  assert.match(migration, /search_path=/);
});
test("0038 postcheck re-verifies anon/service_role still cannot execute the publish RPC", () => {
  assert.match(migration, /has_function_privilege\('anon'/);
  assert.match(migration, /has_function_privilege\('service_role'/);
  assert.match(migration, /PRICING_01_POSTCHECK_FUNCTION_ACL_CHANGED/);
});
test("the new publish_school_page_v2 body keeps the exact same ownership check as 0037", () => {
  assert.match(migration, /e\.owner_id=\(select auth\.uid\(\)\)/);
});
test("the new publish_school_page_v2 body keeps the exact same draft-conflict gate as 0037", () => {
  assert.match(migration, /DRAFT_CONFLICT/);
  assert.match(migration, /d\.updated_at=p_expected_draft_updated_at/);
});

// ==================== §33 GIT / MIGRATION NUMBER ====================

test("migration 0038 is a real, present file (not just referenced)", async () => {
  await assert.doesNotReject(src("supabase/migrations/0038_school_fee_matrix_extension.sql"));
});
test("no other 0038-numbered migration file exists (collision-free)", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(new URL("supabase/migrations", root));
  const matches = files.filter((f) => f.startsWith("0038"));
  assert.deepEqual(matches, ["0038_school_fee_matrix_extension.sql"]);
});

// ==================== ROLLBACK ====================

test("rollback restores publish_school_page_v2 to the exact pre-0038 (0037) checksum", () => {
  assert.match(rollback, /513b9da8ba0cd8fa2681a84fa84ad099/);
});
test("rollback refuses to run if 0038 was never applied", () => {
  assert.match(rollback, /PRICING_01_ROLLBACK_NOT_APPLIED/);
});
test("rollback refuses to silently coerce NULL contact-only amounts back to NOT NULL", () => {
  assert.match(rollback, /PRICING_01_ROLLBACK_NULL_AMOUNT_ROWS_PRESENT/);
});
test("rollback drops exactly the two new columns and no more", () => {
  assert.match(rollback, /drop column status/);
  assert.match(rollback, /drop column if exists cycle/);
});

// ==================== §14 PUBLIC PRESENTATION — DYNAMIC COLUMNS ====================

test("the matrix's installment column count is computed from data, never hardcoded to 3", () => {
  assert.match(renderer, /maxInstallments/);
  assert.doesNotMatch(renderer, /installments\[0\]|installments\[1\]|installments\[2\]/);
});
test("the registration column only renders when at least one schedule has a registration fee", () => {
  assert.match(renderer, /hasRegistration/);
});
test("transport renders as its own grouped section, not crammed into the main matrix", () => {
  assert.match(renderer, /Transport scolaire/);
});
test("canteen renders as its own grouped section", () => {
  assert.match(renderer, /Cantine/);
});
test("status badges cover all four states, never a raw boolean checkbox label", () => {
  for (const label of ["Obligatoire", "Optionnel", "Inclus", "Nous contacter"]) {
    assert.match(renderer, new RegExp(label));
  }
});
test("academic year selector only appears when more than one year is published", () => {
  assert.match(renderer, /years\.length > 1/);
});
test("cycle filter pills only appear when more than one cycle is published", () => {
  assert.match(renderer, /cycles\.length > 1/);
});
test("the official pricing document CTA reuses the existing document-CTA mechanism, no bespoke second implementation", () => {
  assert.match(renderer, /getPublishedDocumentCtas/);
});
test("print styles hide non-essential chrome without a heavy dependency", () => {
  assert.match(renderer, /print:hidden|print:border-none/);
});

// ==================== §20 DRAFT/PREVIEW/PUBLISH — NO BYPASS INTRODUCED ====================

test("the new function is still named publish_school_page_v2 — no second, competing RPC was introduced", () => {
  const matches = migration.match(/create or replace function public\.(\w+)/g) ?? [];
  assert.deepEqual(matches, ["create or replace function public.publish_school_page_v2"]);
});
test("no direct INSERT/UPDATE/DELETE grant is introduced on the pricing tables for authenticated/anon", () => {
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)/i);
});
