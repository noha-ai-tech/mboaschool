import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P.2A §10-11 — Reconstruit la liste des 84 établissements exclus de
 * la promotion Batch 002 (city/locality absente) à partir de
 * batch-002-promotion-summary.json (qui ne contient que les noms) croisé
 * avec le dataset normalisé source, pour retrouver official_id / region /
 * raw locality / catégorie. Ne consulte AUCUNE source externe non déjà
 * collectée — voir §11 : jamais de localité "probable" sans preuve.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const summary = JSON.parse(
    readFileSync(join(rootDir, "reports", "registry", "batch-002-promotion-summary.json"), "utf-8")
  );
  const excludedNames: string[] = summary.excludedNames;

  const batch: NormalizedStagingRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "normalized", "minesec-ouest-grand-nord-2026-08-16.json"), "utf-8")
  );

  const byName = new Map<string, NormalizedStagingRecord>();
  for (const r of batch) byName.set(r.nameRaw, r);

  interface Row {
    officialId: string | null;
    officialName: string;
    region: string | null;
    rawLocality: string;
    category: string | null;
    status: "FOUND_FROM_SOURCE" | "REGION_ONLY_VALID" | "NEEDS_REVIEW";
  }

  const rows: Row[] = [];
  let notFound = 0;

  for (const name of excludedNames) {
    const r = byName.get(name);
    if (!r) {
      notFound++;
      rows.push({ officialId: null, officialName: name, region: null, rawLocality: "", category: null, status: "NEEDS_REVIEW" });
      continue;
    }
    // raw.localite = valeur brute exacte de la source, avant normalisation
    const rawLocalite = String((r.raw as Record<string, unknown>).localite ?? "").trim();

    // Aucune source externe déjà collectée ne peut recouper ces établissements
    // (pas de second jeu de données pour l'Ouest/Grand Nord). Si la région est
    // connue (elle l'est toujours ici — c'était le filtre de collecte) et que
    // la localité brute est réellement vide, l'état est REGION_ONLY_VALID :
    // ce n'est pas une anomalie à corriger, c'est ce que la source publie.
    const status: Row["status"] = r.region ? "REGION_ONLY_VALID" : "NEEDS_REVIEW";

    rows.push({
      officialId: r.officialIdentifier,
      officialName: r.nameRaw,
      region: r.region,
      rawLocality: rawLocalite,
      category: r.educationFamily,
      status,
    });
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csvPath = join(rootDir, "reports", "registry", "missing-locality-84.csv");
  const header = "official_id,official_name,region,raw_locality,category,status";
  const lines = [header, ...rows.map((r) => [r.officialId, r.officialName, r.region, r.rawLocality, r.category, r.status].map(csvEscape).join(","))];
  writeFileSync(csvPath, lines.join("\n"), "utf-8");

  const counts = { FOUND_FROM_SOURCE: 0, REGION_ONLY_VALID: 0, NEEDS_REVIEW: 0 };
  for (const r of rows) counts[r.status]++;

  console.log(`Total exclus (Batch 002 promotion) : ${excludedNames.length}`);
  console.log(`Retrouvés dans le dataset normalisé : ${excludedNames.length - notFound}`);
  console.log(`Non retrouvés (anomalie de croisement) : ${notFound}`);
  console.log("Classification :", counts);
  console.log(`Rapport écrit : ${csvPath}`);
}

main();
