import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P.2A §6-7 — Audit en lecture seule. Extrait le matricule MINESEC
 * planqué dans `establishments.description` pour les 673 lignes promues lors
 * de Sprint O (créées le 2026-08-16), et vérifie que chacune est retrouvable
 * dans data/registry/master/minesec-master-v1.json. N'écrit RIEN en base —
 * clé anon uniquement, lecture seule.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const MATRICULE_RE = /Matricule officiel : ([^.]+)\./;

interface LiveEstablishment {
  id: string;
  name: string;
  region: string | null;
  description: string | null;
  created_at: string;
}

async function fetchBatch002Live(): Promise<LiveEstablishment[]> {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY introuvables");

  const res = await fetch(
    `${url}/rest/v1/establishments?select=id,name,region,description,created_at&created_at=gte.2026-08-16T00:00:00&created_at=lt.2026-08-17T00:00:00`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) throw new Error(`Supabase REST -> HTTP ${res.status}`);
  return res.json();
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const live = await fetchBatch002Live();
  console.log(`${live.length} établissement(s) créé(s) le 2026-08-16 trouvé(s) en base (lecture seule).`);

  const master: NormalizedStagingRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "master", "minesec-master-v1.json"), "utf-8")
  );
  const masterByOfficialId = new Map<string, NormalizedStagingRecord>();
  for (const r of master) {
    if (r.officialIdentifier) masterByOfficialId.set(r.officialIdentifier.trim().toUpperCase(), r);
  }

  interface Row {
    establishmentId: string;
    name: string;
    region: string | null;
    parsedOfficialId: string | null;
    masterOfficialId: string | null;
    match: "MATCH" | "NO_MATCH" | "UNPARSEABLE";
    confidence: "high" | "none";
  }

  const rows: Row[] = [];
  let parsed = 0;
  let matched = 0;
  let conflicts = 0;

  for (const e of live) {
    const m = e.description?.match(MATRICULE_RE) ?? null;
    const parsedId = m ? m[1].trim() : null;
    if (parsedId) parsed++;

    const masterHit = parsedId ? masterByOfficialId.get(parsedId.toUpperCase()) : undefined;

    let match: Row["match"] = "UNPARSEABLE";
    if (parsedId) match = masterHit ? "MATCH" : "NO_MATCH";
    if (match === "MATCH") matched++;
    if (match === "NO_MATCH") conflicts++;

    rows.push({
      establishmentId: e.id,
      name: e.name,
      region: e.region,
      parsedOfficialId: parsedId,
      masterOfficialId: masterHit?.officialIdentifier ?? null,
      match,
      confidence: match === "MATCH" ? "high" : "none",
    });
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csvPath = join(rootDir, "reports", "registry", "batch-002-matricule-audit.csv");
  const header = "establishment_id,name,region,parsed_official_id,master_official_id,match,confidence";
  const lines = [header, ...rows.map((r) =>
    [r.establishmentId, r.name, r.region, r.parsedOfficialId, r.masterOfficialId, r.match, r.confidence].map(csvEscape).join(",")
  )];
  writeFileSync(csvPath, lines.join("\n"), "utf-8");

  console.log(`Total établissements Batch 002 en base : ${live.length}`);
  console.log(`Matricules parsés depuis description   : ${parsed}`);
  console.log(`Correspondances trouvées dans Master V1 : ${matched}`);
  console.log(`Conflits (parsé mais absent de Master)  : ${conflicts}`);
  console.log(`Non parsables (description inattendue)  : ${rows.length - parsed}`);
  console.log(`Rapport écrit : ${csvPath}`);

  if (matched !== 673) {
    console.log(`\n⚠ ATTENDU 673/673 — OBTENU ${matched}/${live.length}. Voir anomalies ci-dessous.`);
    for (const r of rows.filter((r) => r.match !== "MATCH")) {
      console.log(`  ANOMALIE: ${r.name} (${r.establishmentId}) — match=${r.match}, parsed="${r.parsedOfficialId}"`);
    }
  } else {
    console.log("\n✔ 673/673 confirmé.");
  }
}

main().catch((error) => {
  console.error("Échec de l'audit matricule Batch 002 :", error);
  process.exit(1);
});
