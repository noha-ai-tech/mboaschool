import { writeFileSync, mkdirSync } from "node:fs";
import { sha256 } from "./lib/extraction/hashing";

/**
 * SPRINT MINESUP-B.1 — élargissement READ-ONLY de l'échantillon
 * d'identifiants IPES (50-100 fiches, cible 75) sur les 10 régions, pour
 * valider à plus grande échelle ce que MINESUP-B (20 fiches) a trouvé.
 * Aucun import, aucune écriture DB, aucune migration exécutée.
 *
 * Politique PII (§5, renforcée après la découverte MINESUP-B d'un nom de
 * promoteur dans une URL) : toute `source_url` dont le slug ressemble à un
 * nom de personne physique n'est PAS persistée en clair dans le rapport
 * versionné — remplacée par `source_record_id`/hash uniquement.
 */

const IPES_URL = "https://www.minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/";
const PARSER_VERSION = "minesup-b1-2026-08-19";
const TARGET_SAMPLE = 75;
const MIN_SAMPLE = 50;
const MAX_SAMPLE = 100;

interface ListEntry {
  region: string;
  text: string;
  url: string | null;
}

function segmentByRegionHeading(html: string): { region: string; index: number }[] {
  const headerRe = /<p style="text-align: justify;"><strong>Région[^<]*<\/strong><\/p>/g;
  return [...html.matchAll(headerRe)].map((m) => ({ region: m[0].replace(/<[^>]+>/g, ""), index: m.index! }));
}

function extractListEntries(html: string): ListEntry[] {
  const positions = segmentByRegionHeading(html);
  positions.push({ region: "END", index: html.length });
  const all: ListEntry[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const seg = html.slice(positions[i].index, positions[i + 1].index);
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(seg))) {
      const raw = m[1];
      const text = raw.replace(/<[^>]+>/g, "").replace(/&#8217;|&rsquo;/g, "'").trim();
      if (!text) continue;
      const linkMatch = raw.match(/href="([^"]+)"/);
      all.push({ region: positions[i].region, text, url: linkMatch ? linkMatch[1].replace(/&amp;/g, "&") : null });
    }
  }
  return all;
}

function isRealDetailPage(url: string | null): url is string {
  if (!url) return false;
  if (url.endsWith(".pdf") || url.includes("wp-content/uploads/")) return false;
  if (/region-[a-z-]+\/$/.test(url)) return false;
  return true;
}

/** Détecte une URL qui contient vraisemblablement un nom de personne physique (cf. découverte MINESUP-B). */
function urlLikelyContainsPersonName(url: string): boolean {
  return /nom-du-promoteur|nom-du-representant|promoteur-[a-z-]{6,}/i.test(url);
}

/**
 * Échantillon stratifié par région, proportionnel à la taille de chaque
 * région (avec un plancher de 3/région quand disponible et un plafond par
 * région pour éviter que Centre/Littoral n'écrasent la diversité), et
 * espacé UNIFORMÉMENT dans la liste de chaque région (pas seulement
 * début/milieu/fin) pour réduire le risque de biais d'ordre chronologique
 * de la source.
 */
function buildStratifiedSample(entries: ListEntry[], target: number, maxTotal: number): ListEntry[] {
  const regions = [...new Set(entries.map((e) => e.region))];
  const byRegion = regions
    .map((r) => ({ region: r, withLink: entries.filter((e) => e.region === r && isRealDetailPage(e.url)) }))
    .filter((r) => r.withLink.length > 0);
  const totalWithLink = byRegion.reduce((s, r) => s + r.withLink.length, 0);

  const perRegionCap = 20;
  const allocations = byRegion.map((r) => {
    const proportional = Math.round((target * r.withLink.length) / totalWithLink);
    const floor = Math.min(r.withLink.length, 3);
    const count = Math.min(perRegionCap, r.withLink.length, Math.max(proportional, floor));
    return { region: r.region, withLink: r.withLink, count };
  });

  const sample: ListEntry[] = [];
  for (const a of allocations) {
    const n = a.withLink.length;
    const k = a.count;
    if (k >= n) {
      sample.push(...a.withLink);
      continue;
    }
    // Espacement uniforme déterministe (indices régulièrement répartis, pas de hasard).
    const step = n / k;
    const picked = new Set<number>();
    for (let i = 0; i < k; i++) picked.add(Math.floor(i * step));
    [...picked].sort((x, y) => x - y).forEach((i) => sample.push(a.withLink[i]));
  }
  return sample.slice(0, maxTotal);
}

