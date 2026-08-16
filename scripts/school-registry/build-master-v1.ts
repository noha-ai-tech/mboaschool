import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deduplicateBatch } from "./lib/dedup";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P — Consolide Batch 001 (Centre, Littoral — SPRINT N) et Batch 002
 * (Ouest, Adamaoua, Nord, Extrême-Nord — SPRINT O) en un dataset unique
 * "MINESEC Master V1". Ne lit que des fichiers déjà collectés en réel —
 * aucun nouvel appel réseau MINESEC. N'écrit que dans data/registry/master/
 * (local). Aucun appel Supabase.
 *
 * Le dédoublonnage est ré-exécuté sur l'ensemble combiné (pas seulement par
 * lot) : les régions des deux lots sont disjointes (Centre/Littoral vs
 * Ouest/Adamaoua/Nord/Extrême-Nord), donc aucun chevauchement n'est attendu,
 * mais ce recalcul sert de garde-fou explicite plutôt qu'une hypothèse.
 *
 * Usage : node_modules/.bin/tsx build-master-v1.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const normalizedDir = join(rootDir, "data", "registry", "normalized");
const masterDir = join(rootDir, "data", "registry", "master");

const SOURCES = [
  { file: "minesec-centre-littoral-2026-08-16.json", batch: "001", regions: ["CENTRE", "LITTORAL"] },
  { file: "minesec-ouest-grand-nord-2026-08-16.json", batch: "002", regions: ["OUEST", "ADAMAOUA", "NORD", "EXTREME-NORD"] },
];

async function main() {
  mkdirSync(masterDir, { recursive: true });

  const combined: (NormalizedStagingRecord & { sourceBatch: string })[] = [];
  for (const src of SOURCES) {
    const records: NormalizedStagingRecord[] = JSON.parse(readFileSync(join(normalizedDir, src.file), "utf-8"));
    for (const r of records) combined.push({ ...r, sourceBatch: src.batch });
    console.log(`Batch ${src.batch} (${src.regions.join(", ")}) : ${records.length} enregistrement(s) chargé(s).`);
  }

  // Recalcul du dédoublonnage sur l'ensemble combiné — garde-fou cross-batch.
  const { records: dedupedCombined, exactDuplicates, potentialDuplicates } = deduplicateBatch(combined);
  console.log(`Dédoublonnage cross-batch : ${exactDuplicates} doublon(s) exact(s), ${potentialDuplicates} doublon(s) potentiel(s) (attendu : 0, régions disjointes).`);

  const byRegion: Record<string, number> = {};
  for (const r of dedupedCombined) {
    const key = r.region ?? "(région inconnue)";
    byRegion[key] = (byRegion[key] ?? 0) + 1;
  }

  const masterPath = join(masterDir, "minesec-master-v1.json");
  writeFileSync(masterPath, JSON.stringify(dedupedCombined, null, 2), "utf-8");

  const summary = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map((s) => s.file),
    totalRaw: combined.length,
    totalUnique: dedupedCombined.filter((r) => r.status !== "duplicate_exact" && r.status !== "rejected").length,
    crossBatchExactDuplicates: exactDuplicates,
    crossBatchPotentialDuplicates: potentialDuplicates,
    byRegion,
  };
  writeFileSync(join(masterDir, "minesec-master-v1-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log(`Master dataset écrit : ${masterPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Échec de la consolidation Master V1 :", error);
  process.exit(1);
});
