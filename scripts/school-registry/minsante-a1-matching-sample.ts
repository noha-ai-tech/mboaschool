import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget } from "./lib/matching/types";
import type { UniqueSchoolCandidate } from "./lib/extraction/minsanteDedup";

/**
 * SPRINT MINSANTE-A.1 §14 — Échantillon de 10-20 établissements uniques
 * extraits (data/registry/normalized/minsante-a1-unique-schools.json),
 * testés EN LECTURE SEULE contre la production via le moteur de matching
 * partagé (lib/matching/engine.ts, INCHANGÉ ce sprint). Audit particulier :
 * les mots génériques (école/formation/santé/sanitaire/centre/medical/
 * nursing) ne doivent jamais produire de faux match — ce script ne
 * modifie PAS le moteur, il l'exécute tel quel et rapporte le résultat réel
 * observé (y compris s'il révèle un problème, §14 dit explicitement de le
 * vérifier, pas de le corriger).
 *
 * AUCUNE écriture Supabase — clé ANON en lecture seule, comme
 * match-batch-002.ts.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

  const all: LiveEstablishment[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}/rest/v1/establishments?select=id,name,city,region,main_category&limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Supabase REST -> HTTP ${res.status} ${await res.text()}`);
    const page: LiveEstablishment[] = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/**
 * Sélection déterministe de 20 candidats : couvre les 10 régions (2 par
 * région quand disponible), en priorisant les noms chargés en vocabulaire
 * générique santé (école/formation/santé/sanitaire/centre/medical/nursing)
 * pour stresser précisément le risque documenté au §14/§11 du contrat
 * d'import (FUZZY_STOPWORDS sans vocabulaire santé générique).
 */
function selectSample(candidates: UniqueSchoolCandidate[], size = 20): UniqueSchoolCandidate[] {
  const byRegion = new Map<string, UniqueSchoolCandidate[]>();
  for (const c of candidates) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, []);
    byRegion.get(c.region)!.push(c);
  }
  const genericScore = (name: string) => {
    const n = name.toUpperCase();
    const terms = ["ECOLE", "FORMATION", "SANTE", "SANITAIRE", "CENTRE", "MEDICAL", "MEDICO", "NURSING", "PERSONNEL"];
    return terms.filter((t) => n.includes(t)).length;
  };

  const sample: UniqueSchoolCandidate[] = [];
  const regions = Array.from(byRegion.keys()).sort();
  for (const region of regions) {
    const sorted = [...byRegion.get(region)!].sort((a, b) => genericScore(b.displayName) - genericScore(a.displayName) || a.displayName.localeCompare(b.displayName));
    sample.push(...sorted.slice(0, 2));
    if (sample.length >= size) break;
  }
  return sample.slice(0, size);
}

async function main() {
  const uniqueSchoolsPath = join(rootDir, "data", "registry", "normalized", "minsante-a1-unique-schools.json");
  const data = JSON.parse(readFileSync(uniqueSchoolsPath, "utf-8")) as { candidates: UniqueSchoolCandidate[] };

  const sample = selectSample(data.candidates, 20);
  console.log(`Échantillon sélectionné : ${sample.length} établissement(s) sur ${data.candidates.length} candidats uniques (couverture ${new Set(sample.map((s) => s.region)).size} région(s)).`);

  const live = await fetchLiveEstablishments();
  console.log(`${live.length} établissement(s) réel(s) chargé(s) en lecture seule (clé anon, toute la base — aucun filtre région côté serveur, cf. match-batch-002.ts).`);

  const targets: MatchTarget[] = live.map((e) => ({
    id: e.id,
    name: e.name,
    region: e.region,
    city: e.city,
    category: e.main_category,
    identifiers: [],
  }));

  const results = sample.map((c) => {
    const candidate: MatchCandidate = {
      name: c.displayName,
      region: c.region,
      city: null,
      category: null,
      identifiers: [],
    };
    const result = matchCandidate(candidate, targets);
    return { candidate: c, result };
  });

  const byLevel: Record<string, number> = {};
  for (const r of results) byLevel[r.result.level] = (byLevel[r.result.level] ?? 0) + 1;
  console.log(`Répartition des niveaux de match : ${JSON.stringify(byLevel)}`);

  const unsafeAutoLink = results.filter((r) => r.result.safeForAutoLink);
  console.log(`safeForAutoLink=true observé : ${unsafeAutoLink.length} (attendu 0 — jamais de fusion automatique autorisée par ce moteur)`);

  const reportsDir = join(rootDir, "reports", "registry");
  mkdirSync(reportsDir, { recursive: true });
  const header = "candidate_name,candidate_region,programs,match_level,matched_target_id,matched_target_name,matched_target_region,safe_for_auto_link,reason";
  const csv = [
    header,
    ...results.map((r) =>
      [
        r.candidate.displayName,
        r.candidate.region,
        r.candidate.programsNormalized.join(" | "),
        r.result.level,
        r.result.target?.id ?? "",
        r.result.target?.name ?? "",
        r.result.target?.region ?? "",
        r.result.safeForAutoLink ? "YES" : "NO",
        r.result.reason,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(reportsDir, "minsante-a1-matching-sample.csv"), csv, "utf-8");
  console.log(`Rapport écrit : reports/registry/minsante-a1-matching-sample.csv (${results.length} lignes)`);
  console.log(`\nAucune écriture Supabase effectuée par ce script (clé ANON, lecture seule).`);
}

main().catch((e) => {
  console.error("MATCHING SAMPLE FAILED:", e.message);
  process.exit(1);
});
