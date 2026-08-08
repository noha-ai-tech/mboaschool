import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMinesecAdapter } from "./sources/minesec";
import { normalizeRecord } from "./lib/normalize";
import { deduplicateBatch } from "./lib/dedup";
import type { NormalizedStagingRecord } from "./types";

/**
 * CLI de test — DATA-REGISTRY-01.
 *
 * Usage :
 *   npx tsx run-import.ts --source minesec --fixture
 *
 * IMPORTANT : ce script n'écrit JAMAIS dans Supabase. Il ne fait qu'écrire
 * un fichier JSON local représentant ce qui serait inséré dans
 * `establishment_import_staging` (voir supabase/migrations/0006_*.sql,
 * non exécutée). Ne rien envoyer dans `establishments` — ce script ne le
 * fait d'ailleurs techniquement pas.
 *
 * --fixture : utilise scripts/school-registry/fixtures/minesec-sample.html
 *   au lieu d'un appel réseau réel. Nécessaire dans cette mission car
 *   l'environnement d'exécution n'a pas d'accès réseau sortant fiable vers
 *   minesec.gov.cm (voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md). Sans ce
 *   flag, l'adaptateur MINESEC tente un vrai fetch réseau.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

interface QualityReport {
  source: string;
  sourceUrl: string;
  ranAt: string;
  mode: "fixture" | "live";
  rawCount: number;
  normalizedCount: number;
  withOfficialIdentifier: number;
  withoutOfficialIdentifier: number;
  exactDuplicates: number;
  potentialDuplicates: number;
  rejected: number;
  ready: number;
  regionsCovered: string[];
  rejectedDetails: { name: string; reason: string }[];
  educationFamilyBreakdown: Record<string, number>;
  subsystemBreakdown: Record<string, number>;
}

function buildQualityReport(
  source: string,
  sourceUrl: string,
  mode: "fixture" | "live",
  rawCount: number,
  records: NormalizedStagingRecord[]
): QualityReport {
  const withOfficialIdentifier = records.filter((r) => r.officialIdentifier).length;
  const rejectedRecords = records.filter((r) => r.status === "rejected");
  const exactDuplicates = records.filter((r) => r.status === "duplicate_exact").length;
  const potentialDuplicates = records.filter((r) => r.status === "duplicate_review").length;
  const ready = records.filter((r) => r.status === "ready").length;

  const regionsCovered = Array.from(
    new Set(records.map((r) => r.region).filter((v): v is string => Boolean(v)))
  ).sort();

  const educationFamilyBreakdown: Record<string, number> = {};
  const subsystemBreakdown: Record<string, number> = {};
  for (const r of records) {
    const fam = r.educationFamily ?? "null";
    educationFamilyBreakdown[fam] = (educationFamilyBreakdown[fam] ?? 0) + 1;
    subsystemBreakdown[r.subsystem] = (subsystemBreakdown[r.subsystem] ?? 0) + 1;
  }

  return {
    source,
    sourceUrl,
    ranAt: new Date().toISOString(),
    mode,
    rawCount,
    normalizedCount: records.length,
    withOfficialIdentifier,
    withoutOfficialIdentifier: records.length - withOfficialIdentifier,
    exactDuplicates,
    potentialDuplicates,
    rejected: rejectedRecords.length,
    ready,
    regionsCovered,
    rejectedDetails: rejectedRecords.map((r) => ({
      name: r.nameRaw || "(vide)",
      reason: r.rejectionReason ?? "raison inconnue",
    })),
    educationFamilyBreakdown,
    subsystemBreakdown,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find((a) => a.startsWith("--source"))?.split("=")[1] ?? "minesec";
  const useFixture = args.includes("--fixture");

  if (sourceArg !== "minesec") {
    console.error(
      `Source "${sourceArg}" non implémentée dans cette mission. Seul MINESEC est fonctionnel — voir SOURCE_CATALOG.md.`
    );
    process.exit(1);
  }

  const fixturePath = join(__dirname, "fixtures", "minesec-sample.html");
  const adapter = createMinesecAdapter(
    useFixture
      ? {
          htmlFetcher: async () => readFileSync(fixturePath, "utf-8"),
          maxPages: 1,
        }
      : { maxPages: 2 } // garde-fou : jamais un crawl complet sans confirmation explicite
  );

  console.log(`Import ${adapter.sourceName} (${adapter.ministry}) — mode ${useFixture ? "fixture" : "live"}`);

  const rawRecords = await adapter.fetchAll();
  console.log(`  ${rawRecords.length} enregistrement(s) brut(s) récupéré(s)`);

  const normalized = rawRecords.map(normalizeRecord);
  const { records: deduplicated, exactDuplicates, potentialDuplicates } = deduplicateBatch(normalized);

  const outputDir = join(__dirname, "output");
  mkdirSync(outputDir, { recursive: true });

  const stagingOutputPath = join(outputDir, `${adapter.ministry.toLowerCase()}-staging-dryrun.json`);
  writeFileSync(stagingOutputPath, JSON.stringify(deduplicated, null, 2), "utf-8");
  console.log(`  Staging (dry-run) écrit dans ${stagingOutputPath}`);

  const report = buildQualityReport(
    adapter.sourceName,
    "https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg",
    useFixture ? "fixture" : "live",
    rawRecords.length,
    deduplicated
  );

  const reportPath = join(outputDir, `${adapter.ministry.toLowerCase()}-quality-report.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`  Rapport de qualité écrit dans ${reportPath}`);

  console.log("\n=== RAPPORT DE QUALITÉ ===");
  console.log(JSON.stringify(report, null, 2));

  if (exactDuplicates !== report.exactDuplicates || potentialDuplicates !== report.potentialDuplicates) {
    throw new Error("Incohérence interne entre deduplicateBatch et buildQualityReport");
  }
}

main().catch((error) => {
  console.error("Échec de l'import :", error);
  process.exit(1);
});
