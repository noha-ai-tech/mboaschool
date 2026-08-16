import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEsgByRegion } from "./sources/minesec";
import { normalizeRecord } from "./lib/normalize";
import { deduplicateBatch } from "./lib/dedup";
import type { RawSourceRecord, NormalizedStagingRecord } from "./types";

/**
 * SPRINT O — Batch 002. Collecte réelle (réseau live, aucune fixture) du
 * répertoire ESG MINESEC pour les régions Ouest, Adamaoua, Nord et
 * Extrême-Nord ("Grand Nord" + Ouest — voir mission SPRINT O).
 *
 * Pipeline entièrement réutilisé de SPRINT N (Batch 001) sans modification :
 * même collecteur (`fetchEsgByRegion`), même normalizer, même dédoublonneur.
 * Seule la liste de régions change. Aucune nouvelle architecture introduite.
 *
 * N'écrit QUE dans data/registry/{raw,normalized}/ (fichiers locaux). Aucun
 * appel Supabase, aucune écriture staging/establishments.
 *
 * Usage : node_modules/.bin/tsx collect-batch-002.ts
 */

const REGIONS = ["OUEST", "ADAMAOUA", "NORD", "EXTREME-NORD"] as const;
const today = new Date().toISOString().slice(0, 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", ".."); // repo root
const rawDir = join(rootDir, "data", "registry", "raw");
const normalizedDir = join(rootDir, "data", "registry", "normalized");

async function main() {
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(normalizedDir, { recursive: true });

  const byRegion: Record<string, { records: RawSourceRecord[]; pagesFetched: number; totalPagesReported: number | null }> = {};

  for (const region of REGIONS) {
    console.log(`Collecte MINESEC ESG — région ${region}...`);
    const result = await fetchEsgByRegion(region, { pageSize: 100 });
    byRegion[region] = result;
    console.log(`  ${result.records.length} ligne(s) sur ${result.pagesFetched} page(s) (annoncées: ${result.totalPagesReported ?? "?"})`);
  }

  const allRaw: RawSourceRecord[] = Object.values(byRegion).flatMap((r) => r.records);

  const rawSnapshot = {
    ministry: "MINESEC",
    sourceName: "Registre National des Établissements — carte scolaire numérique (ESG)",
    sourceUrl: "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr",
    collectedAt: new Date().toISOString(),
    filtersApplied: { region: REGIONS, table: "ESG (list_13_com_content_13)" },
    perRegion: Object.fromEntries(
      Object.entries(byRegion).map(([region, r]) => [
        region,
        { rowCount: r.records.length, pagesFetched: r.pagesFetched, totalPagesReported: r.totalPagesReported },
      ])
    ),
    rowCount: allRaw.length,
    rows: allRaw,
  };

  const rawPath = join(rawDir, `minesec-ouest-grand-nord-${today}.json`);
  writeFileSync(rawPath, JSON.stringify(rawSnapshot, null, 2), "utf-8");
  console.log(`Raw snapshot écrit : ${rawPath}`);

  const normalized: NormalizedStagingRecord[] = allRaw.map(normalizeRecord);
  const { records: deduplicated, exactDuplicates, potentialDuplicates } = deduplicateBatch(normalized);

  const normalizedPath = join(normalizedDir, `minesec-ouest-grand-nord-${today}.json`);
  writeFileSync(normalizedPath, JSON.stringify(deduplicated, null, 2), "utf-8");
  console.log(`Dataset normalisé écrit : ${normalizedPath}`);
  console.log(`Doublons exacts (intra-batch) : ${exactDuplicates} — doublons potentiels : ${potentialDuplicates}`);
}

main().catch((error) => {
  console.error("Échec de la collecte Batch 002 :", error);
  process.exit(1);
});
