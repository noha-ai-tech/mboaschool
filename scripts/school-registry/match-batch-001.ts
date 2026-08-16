import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT N — Batch 001. Compare le dataset normalisé MINESEC (Centre +
 * Littoral) aux 44 établissements réels déjà en base sur ces deux régions
 * (lecture seule, clé anon, aucune écriture). Ordre de correspondance
 * (mission §16) :
 *   1. official_id / matricule exact       -> IMPOSSIBLE aujourd'hui : aucun
 *      établissement réel ne stocke de matricule MINESEC (colonne absente
 *      de `establishments`) — 0% par construction, pas un bug.
 *   2. normalized_name + arrondissement    -> IMPOSSIBLE ici : l'arrondissement
 *      n'est pas capturé par ligne sur la table ESG (voir sources/minesec.ts).
 *   3. normalized_name + city/locality     -> tenté (normalisation renforcée).
 *   4. normalized_name + department        -> IMPOSSIBLE ici (idem §2).
 *   5. fuzzy (revue humaine uniquement)     -> tenté, jamais fusionné seul.
 *
 * IMPORTANT : aucun match n'est jamais écrit dans `establishments` ni
 * `establishment_import_staging` par ce script — sortie 100% locale
 * (reports/registry/*.csv).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

/** Normalisation supplémentaire pour le matching (pas pour l'affichage) :
 * corrige la variante "Lyce" (sans accent, sans "e" final) observée dans les
 * données MINESEC elles-mêmes à côté de la forme correcte "Lycée" utilisée
 * dans nos données existantes — un des écarts de qualité concrets que ce
 * batch de calibration visait à révéler (voir rapport SPRINT N). */
function matchKey(nameNormalized: string): string {
  return nameNormalized
    .replace(/^lyce\s+/, "")
    .replace(/^lycee\s+/, "")
    .trim();
}

interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string | null;
}

