import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P.2A §16 — Dataset dérivé de Master V1 avec un statut de localité
 * explicite par ligne. Le snapshot maître original
 * (data/registry/master/minesec-master-v1.json) N'EST PAS modifié — ce
 * fichier est une COPIE dérivée, écrite à côté.
 *
 * locality_status :
 *   VALID                — localité présente, jamais signalée suspecte.
 *   MISSING               — aucune localité dans la source (ex. les 84 du Batch 002).
 *   CLEARLY_INVALID        — signalée suspecte ET classifiée bruit pur (§14) ;
 *                            normalized_locality mis à null, raw_locality conservé.
 *   POSSIBLE_REAL_LOCALITY  — signalée suspecte mais contient un nom de lieu/chefferie
 *                             plausible (§15) ; conservée telle quelle.
 *   NEEDS_REVIEW             — signalée suspecte, ambiguë ; conservée telle quelle,
 *                              jamais classée automatiquement.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function main() {
  const master: NormalizedStagingRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "master", "minesec-master-v1.json"), "utf-8")
  );

  const classifiedRaw = readFileSync(join(rootDir, "reports", "registry", "suspicious-localities-classified.csv"), "utf-8");
  const [, ...classifiedLines] = classifiedRaw.trim().split("\n");
  // clé : nom + région (les deux ensemble, un nom seul n'est pas garanti unique)
  const classifiedByKey = new Map<string, "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW">();
  for (const line of classifiedLines) {
    const [name, region, , status] = parseCsvLine(line);
    classifiedByKey.set(`${name}|${region}`, status as "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW");
  }

  let counts = { VALID: 0, MISSING: 0, CLEARLY_INVALID: 0, POSSIBLE_REAL_LOCALITY: 0, NEEDS_REVIEW: 0 };

  const clean = master.map((r) => {
    const rawLocality = String((r.raw as Record<string, unknown>).localite ?? "").trim() || null;
    const key = `${r.nameRaw}|${r.region}`;
    const flagged = classifiedByKey.get(key);

    let localityStatus: keyof typeof counts;
    let normalizedLocality: string | null;

    if (!rawLocality) {
      localityStatus = "MISSING";
      normalizedLocality = null;
    } else if (flagged === "CLEARLY_INVALID") {
      localityStatus = "CLEARLY_INVALID";
      normalizedLocality = null;
    } else if (flagged === "POSSIBLE_REAL_LOCALITY") {
      localityStatus = "POSSIBLE_REAL_LOCALITY";
      normalizedLocality = r.locality;
    } else if (flagged === "NEEDS_REVIEW") {
      localityStatus = "NEEDS_REVIEW";
      normalizedLocality = r.locality;
    } else {
      localityStatus = "VALID";
      normalizedLocality = r.locality;
    }
    counts[localityStatus]++;

    return { ...r, rawLocality, normalizedLocality, localityStatus };
  });

  const outPath = join(rootDir, "data", "registry", "master", "minesec-master-v1-clean.json");
  writeFileSync(outPath, JSON.stringify(clean, null, 2), "utf-8");

  console.log(`Master V1 : ${master.length} lignes -> clean : ${clean.length} lignes`);
  console.log("locality_status:", counts);
  console.log(`Écrit : ${outPath}`);
  console.log(`Original préservé (non modifié) : data/registry/master/minesec-master-v1.json`);
}

main();
