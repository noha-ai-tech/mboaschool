import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./school-registry/lib/normalize";
import type { NormalizedStagingRecord } from "./school-registry/types";

/**
 * CLI générale d'import du registre national Écoles237 (SPRINT N §14).
 *
 * Usage :
 *   <tsx> scripts/import-national-registry.ts --source=MINESEC --file=data/registry/normalized/minesec-centre-littoral-2026-08-16.json --dry-run
 *
 * Comme ce projet principal n'a pas de runtime TypeScript direct (pas de
 * tsx/ts-node en dépendance — voir package.json), exécuter via le binaire
 * tsx déjà installé dans l'outillage isolé du registre :
 *   scripts/school-registry/node_modules/.bin/tsx scripts/import-national-registry.ts --file=... --dry-run
 *
 * Comportement :
 *   - PAR DÉFAUT (aucun flag, ou --dry-run explicite) : lecture seule.
 *     Compare le fichier normalisé donné aux établissements réels déjà en
 *     base (Supabase REST, clé anon, lecture seule) et affiche un rapport.
 *     N'écrit RIEN, nulle part.
 *   - --commit : VOLONTAIREMENT NON IMPLÉMENTÉ à ce stade. Ce script lève
 *     une erreur explicite plutôt que d'écrire quoi que ce soit — SPRINT N
 *     s'arrête avant toute écriture Supabase (staging comprise). L'écriture
 *     réelle vers `establishment_import_staging` sera un développement
 *     séparé, après validation explicite d'Eddy et de l'architecte, et
 *     nécessitera une clé service-role (absente de cet environnement).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

interface Args {
  source: string | null;
  file: string | null;
  dryRun: boolean;
  commit: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => argv.find((a) => a.startsWith(`--${flag}=`))?.split("=").slice(1).join("=") ?? null;
  return {
    source: get("source"),
    file: get("file"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--commit"),
    commit: argv.includes("--commit"),
  };
}

interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
}

async function fetchLiveEstablishments(regions: string[]): Promise<LiveEstablishment[]> {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY introuvables dans .env.local");

  const regionFilter = regions.length > 0 ? `&region=in.(${regions.map((r) => r[0] + r.slice(1).toLowerCase()).join(",")})` : "";
  const res = await fetch(`${url}/rest/v1/establishments?select=id,name,city,region${regionFilter}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase REST -> HTTP ${res.status}`);
  return res.json();
}

function matchKey(nameNormalized: string): string {
  return nameNormalized.replace(/^lyce\s+/, "").replace(/^lycee\s+/, "").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.commit) {
    throw new Error(
      "--commit est désactivé dans cette version du script. SPRINT N s'arrête avant toute écriture Supabase " +
        "(voir rapport SPRINT N — MINESEC BATCH 001 READY). Utilisez --dry-run."
    );
  }

  if (!args.file) {
    throw new Error("--file=<chemin vers un dataset normalisé> est requis en mode dry-run.");
  }

  const filePath = join(rootDir, args.file);
  const records: NormalizedStagingRecord[] = JSON.parse(readFileSync(filePath, "utf-8"));

  const rowsRead = records.length;
  const invalid = records.filter((r) => r.status === "rejected");
  const valid = records.filter((r) => r.status !== "rejected");
  const duplicates = records.filter((r) => r.status === "duplicate_exact");
  const ambiguous = records.filter((r) => r.status === "duplicate_review");

  const regionsPresent = Array.from(new Set(valid.map((r) => r.region).filter((v): v is string => Boolean(v))));
  const live = await fetchLiveEstablishments(regionsPresent);
  const liveByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of live) {
    const k = (e.region ?? "").toUpperCase();
    if (!liveByRegion.has(k)) liveByRegion.set(k, []);
    liveByRegion.get(k)!.push(e);
  }

  let exactMatches = 0;
  let probableMatches = 0;
  let newCandidates = 0;

  for (const r of valid) {
    if (r.status === "duplicate_exact") continue;
    const candidates = liveByRegion.get((r.region ?? "").toUpperCase()) ?? [];
    const key = matchKey(r.nameNormalized);
    const exact = candidates.some((c) => matchKey(normalizeName(c.name)) === key && key.length > 0);
    const probable =
      !exact && candidates.some((c) => {
        const cKey = matchKey(normalizeName(c.name));
        return key.length >= 4 && cKey.length > 0 && (cKey.includes(key) || key.includes(cKey));
      });
    if (exact) exactMatches++;
    else if (probable) probableMatches++;
    else newCandidates++;
  }

  console.log("=== DRY RUN — scripts/import-national-registry.ts ===");
  console.log(`source           : ${args.source ?? "(non spécifié)"}`);
  console.log(`file             : ${args.file}`);
  console.log(`rows_read        : ${rowsRead}`);
  console.log(`valid            : ${valid.length}`);
  console.log(`invalid          : ${invalid.length}`);
  console.log(`new_candidates   : ${newCandidates}`);
  console.log(`exact_matches    : ${exactMatches}`);
  console.log(`probable_matches : ${probableMatches}`);
  console.log(`duplicates       : ${duplicates.length}`);
  console.log(`ambiguous        : ${ambiguous.length}`);
  console.log("\nAUCUNE écriture effectuée (dry-run). Voir reports/registry/ pour le détail par établissement.");
}

main().catch((error) => {
  console.error("Échec du dry-run :", error.message ?? error);
  process.exit(1);
});
