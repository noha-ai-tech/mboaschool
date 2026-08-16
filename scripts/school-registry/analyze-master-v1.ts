import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P — Analyse du dataset MINESEC Master V1 (data/registry/master/) :
 * enrichissement géographique par inférence locale (PAS de nouvel appel
 * MINESEC), qualité, et correspondance avec la base réelle actuelle
 * (lecture seule, clé anon). N'écrit que des rapports locaux.
 *
 * Méthode d'enrichissement géographique : la source MINESEC ne fournit le
 * département/arrondissement que comme critère de FILTRE serveur, jamais
 * comme colonne par ligne (voir sources/minesec.ts). Ce script tente une
 * inférence a posteriori : si la localité brute d'une ligne correspond
 * (comparaison insensible à la casse/accents) à un nom d'arrondissement
 * connu (data/cameroon/geography-*.json) DANS LA MÊME RÉGION, le
 * département est déduit de cet arrondissement. Best-effort, jamais
 * garanti — voir DEDUPLICATION_RULES.md sur le principe "ne jamais deviner".
 * Une correspondance trouvée ici est une coïncidence de nom, pas une
 * confirmation officielle MINESEC.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface GeoFile {
  regions: { id: string; name: string }[];
  departments: { id: string; regionId: string; name: string }[];
  arrondissements: { departmentId: string; name: string }[];
}

function loadGeo(file: string): GeoFile {
  return JSON.parse(readFileSync(join(rootDir, "data", "cameroon", file), "utf-8"));
}

const REGION_LABELS: Record<string, string> = {
  CENTRE: "Centre",
  LITTORAL: "Littoral",
  OUEST: "Ouest",
  ADAMAOUA: "Adamaoua",
  NORD: "Nord",
  "EXTREME-NORD": "Extrême-Nord",
};

// Localités manifestement invalides observées dans la source MINESEC elle-même
// (pas des erreurs d'extraction) — voir rapport SPRINT O.
const SUSPICIOUS_LOCALITY_PATTERNS = [
  /^(oui|non)$/i,
  /^\d+$/,
  /degre/i,
  /degré/i,
  /chefferie/i,
];

function isSuspiciousLocality(locality: string): boolean {
  return SUSPICIOUS_LOCALITY_PATTERNS.some((re) => re.test(locality.trim()));
}