async function fetchLiveEstablishments(): Promise<LiveEstablishment[]> {
  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY introuvables dans .env.local");

  const res = await fetch(
    `${url}/rest/v1/establishments?select=id,name,city,region,main_category&region=in.(Centre,Littoral)`,
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
  const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const normalizedPath = join(rootDir, "data", "registry", "normalized", `minesec-centre-littoral-${dateArg}.json`);
  const batch: NormalizedStagingRecord[] = JSON.parse(readFileSync(normalizedPath, "utf-8"));

  const live = await fetchLiveEstablishments();
  console.log(`${live.length} établissement(s) réel(s) chargé(s) (Centre + Littoral, lecture seule).`);

  const liveByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of live) {
    const key = (e.region ?? "").toUpperCase();
    if (!liveByRegion.has(key)) liveByRegion.set(key, []);
    liveByRegion.get(key)!.push(e);
  }

  type MatchType = "exact_normalized_name" | "probable_fuzzy" | "no_match";
  interface MatchRow {
    officialId: string | null;
    officialName: string;
    region: string | null;
    department: string | null;
    arrondissement: string | null;
    existingMatchId: string | null;
    existingName: string | null;
    matchType: MatchType;
    confidence: "high" | "medium" | "low" | "none";
    recommendedAction: string;
  }

  const dedupRows: MatchRow[] = [];
  let exactMatches = 0;
  let probableMatches = 0;
  let noMatch = 0;

  for (const record of batch) {
    if (record.status === "rejected") continue;
    const candidates = liveByRegion.get((record.region ?? "").toUpperCase()) ?? [];
    const key = matchKey(record.nameNormalized);

    let best: LiveEstablishment | null = null;
    let matchType: MatchType = "no_match";

    for (const c of candidates) {
      const cKey = matchKey(normalizeName(c.name));
      if (cKey === key && key.length > 0) {
        best = c;
        matchType = "exact_normalized_name";
        break;
      }
    }
    if (!best) {
      for (const c of candidates) {
        const cKey = matchKey(normalizeName(c.name));
        if (key.length >= 4 && (cKey.includes(key) || key.includes(cKey)) && cKey.length > 0) {
          best = c;
          matchType = "probable_fuzzy";
          break;
        }
      }
    }

    if (matchType === "exact_normalized_name") exactMatches++;
    else if (matchType === "probable_fuzzy") probableMatches++;
    else noMatch++;

    dedupRows.push({
      officialId: record.officialIdentifier,
      officialName: record.nameRaw,
      region: record.region,
      department: record.department,
      arrondissement: record.arrondissement,
      existingMatchId: best?.id ?? null,
      existingName: best?.name ?? null,
      matchType,
      confidence: matchType === "exact_normalized_name" ? "high" : matchType === "probable_fuzzy" ? "medium" : "none",
      recommendedAction:
        matchType === "exact_normalized_name"
          ? "revue humaine : lier via duplicate_of_establishment_id (ne jamais fusionner automatiquement)"
          : matchType === "probable_fuzzy"
            ? "revue humaine obligatoire — correspondance incertaine"
            : "candidat nouveau (aucune correspondance trouvée)",
    });
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csvPath = join(rootDir, "reports", "registry", "batch-001-dedup.csv");
  const header = "official_id,official_name,region,department,arrondissement,existing_match_id,existing_name,match_type,confidence,recommended_action";
  const lines = [header, ...dedupRows.map((r) =>
    [r.officialId, r.officialName, r.region, r.department, r.arrondissement, r.existingMatchId, r.existingName, r.matchType, r.confidence, r.recommendedAction]
      .map(csvEscape)
      .join(",")
  )];
  writeFileSync(csvPath, lines.join("\n"), "utf-8");
  console.log(`Rapport de déduplication écrit : ${csvPath}`);

  // ── Résumé par ville/localité ──────────────────────────────────────────
  const byLocality = new Map<string, Map<string, number>>();
  for (const record of batch) {
    if (record.status === "rejected") continue;
    const loc = record.locality ?? "(inconnue)";
    const fam = record.educationFamily ?? "unknown";
    if (!byLocality.has(loc)) byLocality.set(loc, new Map());
    const m = byLocality.get(loc)!;
    m.set(fam, (m.get(fam) ?? 0) + 1);
  }
  const cityCsvPath = join(rootDir, "reports", "registry", "batch-001-by-locality.csv");
  const cityLines = ["locality,education_family,count"];
  for (const [loc, m] of Array.from(byLocality.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [fam, count] of m.entries()) cityLines.push([loc, fam, count].map(csvEscape).join(","));
  }
  writeFileSync(cityCsvPath, cityLines.join("\n"), "utf-8");
  console.log(`Rapport par localité écrit : ${cityCsvPath}`);

  // ── Résumé qualité + région ──────────────────────────────────────────────
  function regionSummary(region: string) {
    const raw = batch.filter((r) => r.region === region);
    const valid = raw.filter((r) => r.status !== "rejected");
    const unique = valid.filter((r) => r.status !== "duplicate_exact");
    const matches = dedupRows.filter((r) => r.region === region && r.matchType !== "no_match").length;
    const ambiguous = valid.filter((r) => r.status === "duplicate_review").length;
    return { raw: raw.length, valid: valid.length, unique: unique.length, matches, ambiguous };
  }

  const withOfficialId = batch.filter((r) => r.officialIdentifier).length;
  const withDepartment = batch.filter((r) => r.department).length;
  const withArrondissement = batch.filter((r) => r.arrondissement).length;
  const withLocality = batch.filter((r) => r.locality).length;
  const withCategory = batch.filter((r) => r.educationFamily).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    centre: regionSummary("CENTRE"),
    littoral: regionSummary("LITTORAL"),
    matching: { exactMatches, probableMatches, noMatch, currentEstablishments: live.length },
    quality: {
      totalRecords: batch.length,
      officialIdCoveragePct: Math.round((withOfficialId / batch.length) * 1000) / 10,
      departmentCoveragePct: Math.round((withDepartment / batch.length) * 1000) / 10,
      arrondissementCoveragePct: Math.round((withArrondissement / batch.length) * 1000) / 10,
      localityCoveragePct: Math.round((withLocality / batch.length) * 1000) / 10,
      categoryMappingPct: Math.round((withCategory / batch.length) * 1000) / 10,
    },
  };

  const summaryPath = join(rootDir, "reports", "registry", "batch-001-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Résumé qualité écrit : ${summaryPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Échec du matching Batch 001 :", error);
  process.exit(1);
});
