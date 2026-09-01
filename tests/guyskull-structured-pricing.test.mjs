import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { feeScheduleTotal, normalizeSchoolPagePricing } from "../src/lib/schoolPage/pricing.ts";
import { getPublishedDocumentCtas } from "../src/lib/schoolPage/documents.ts";

const root = new URL("../", import.meta.url);
const sql = await readFile(new URL("supabase/migrations/0037_school_structured_pricing_documents.sql", root), "utf8");
const rollback = await readFile(new URL("docs/guyskull/GUYSKULL-0037_ROLLBACK.sql", root), "utf8");
const renderer = await readFile(new URL("src/components/school/StructuredPricing.tsx", root), "utf8");
// GUYSKULL-05 — MiniSiteRenderer.tsx was split into a shared shell + 5
// independently routed views; the two assertions that used to read it now
// read the specific view each pattern actually lives in.
const admissionsView = await readFile(new URL("src/components/school/views/FormationsAdmissionsView.tsx", root), "utf8");
const accueilView = await readFile(new URL("src/components/school/views/AccueilView.tsx", root), "utf8");
const snapshot = await readFile(new URL("src/lib/schoolPage/snapshot.ts", root), "utf8");

const base = {
  registration_fee: null, tuition_fee: null, transport_fee: null, canteen_fee: null,
  uniform_fee: null, exam_fee: null, other_fees: null, currency: "FCFA",
  legacy_amounts_qualified: false, schedules: [], additional_fees: [],
};
const schedule = {
  academic_year: "2026-2027", level_label: "6e", registration_fee: 15000,
  tuition_fee: 120000, currency: "FCFA", notes: null, position: 0,
  installments: [{ label: "1re tranche", position: 0, amount: 60000, due_date: "2026-09-15", notes: null }],
};

test("pricing draft normalizes a complete structured payload", () => assert.equal(normalizeSchoolPagePricing({ ...base, schedules: [schedule] }).ok, true));
test("registration fee cannot be negative", () => assert.equal(normalizeSchoolPagePricing({ ...base, registration_fee: -1 }).ok, false));
test("tuition fee cannot be negative", () => assert.equal(normalizeSchoolPagePricing({ ...base, tuition_fee: -1 }).ok, false));
test("installment amount cannot be negative", () => assert.equal(normalizeSchoolPagePricing({ ...base, schedules: [{ ...schedule, installments: [{ ...schedule.installments[0], amount: -1 }] }] }).ok, false));
test("summary total is registration plus tuition", () => assert.equal(feeScheduleTotal(schedule), 135000));
test("mandatory additional fee is accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [{ academic_year: "2026-2027", category: "uniform", label: "Uniforme", amount: 12000, mandatory: true, frequency: "Une fois", notes: null, position: 0 }] }).ok, true));
test("optional additional fee is accepted", () => assert.equal(normalizeSchoolPagePricing({ ...base, additional_fees: [{ academic_year: "2026-2027", category: "transport", label: "Transport", amount: 10000, mandatory: false, frequency: "Mensuel", notes: null, position: 0 }] }).ok, true));
test("non-consecutive academic year is rejected", () => assert.equal(normalizeSchoolPagePricing({ ...base, schedules: [{ ...schedule, academic_year: "2026-2028" }] }).ok, false));
test("duplicate positions are rejected", () => assert.equal(normalizeSchoolPagePricing({ ...base, schedules: [schedule, { ...schedule }] }).ok, false));
test("download CTA is hidden without a document", () => assert.deepEqual(getPublishedDocumentCtas([]), []));
test("enrollment CTA is shown for a published valid file", () => assert.equal(getPublishedDocumentCtas([{ id: "1", name: "Inscription", type: "inscription", url: "https://example.test/file.pdf", status: "live", is_public: true }])[0].label, "Télécharger la fiche d'inscription"));
test("CTA is hidden for a draft document", () => assert.deepEqual(getPublishedDocumentCtas([{ id: "1", name: "X", type: "inscription", url: "https://example.test/x", status: "draft", is_public: true }]), []));
test("29,000 legacy amount is never given a public semantic label", () => { assert.match(renderer, /Montant existant à qualifier/); assert.match(renderer, /mode === "admin"/); });
test("pricing renderer prevents mobile overflow", () => { assert.match(renderer, /overflow-x-auto/); assert.match(renderer, /min-w-\[560px\]/); });
test("admissions navigation exposes five focused sections", () => ["Formations", "Admissions", "Tarifs", "Pièces à fournir", "Documents"].forEach((label) => assert.match(admissionsView, new RegExp(label))));
test("unknown category falls back to neutral rendering", () => { assert.match(accueilView, /categoryLabel.*\?\.label \?\? null/); assert.match(admissionsView, /Formations/); });
test("snapshot includes published schedules and additional fees for discard", () => { assert.match(snapshot, /school_fee_schedules/); assert.match(snapshot, /school_additional_fees/); });
test("migration revokes direct client pricing writes", () => { assert.match(sql, /revoke all on public\.school_fee_schedules[\s\S]*from public, anon, authenticated/i); assert.match(sql, /revoke all on public\.fees from public, anon, authenticated/i); });
test("anonymous access is live read-only", () => { assert.match(sql, /for select to anon, authenticated using \(true\)/i); assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*school_fee_schedules[^;]*authenticated/i); });
test("cross-school publication derives ownership from auth uid", () => assert.match(sql, /e\.id=p_establishment_id and e\.owner_id=\(select auth\.uid\(\)\)/i));
test("publish route cannot call legacy publication RPC directly", () => { assert.match(sql, /revoke all on function public\.publish_school_page\(uuid,timestamptz\)[^;]*authenticated/i); assert.match(sql, /grant execute on function public\.publish_school_page_v2/); });
test("rollback restores old RPC and removes all structured tables", () => { assert.match(rollback, /grant execute on function public\.publish_school_page/); assert.match(rollback, /drop table public\.school_fee_installments/); });
test("production RPC definitions are checksum-gated before 0037", () => { assert.match(sql, /f47fdb855ed5830814f15045a5157398/); assert.match(sql, /b02e52187172d15100412bb637e22067/); });
test("public document bucket cannot pretend to contain private drafts", () => { assert.match(sql, /school_documents_status_check check \(status = 'live'\)/); assert.match(sql, /school_documents_public_only_check check \(is_public\)/); });
test("document metadata storage path is scoped to its exact school", () => assert.match(sql, /split_part\(storage_path, '\/', 1\) = establishment_id::text/));
