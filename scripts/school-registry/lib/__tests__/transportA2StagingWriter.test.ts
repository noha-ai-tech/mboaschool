import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as writerModule from "../transportA2StagingWriter";
import { insertStagingRowsOnly, createTransportDataSourceRow } from "../transportA2StagingWriter";
import type { StagingInsertRow } from "../transportA2StagingPayload";

const __dirname = dirname(fileURLToPath(import.meta.url));
const writerSourcePath = join(__dirname, "..", "transportA2StagingWriter.ts");

/**
 * SPRINT TRANSPORT-A.2-T3-WRITE — brief §9/§14 TESTS U & V.
 *
 * "establishments write path" et "registry_identifiers write path" doivent
 * être TECHNIQUEMENT IMPOSSIBLES depuis ce pipeline, vérifiés PAR LE CODE,
 * pas seulement par une intention documentée. Deux angles complémentaires :
 *
 *  1. ANALYSE STATIQUE du texte source du module d'écriture : les deux
 *     endpoints interdits ne doivent JAMAIS y apparaître, sous aucune forme.
 *  2. ANALYSE DES EXPORTS : le module ne doit exposer QU'UNE SEULE fonction
 *     capable d'écrire (async, appelle fetch), et son nom/signature ne doit
 *     rien laisser passer d'autre qu'un tableau de StagingInsertRow vers
 *     establishment_import_staging.
 */

describe("TEST U — establishments write path : techniquement impossible depuis ce module", () => {
  test("le texte source de transportA2StagingWriter.ts ne contient jamais '/rest/v1/establishments' (ni en tant que préfixe de establishment_import_staging mal découpé)", () => {
    const source = readFileSync(writerSourcePath, "utf-8");
    // Deliberately checks for the literal establishments endpoint with a
    // word boundary-safe pattern: '/rest/v1/establishments' followed by
    // anything that is NOT '_import_staging' or '_registry_identifiers'
    // would indicate a forbidden direct establishments write target.
    const forbidden = /\/rest\/v1\/establishments(?!_)/;
    assert.equal(forbidden.test(source), false, "transportA2StagingWriter.ts must never reference the raw establishments REST endpoint");
  });

  test("appeler insertStagingRowsOnly() ne peut physiquement pas écrire dans establishments : la seule URL fetch()ée dans ce module est codée en dur vers establishment_import_staging (vérifié par mock global.fetch)", async () => {
    const calls: { url: string; method?: string }[] = [];
    const originalFetch = global.fetch;
    // @ts-expect-error test double
    global.fetch = async (url: string, opts: { method?: string }) => {
      calls.push({ url: String(url), method: opts?.method });
      return { ok: true, status: 201, json: async () => [], text: async () => "" } as Response;
    };
    try {
      const row = { fingerprint: "transport-tier3:v1:TC-TEST", raw_data: { transport_tier3: { candidate_id: "TC-TEST" } } } as unknown as StagingInsertRow;
      await insertStagingRowsOnly("https://example.supabase.co", "fake-service-key", "fake-data-source-id", [row]);
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/establishment_import_staging$/);
    assert.doesNotMatch(calls[0].url, /\/rest\/v1\/establishments(\?|$)/);
    assert.equal(calls[0].method, "POST");
  });
});

describe("TEST V — establishment_registry_identifiers write path : techniquement impossible depuis ce module", () => {
  test("le texte source de transportA2StagingWriter.ts ne contient jamais '/rest/v1/establishment_registry_identifiers'", () => {
    const source = readFileSync(writerSourcePath, "utf-8");
    assert.equal(source.includes("/rest/v1/establishment_registry_identifiers"), false);
  });

  test("le module n'exporte AUCUNE fonction dont le nom évoque registry_identifiers ou une écriture establishments", () => {
    const exportNames = Object.keys(writerModule);
    for (const name of exportNames) {
      assert.doesNotMatch(name.toLowerCase(), /registry_?identifier/i, `unexpected export "${name}" suggests a registry_identifiers write capability`);
      assert.doesNotMatch(name.toLowerCase(), /insertestablishment(?!importstaging)/i, `unexpected export "${name}" suggests a direct establishments write capability`);
    }
  });

  test("le module n'expose QUE DEUX fonctions d'écriture (createTransportDataSourceRow, insertStagingRowsOnly) — aucune fonction supplémentaire pouvant écrire ailleurs", () => {
    const exportNames = Object.keys(writerModule).filter((n) => typeof (writerModule as Record<string, unknown>)[n] === "function");
    assert.deepEqual(exportNames.sort(), ["createTransportDataSourceRow", "insertStagingRowsOnly"].sort());
  });

  test("createTransportDataSourceRow() n'écrit que vers establishment_data_sources (vérifié par mock global.fetch), jamais vers establishments/registry_identifiers", async () => {
    const calls: { url: string; method?: string }[] = [];
    const originalFetch = global.fetch;
    // @ts-expect-error test double
    global.fetch = async (url: string, opts: { method?: string }) => {
      calls.push({ url: String(url), method: opts?.method });
      return { ok: true, status: 201, json: async () => [{ id: "fake-data-source-id" }], text: async () => "" } as Response;
    };
    try {
      const result = await createTransportDataSourceRow("https://example.supabase.co", "fake-service-key", 13, "batch-checksum-abc");
      assert.equal(result.id, "fake-data-source-id");
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/establishment_data_sources$/);
    assert.doesNotMatch(calls[0].url, /\/rest\/v1\/establishments(\?|$)/);
    assert.doesNotMatch(calls[0].url, /registry_identifiers/);
  });
});