async function fetchCurrentEstablishments(): Promise<{ id: string; name: string; city: string | null; region: string | null }[]> {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("Variables Supabase introuvables dans .env.local");

  const res = await fetch(`${url}/rest/v1/establishments?select=id,name,city,region`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase REST -> HTTP ${res.status}`);
  return res.json();
}

async function checkStagingTableExists(): Promise<{ exists: boolean; detail: string }> {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("Variables Supabase introuvables dans .env.local");

  const res = await fetch(`${url}/rest/v1/establishment_import_staging?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (res.status === 404 || /PGRST205|Could not find the table/i.test(text)) {
    return { exists: false, detail: `HTTP ${res.status} — table absente (migration 0006 non exécutée)` };
  }
  return { exists: res.ok, detail: `HTTP ${res.status}` };
}

function matchKey(nameNormalized: string): string {
  return nameNormalized.replace(/^lyce\s+/, "").replace(/^lycee\s+/, "").trim();
}

async function main() {
  const masterPath = join(rootDir, "data", "registry", "master", "minesec-master-v1.json");
  const master: NormalizedStagingRecord[] = JSON.parse(readFileSync(masterPath, "utf-8"));

  const geoCentreLittoral = loadGeo("geography-centre-littoral.json");
  const geoOuestGrandNord = loadGeo("geography-ouest-grand-nord.json");

  // Index arrondissement (stripAccents) -> { departmentName, regionName } par région, cross-fichier.
  const arrByRegion = new Map<string, Map<string, string>>(); // regionLabel -> (arrKey -> deptName)
  for (const geo of [geoCentreLittoral, geoOuestGrandNord]) {
    const deptById = new Map(geo.departments.map((d) => [d.id, d]));
    const regionById = new Map(geo.regions.map((r) => [r.id, r]));
    for (const arr of geo.arrondissements) {
      const dept = deptById.get(arr.departmentId);
      if (!dept) continue;
      const region = regionById.get(dept.regionId);
      if (!region) continue;
      if (!arrByRegion.has(region.name)) arrByRegion.set(region.name, new Map());
      arrByRegion.get(region.name)!.set(stripAccents(arr.name), dept.name);
    }
  }

  // ── Enrichissement géographique par inférence locale ────────────────────
  let inferredDepartment = 0;
  const suspiciousLocalities: { name: string; region: string | null; locality: string }[] = [];
  let withLocalityRaw = 0;
  let withValidLocality = 0; // localité présente ET non suspecte

  for (const r of master) {
    if (r.locality) {
      withLocalityRaw++;
      if (isSuspiciousLocality(r.locality)) {
        suspiciousLocalities.push({ name: r.nameRaw, region: r.region, locality: r.locality });
      } else {
        withValidLocality++;
      }
    }
    const regionLabel = REGION_LABELS[r.region ?? ""] ?? null;
    if (regionLabel && r.locality) {
      const arrIndex = arrByRegion.get(regionLabel);
      if (arrIndex) {
        const locKey = stripAccents(r.locality);
        // correspondance exacte, puis correspondance "la localité contient le nom d'arrondissement"
        let dept = arrIndex.get(locKey);
        if (!dept) {
          for (const [arrKey, deptName] of arrIndex) {
            if (arrKey.length >= 4 && locKey.includes(arrKey)) {
              dept = deptName;
              break;
            }
          }
        }
        if (dept) inferredDepartment++;
      }
    }
  }

  const withDeptRaw = master.filter((r) => r.department).length; // toujours 0 par construction (filtre serveur non exploité par ligne)
  const withArrRaw = master.filter((r) => r.arrondissement).length;
  const withCategory = master.filter((r) => r.educationFamily).length;
  const invalidRows = master.filter((r) => r.status === "rejected").length;
  const ambiguousGeography = master.filter((r) => r.status === "duplicate_review").length;

  // ── Matching contre la base réelle actuelle ──────────────────────────────
  const live = await fetchCurrentEstablishments();
  const liveByRegion = new Map<string, typeof live>();
  for (const e of live) {
    const key = stripAccents(e.region ?? "").toUpperCase();
    if (!liveByRegion.has(key)) liveByRegion.set(key, []);
    liveByRegion.get(key)!.push(e);
  }

  let exactMatches = 0, probableMatches = 0, ambiguousMatches = 0, newCandidates = 0;
  for (const r of master) {
    if (r.status === "rejected") continue;
    const regionKey = stripAccents(REGION_LABELS[r.region ?? ""] ?? "").toUpperCase();
    const candidates = liveByRegion.get(regionKey) ?? [];
    const key = matchKey(r.nameNormalized);
    let matched: "exact" | "probable" | "none" = "none";
    for (const c of candidates) {
      const cKey = matchKey(normalizeName(c.name));
      if (cKey === key && key.length > 0) { matched = "exact"; break; }
    }
    if (matched === "none") {
      for (const c of candidates) {
        const cKey = matchKey(normalizeName(c.name));
        if (key.length >= 4 && (cKey.includes(key) || key.includes(cKey)) && cKey.length > 0) { matched = "probable"; break; }
      }
    }
    if (matched === "exact") exactMatches++;
    else if (matched === "probable") probableMatches++;
    else newCandidates++;
    if (r.status === "duplicate_review") ambiguousMatches++;
  }

  const staging = await checkStagingTableExists();

  const summary = {
    generatedAt: new Date().toISOString(),
    masterTotal: master.length,
    geographicEnrichment: {
      regionCoveragePct: 100,
      departmentCoveragePctRaw: Math.round((withDeptRaw / master.length) * 1000) / 10,
      arrondissementCoveragePctRaw: Math.round((withArrRaw / master.length) * 1000) / 10,
      localityRawCoveragePct: Math.round((withLocalityRaw / master.length) * 1000) / 10,
      validLocalityCoveragePct: Math.round((withValidLocality / master.length) * 1000) / 10,
      departmentInferredFromLocalityPct: Math.round((inferredDepartment / master.length) * 1000) / 10,
      departmentInferredFromLocalityCount: inferredDepartment,
    },
    quality: {
      categoryCoveragePct: Math.round((withCategory / master.length) * 1000) / 10,
      invalidRows,
      ambiguousGeography,
      suspiciousLocalitiesCount: suspiciousLocalities.length,
    },
    matchingCurrentDb: {
      currentEstablishments: live.length,
      exactMatches,
      probableMatches,
      ambiguousMatches,
      newCandidates,
    },
    staging,
  };

  const outDir = join(rootDir, "reports", "registry");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "master-v1-analysis.json"), JSON.stringify(summary, null, 2), "utf-8");

  // Rapport de revue humaine : localités suspectes (échantillon complet).
  const reviewLines = ["name,region,suspicious_locality", ...suspiciousLocalities.map((s) =>
    [s.name, s.region ?? "", s.locality].map((v) => `"${v.replace(/"/g, '""')}"`).join(","))];
  writeFileSync(join(outDir, "master-v1-human-review.csv"), reviewLines.join("\n"), "utf-8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Rapport de revue humaine (${suspiciousLocalities.length} lignes) : ${join(outDir, "master-v1-human-review.csv")}`);
}

main().catch((error) => {
  console.error("Échec de l'analyse Master V1 :", error);
  process.exit(1);
});
