import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT R.2-SAFETY §63-65 — Audit rétrospectif des 307 lignes staging du
 * pilote Douala/Yaoundé (source_ministry='OTHER'), écrites AVANT l'existence
 * de ce framework. Ne promeut rien, ne supprime rien (§65). Sépare deux
 * dimensions distinctes (§64) :
 *
 *   EXTRACTION_SAFE       — la MÉTHODE de collecte était déterministe
 *                            (parseur regex sur HTML brut, compte vérifiable)
 *   EXTRACTION_UNCERTAIN  — la donnée vient d'un résumé WebFetch/recherche
 *                            web assistée par IA, jamais d'un parseur
 *                            déterministe avec équation de complétude —
 *                            exactement le pattern de l'incident Yaoundé,
 *                            même si le résultat individuel est probablement
 *                            correct (source Tier 3 dans tous les cas — la
 *                            qualité de source est une 3e dimension séparée,
 *                            déjà documentée : aucune ligne n'est
 *                            CLEAN_APPROVABLE).
 *
 * LECTURE SEULE — ne modifie aucune ligne existante.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface StagingRow {
  id: string;
  city: string | null;
  created_at: string;
  raw_data: { official_name?: string; source_name?: string; source_url?: string } | null;
}

/**
 * Les 26 noms extraits DÉTERMINISTIQUEMENT du menu déroulant Osidimbea
 * Douala (`data/registry/raw/.../osidimbea-douala-prives-laics.html`, la
 * section `<select name="ListeUrl">`) — reconstitué depuis les logs de la
 * session R.2 (le `source_name` d'origine ne distinguait pas encore cette
 * méthode d'un résumé IA, corrigé par cet audit). Comparaison insensible à
 * la casse/accents.
 */
const DOUALA_DETERMINISTIC_DROPDOWN_NAMES = new Set(
  [
    "CEFTI", "CEGT MALANGUE", "CETI NGUEUGA", "CETI STE CECILE", "COLLEGE ANDRE MALRAUX",
    "COLLEGE BENEDICTE", "COLLEGE BILINGUE ADONAÏ", "COLLEGE BILINGUE BONCHOUO",
    "COLLEGE BILINGUE EMERGENCE MIAFO SOLANGE", "COLLEGE BILINGUE FANON ET CESAIRE",
    "COLLEGE BILINGUE FO KAMGA JOSEPH DAUPHINE", "COLLEGE BILINGUE LA CADENELLE",
    "COLLEGE BILINGUE L'ORCHIDEE", "COLLEGE BILINGUE LA PERLE", "COLLEGE BILINGUE LAVAL",
    "COLLEGE BILINGUE LE PETIT ROUSSEAU", "COLLEGE BILINGUE LES LEADERS", "COLLEGE BILINGUE MATURITE",
    "COLLEGE CHARLES DE GAULLE", "COLLEGE CHRISTINA", "COLLEGE DAUPHINE", "COLLEGE DE LA LIBERTE",
    "COLLEGE DE LA RESPONSABILITE", "COLLEGE DE LA RETRAITE EDINGELE", "COLLEGE DU LEVANT BONABERI",
    "COLLEGE LA CONQUETE", "FONDATION KAMTCHOUM-NDAMI COLLEGE",
  ].map((n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase())
);

function classify(row: StagingRow): "EXTRACTION_SAFE" | "EXTRACTION_UNCERTAIN" {
  const sourceName = row.raw_data?.source_name ?? "";
  const name = (row.raw_data?.official_name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  if (sourceName.includes("extraction complète")) return "EXTRACTION_SAFE";
  if (DOUALA_DETERMINISTIC_DROPDOWN_NAMES.has(name)) return "EXTRACTION_SAFE";
  return "EXTRACTION_UNCERTAIN";
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const rows = await fetchAllPaginated<StagingRow>(
    url,
    key,
    "/rest/v1/establishment_import_staging?select=id,city,created_at,raw_data&source_ministry=eq.OTHER"
  );

  function citiesOf(list: StagingRow[]) {
    return [...new Set(list.map((r) => r.city ?? "UNKNOWN"))];
  }

  const douala = rows.filter((r) => r.city === "Douala");
  const yaounde = rows.filter((r) => r.city === "Yaoundé");
  const others = rows.filter((r) => r.city !== "Douala" && r.city !== "Yaoundé");

  function summarize(label: string, subset: StagingRow[]) {
    const safe = subset.filter((r) => classify(r) === "EXTRACTION_SAFE");
    const uncertain = subset.filter((r) => classify(r) === "EXTRACTION_UNCERTAIN");
    return {
      label,
      total: subset.length,
      extraction_safe: safe.length,
      extraction_uncertain: uncertain.length,
      uncertain_sample: uncertain.slice(0, 5).map((r) => r.raw_data?.official_name ?? "?"),
    };
  }

  const report = {
    audit_date: new Date().toISOString(),
    operator: "jean-merlain",
    batch: "major-cities-secondary-completeness-v1",
    scope: "Audit RÉTROSPECTIF — lecture seule, aucune promotion, aucune suppression (§63-65)",
    total_rows_audited: rows.length,
    douala: summarize("Douala", douala),
    yaounde: summarize("Yaoundé", yaounde),
    other_cities: summarize("Autres villes (Mission A2)", others),
    other_cities_breakdown: citiesOf(others).map((c) => summarize(c, others.filter((r) => r.city === c))),
    source_quality_note:
      "Dimension séparée de l'extraction safety (§50) : les 307 lignes sont TOUTES Tier 3 (§16), donc aucune n'est CLEAN_APPROVABLE quelle que soit la méthode d'extraction. EXTRACTION_SAFE signifie 'méthode de collecte vérifiable', pas 'source officielle'.",
    action_taken: "AUCUNE — aucune ligne staging modifiée, supprimée ou promue par cet audit (§65).",
    recommendation:
      "Les lignes EXTRACTION_UNCERTAIN (arrondissements publics Douala/Yaoundé, catholiques Yaoundé, recherche web générale, Mission A2) doivent être ré-extraites via un parseur déterministe (scripts/school-registry/lib/extraction/htmlExtractor.ts) avant tout futur import staging de complément — pas retirées de staging existant, simplement pas la référence pour la suite.",
  };

  mkdirSync(join(rootDir, "reports", "registry", "extraction"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "extraction", "r2-pilot-307-retrospective-audit.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log("=== RETROSPECTIVE AUDIT — 307 R.2 PILOT ROWS ===");
  console.log(`Total audité : ${report.total_rows_audited}`);
  console.log(`Douala : ${report.douala.extraction_safe} safe / ${report.douala.extraction_uncertain} uncertain (sur ${report.douala.total})`);
  console.log(`Yaoundé : ${report.yaounde.extraction_safe} safe / ${report.yaounde.extraction_uncertain} uncertain (sur ${report.yaounde.total})`);
  console.log(`Autres villes : ${report.other_cities.extraction_safe} safe / ${report.other_cities.extraction_uncertain} uncertain (sur ${report.other_cities.total})`);
  console.log("\nRapport écrit : reports/registry/extraction/r2-pilot-307-retrospective-audit.json");
}

main().catch((error) => {
  console.error("Échec audit rétrospectif :", error);
  process.exit(1);
});
