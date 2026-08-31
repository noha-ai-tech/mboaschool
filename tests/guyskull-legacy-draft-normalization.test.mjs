import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeSchoolPageDraftPayload } from "../src/lib/schoolPage/draftPayload.ts";

const legacyPayload = {
  presentation: { description: "Présentation historique" },
  contact: { phone: "+237600000000", email: null, website: null, address: null, city: "Douala" },
  hero_mode: "carousel",
  pricing: { registration_fee: null },
  infrastructure: { library: false },
  admissions: {
    levels: [], conditions: null, required_documents: [], period_start: null, period_end: null, additional_info: null,
  },
  sections: [],
  gallery: { remove_ids: [] },
};

// Exact payload shape captured read-only from Guyskull production on
// 2026-08-30. It intentionally contains no row identifier and no secret.
const guyskullLegacyPayload = {
  presentation: { description: "hhhhhh" },
  contact: { phone: "+237674816227", email: null, website: null, address: null, city: "Douala" },
  hero_mode: "carousel",
  pricing: {
    registration_fee: null, tuition_fee: 29000, transport_fee: null, canteen_fee: null,
    uniform_fee: null, exam_fee: null, other_fees: null,
  },
  infrastructure: {
    library: false, laboratory: false, computer_room: false, sports_field: false, canteen: false,
    boarding: false, transport: false, security: false, wifi: false, infirmary: false,
  },
  admissions: {
    levels: [], conditions: null, required_documents: [], period_start: null, period_end: null, additional_info: null,
  },
  sections: ["presentation", "admissions", "pricing", "infrastructure", "gallery", "news", "documents", "contact"]
    .map((section_key, position) => ({ section_key, position, is_visible: true })),
  gallery: { remove_ids: [] },
};

const currentPayload = {
  ...legacyPayload,
  presentation: {
    description: "Présentation actuelle",
    motto: "Apprendre",
    history: "Histoire",
    mission: "Mission",
    vision: "Vision",
  },
  key_numbers: { founding_year: 2010, student_count: 450, teacher_count: 28 },
  results: { remove_ids: ["11111111-1111-4111-8111-111111111111"] },
  ranking: {
    year: 2026,
    rank: "3e",
    scope: "Littoral",
    source: "Source officielle",
    source_url: "https://example.test/ranking",
  },
};

function normalize(payload) {
  const result = normalizeSchoolPageDraftPayload(payload);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.payload;
}

test("legacy payload missing all three newer domains normalizes successfully", () => {
  assert.equal(normalizeSchoolPageDraftPayload(legacyPayload).ok, true);
});

test("legacy existing domains remain byte-for-byte semantically equivalent", () => {
  const normalized = normalize(legacyPayload);
  for (const key of Object.keys(legacyPayload)) {
    if (key === "presentation") {
      assert.equal(normalized.presentation.description, legacyPayload.presentation.description);
    } else {
      assert.equal(JSON.stringify(normalized[key]), JSON.stringify(legacyPayload[key]));
    }
  }
});

test("missing key_numbers receives the exact current empty shape", () => {
  assert.deepEqual(normalize(legacyPayload).key_numbers, {
    founding_year: null, student_count: null, teacher_count: null,
  });
});

test("missing results receives the exact current empty shape", () => {
  assert.deepEqual(normalize(legacyPayload).results, { remove_ids: [] });
});

test("missing ranking becomes null", () => {
  assert.equal(normalize(legacyPayload).ranking, null);
});

test("legacy presentation additions receive null without inventing content", () => {
  assert.deepEqual(normalize(legacyPayload).presentation, {
    description: "Présentation historique", motto: null, history: null, mission: null, vision: null,
  });
});

test("fully populated current payload remains unchanged", () => {
  assert.deepEqual(normalize(currentPayload), currentPayload);
});

test("malformed key_numbers is rejected", () => {
  assert.equal(normalizeSchoolPageDraftPayload({ ...legacyPayload, key_numbers: "hello" }).ok, false);
});

test("malformed results is rejected", () => {
  assert.equal(normalizeSchoolPageDraftPayload({ ...legacyPayload, results: { remove_ids: "abc" } }).ok, false);
});

test("partial ranking is rejected by the current ranking contract", () => {
  assert.equal(normalizeSchoolPageDraftPayload({ ...legacyPayload, ranking: { year: 2026, rank: "1er" } }).ok, false);
});

test("normalization does not mutate the input or nested values", () => {
  const original = structuredClone(legacyPayload);
  const normalized = normalize(legacyPayload);
  normalized.presentation.description = "modifié";
  assert.deepEqual(legacyPayload, original);
});

test("compatible unknown legacy values are preserved on read", () => {
  const normalized = normalize({ ...legacyPayload, legacy_note: { retained: true } });
  assert.deepEqual(normalized.legacy_note, { retained: true });
});

test("legacy payload passes preview preparation with safe direct access", () => {
  const draft = normalize(legacyPayload);
  assert.doesNotThrow(() => ({
    foundingYear: draft.key_numbers.founding_year,
    resultRemovals: new Set(draft.results.remove_ids),
    ranking: draft.ranking,
  }));
});

test("legacy payload passes publish preparation without losing existing domains", () => {
  const draft = normalize(legacyPayload);
  for (const key of ["presentation", "contact", "pricing", "infrastructure", "gallery"]) {
    const expected = key === "presentation"
      ? legacyPayload.presentation.description
      : JSON.stringify(legacyPayload[key]);
    const actual = key === "presentation" ? draft.presentation.description : JSON.stringify(draft[key]);
    assert.equal(actual, expected);
  }
});

test("the captured Guyskull production draft normalizes to the current read contract", () => {
  const draft = normalize(guyskullLegacyPayload);
  assert.deepEqual(draft.key_numbers, { founding_year: null, student_count: null, teacher_count: null });
  assert.deepEqual(draft.results, { remove_ids: [] });
  assert.equal(draft.ranking, null);
  assert.equal(draft.presentation.description, guyskullLegacyPayload.presentation.description);
});

test("draft GET, PATCH, preview and publish preparation use the central normalizer", async () => {
  const [draftRoute, previewRoute, publishRoute] = await Promise.all([
    readFile("src/app/api/school-page/draft/route.ts", "utf8"),
    readFile("src/app/api/school-page/preview/route.ts", "utf8"),
    readFile("src/app/api/school-page/publish/route.ts", "utf8"),
  ]);
  assert.ok((draftRoute.match(/normalizeSchoolPageDraftPayload\(/g) ?? []).length >= 3);
  assert.match(previewRoute, /normalizeSchoolPageDraftPayload\(draftRes\.data\.payload\)/);
  assert.match(publishRoute, /normalizeSchoolPageDraftPayload\(draftRow\.payload\)/);
});