function extractField(html: string, labelPatterns: RegExp[]): string | null {
  for (const label of labelPatterns) {
    const re = new RegExp(`<strong>\\s*${label.source}\\s*<\\/strong>\\s*:?\\s*(?:<br\\s*/?>)?\\s*([^<]*)`, "i");
    const m = html.match(re);
    if (m) {
      const val = m[1].replace(/&nbsp;|&rsquo;|&#8217;/g, "'").trim();
      if (val) return val;
    }
  }
  return null;
}
function fieldPresent(html: string, labelPatterns: RegExp[]): boolean {
  return labelPatterns.some((label) => new RegExp(`<strong>\\s*${label.source}\\s*<\\/strong>`, "i").test(html));
}

const CREATION = [/Arr[eê]t[eé]s?\s+portant\s+cr[eé]ation/];
const OPENING = [/Autorisation\s+d.ouverture/];
const PROVISIONAL = [/Arr[eê]t[eé]\s+provisoire\s+de\s+cr[eé]ation\s+et\s+d.ouverture\s+N.?/];
const STATUS_CHANGE = [/Arr[eê]t[eé]\(s\)\s+portant\s+changement\s+de\s+statut\s+de\s+fonctionnement[^<]*/];
const REGION_FIELD = [/R[eé]gion/];
const CITY_FIELD = [/Site\s+de\s+localisation/];
const PII_FIELDS = [/Nom\s+du\s+promoteur/, /Nom\s+du\s+repr[eé]sentant\s+l[eé]gal/];

const CONFESSIONAL_KEYWORDS = /cathol|protestant|adventist|islam|presbyt[ée]rien|baptist|biblique|th[ée]ologi|s[ée]minaire|coran|chr[ée]tien|eglise|église/i;

function classifyFormat(raw: string | null): {
  hasPrefix: boolean;
  separator: "slash" | "dash" | "mixed" | "none" | null;
  hasYear: boolean;
  hasMinesupToken: boolean;
  hasDateSuffix: boolean;
  segmentCount: number;
  looksTruncated: boolean;
  looksMalformed: boolean;
} | null {
  if (!raw) return null;
  const hasPrefix = /^\s*[nN]°/.test(raw);
  const hasSlash = raw.includes("/");
  const hasDash = /\d-\d/.test(raw);
  const separator = hasSlash && hasDash ? "mixed" : hasSlash ? "slash" : hasDash ? "dash" : "none";
  const hasYear = /\b(19|20)\d{2}\b/.test(raw);
  const hasMinesupToken = /MINESUP/i.test(raw);
  const hasDateSuffix = /\bdu\s+\d{1,2}\s+[a-zéû]+\s+(19|20)\d{2}/i.test(raw);
  const segmentCount = raw.split("/").length;
  const looksTruncated = /\bdu\s*$/.test(raw.trim()) || /[\/-]\s*$/.test(raw.trim());
  const looksMalformed = !hasMinesupToken || (hasSlash && raw.split("/").some((s) => s.trim().length === 0));
  return { hasPrefix, separator, hasYear, hasMinesupToken, hasDateSuffix, segmentCount, looksTruncated, looksMalformed };
}

async function fetchText(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Ecoles237-registry-audit/1.0)" } });
  return { status: res.status, html: await res.text() };
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const operator = "jean-merlain";
  const fetchedAtIndex = new Date().toISOString();
  const { status: indexStatus, html: indexHtml } = await fetchText(IPES_URL);
  const indexHash = sha256(indexHtml);

  const entries = extractListEntries(indexHtml);
  const sample = buildStratifiedSample(entries, TARGET_SAMPLE, MAX_SAMPLE);
  console.log(`Sample built: ${sample.length} entries (target ${TARGET_SAMPLE}, min ${MIN_SAMPLE}, max ${MAX_SAMPLE})`);

  const regionalDistribution: Record<string, number> = {};
  for (const s of sample) regionalDistribution[s.region] = (regionalDistribution[s.region] || 0) + 1;

  const results: any[] = [];
  for (let i = 0; i < sample.length; i++) {
    const item = sample[i];
    const fetchedAt = new Date().toISOString();
    const urlHasPii = urlLikelyContainsPersonName(item.url!);
    try {
      const { status, html } = await fetchText(item.url!);
      const pageIdMatch = item.url!.match(/page_id=(\d+)/);
      const sourceRecordId = pageIdMatch ? pageIdMatch[1] : sha256(item.url!).slice(0, 16);
      results.push({
        institution_name: item.text,
        region_from_list: item.region,
        source_record_id: sourceRecordId,
        source_url: urlHasPii ? null : item.url,
        url_redacted_for_pii: urlHasPii,
        fetched_at: fetchedAt,
        http_status: status,
        source_content_sha256: sha256(html),
        parser_version: PARSER_VERSION,
        creation_order_raw: extractField(html, CREATION),
        opening_authorization_raw: extractField(html, OPENING),
        provisional_combined_raw: extractField(html, PROVISIONAL),
        status_change_raw: extractField(html, STATUS_CHANGE),
        region_field: extractField(html, REGION_FIELD),
        city_field: extractField(html, CITY_FIELD),
        pii_present_in_source: fieldPresent(html, PII_FIELDS) || urlHasPii,
        confessional_heuristic: CONFESSIONAL_KEYWORDS.test(item.text),
        name_length: item.text.length,
      });
    } catch (e) {
      results.push({ institution_name: item.text, region_from_list: item.region, source_url: urlHasPii ? null : item.url, url_redacted_for_pii: urlHasPii, fetched_at: fetchedAt, http_status: -1, error: String(e) });
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // --- Coverage ---
  const withCreation = results.filter((r) => r.creation_order_raw);
  const withOpening = results.filter((r) => r.opening_authorization_raw);
  const withProvisional = results.filter((r) => r.provisional_combined_raw);
  const withStatusChange = results.filter((r) => r.status_change_raw);
  const withAny = results.filter((r) => r.creation_order_raw || r.opening_authorization_raw || r.provisional_combined_raw || r.status_change_raw);
  const withNone = results.filter((r) => !r.creation_order_raw && !r.opening_authorization_raw && !r.provisional_combined_raw && !r.status_change_raw);
  const withMultiple = results.filter((r) => [r.creation_order_raw, r.opening_authorization_raw, r.provisional_combined_raw, r.status_change_raw].filter(Boolean).length > 1);

  // --- Uniqueness (creation_order as primary candidate identifier) ---
  function uniquenessStats(values: { institution_name: string; value: string }[]) {
    const byValue = new Map<string, string[]>();
    for (const v of values) {
      if (!byValue.has(v.value)) byValue.set(v.value, []);
      byValue.get(v.value)!.push(v.institution_name);
    }
    const total = values.length;
    const unique = byValue.size;
    const crossInstitutionCollisions = [...byValue.entries()]
      .filter(([, names]) => new Set(names).size > 1)
      .map(([value, names]) => ({ value, institutions: [...new Set(names)] }));
    const exactDuplicates = [...byValue.entries()].filter(([, names]) => names.length > 1).length;
    return { total, unique, exactDuplicates, crossInstitutionCollisions };
  }
  const creationUniqueness = uniquenessStats(withCreation.map((r) => ({ institution_name: r.institution_name, value: r.creation_order_raw })));
  const openingUniqueness = uniquenessStats(withOpening.map((r) => ({ institution_name: r.institution_name, value: r.opening_authorization_raw })));

  // --- Format families ---
  function formatFamilies(values: string[]) {
    const parsed = values.map(classifyFormat).filter(Boolean) as NonNullable<ReturnType<typeof classifyFormat>>[];
    const families = new Map<string, number>();
    for (const p of parsed) {
      const key = `prefix=${p.hasPrefix ? "yes" : "no"}|sep=${p.separator}|date_suffix=${p.hasDateSuffix ? "yes" : "no"}|segments=${p.segmentCount}`;
      families.set(key, (families.get(key) || 0) + 1);
    }
    return {
      total: parsed.length,
      families: [...families.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count),
      truncated: parsed.filter((p) => p.looksTruncated).length,
      malformed: parsed.filter((p) => p.looksMalformed).length,
    };
  }
  const creationFormats = formatFamilies(withCreation.map((r) => r.creation_order_raw));

  // --- Multi-ID fixtures (A-G) for regression tests, built from real sample data where possible ---
  const sameInstitutionMultipleActs = withMultiple.map((r) => ({
    institution_name: r.institution_name,
    creation_order_raw: r.creation_order_raw,
    opening_authorization_raw: r.opening_authorization_raw,
    same_value: r.creation_order_raw && r.opening_authorization_raw && r.creation_order_raw === r.opening_authorization_raw,
  }));

  const report = {
    sprint: "MINESUP-B.1",
    operator,
    generated_at: new Date().toISOString(),
    source: { url: IPES_URL, fetched_at: fetchedAtIndex, http_status: indexStatus, content_sha256: indexHash, parser_version: PARSER_VERSION },
    sampling: {
      sampling_method: "Stratification proportionnelle par région (plancher 3/région, plafond 20/région), échantillonnage à espacement uniforme déterministe DANS chaque région (pas début/milieu/fin uniquement) pour réduire le biais d'ordre chronologique de la source.",
      target_sample: TARGET_SAMPLE,
      min_sample: MIN_SAMPLE,
      max_sample: MAX_SAMPLE,
      actual_sample_size: sample.length,
      regional_distribution: regionalDistribution,
      regions_covered: Object.keys(regionalDistribution).length,
      confessional_institutions_in_sample: results.filter((r) => r.confessional_heuristic).length,
      name_length_range: { min: Math.min(...results.map((r) => r.name_length ?? 999)), max: Math.max(...results.map((r) => r.name_length ?? 0)) },
    },
    coverage: {
      sample_size: results.length,
      creation_order_coverage: withCreation.length,
      opening_authorization_coverage: withOpening.length,
      provisional_combined_coverage: withProvisional.length,
      status_change_coverage: withStatusChange.length,
      any_official_identifier_coverage: withAny.length,
      no_identifier_coverage: withNone.length,
      multiple_identifiers_coverage: withMultiple.length,
      creation_order_coverage_pct: Math.round((withCreation.length / results.length) * 1000) / 10,
      compares_to_minesup_b_20_sample_pct: 50,
    },
    uniqueness: {
      creation_order: creationUniqueness,
      opening_authorization: openingUniqueness,
      same_institution_multiple_acts: sameInstitutionMultipleActs,
    },
    format_analysis: { creation_order: creationFormats },
    entries: results,
  };

  mkdirSync("reports/registry", { recursive: true });
  writeFileSync("reports/registry/minesup-b1-identifier-analysis.json", JSON.stringify(report, null, 2), "utf-8");

  const csvHeaders = ["institution_name", "region_from_list", "source_record_id", "url_redacted_for_pii", "fetched_at", "http_status", "creation_order_raw", "opening_authorization_raw", "provisional_combined_raw", "status_change_raw", "region_field", "city_field", "pii_present_in_source", "confessional_heuristic"];
  const csvLines = [csvHeaders.join(",")];
  for (const r of results) csvLines.push(csvHeaders.map((h) => csvEscape(r[h])).join(","));
  writeFileSync("reports/registry/minesup-b1-identifier-sample.csv", csvLines.join("\n"), "utf-8");

  console.log("Reports written: reports/registry/minesup-b1-identifier-analysis.json + minesup-b1-identifier-sample.csv");
  console.log(JSON.stringify({ sampling: report.sampling, coverage: report.coverage, uniqueness: { creation_order: creationUniqueness, opening_authorization: openingUniqueness }, format_analysis: report.format_analysis }, null, 2));
}

main();
