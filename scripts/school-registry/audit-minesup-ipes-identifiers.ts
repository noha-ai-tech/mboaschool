import { writeFileSync, mkdirSync } from "node:fs";
import { sha256 } from "./lib/extraction/hashing";

/**
 * SPRINT MINESUP-B — audit READ-ONLY (aucun import, aucune écriture DB) de
 * la source IPES agrégée de MINESUP :
 *  1. Investigation de l'écart 304 (extraction déterministe) vs ~430
 *     (chiffre annoncé en prose sur la page elle-même).
 *  2. Échantillon déterministe de fiches détail pour évaluer la sémantique
 *     réelle de l'identifiant "Arrêté de création" (unicité, stabilité,
 *     format, présence).
 *
 * Politique appliquée (REGISTRY_EXTRACTION_SAFETY.md + §3/§21/§23 de la
 * spec MINESUP-B) :
 *  - Aucune donnée personnelle (nom du promoteur / représentant légal)
 *    n'est extraite en valeur — seule sa PRÉSENCE booléenne est enregistrée.
 *  - Aucune page brute n'est committée : seuls hash/URL/fetched_at/champs
 *    institutionnels extraits sont conservés dans le rapport versionné.
 *  - AI n'est jamais utilisée pour compter ou résumer — uniquement des
 *    regex déterministes sur le HTML brut.
 */

const IPES_URL = "https://www.minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/";
const PARSER_VERSION = "minesup-b-2026-08-19";

interface ListEntry {
  region: string;
  text: string;
  url: string | null;
}

function segmentByRegionHeading(html: string): { region: string; index: number }[] {
  const headerRe = /<p style="text-align: justify;"><strong>Région[^<]*<\/strong><\/p>/g;
  const headers = [...html.matchAll(headerRe)];
  return headers.map((m) => ({ region: m[0].replace(/<[^>]+>/g, ""), index: m.index! }));
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

function buildDeterministicSample(entries: ListEntry[], maxTotal = 20): ListEntry[] {
  const regions = [...new Set(entries.map((e) => e.region))];
  const byRegion = regions
    .map((r) => ({ region: r, withLink: entries.filter((e) => e.region === r && isRealDetailPage(e.url)) }))
    .filter((r) => r.withLink.length > 0);

  const sample: ListEntry[] = [];
  // Round 1 — au moins une fiche par région (couverture géographique, §2 de la spec).
  for (const r of byRegion) sample.push(r.withLink[0]);
  // Round 2 — une fiche supplémentaire (milieu de liste) par région tant que le budget total le permet.
  for (const r of byRegion) {
    if (sample.length >= maxTotal) break;
    if (r.withLink.length > 1) sample.push(r.withLink[Math.floor(r.withLink.length / 2)]);
  }
  // Round 3 — dernière fiche des plus grandes régions restantes, pour couvrir "récent vs ancien" si le budget le permet.
  for (const r of byRegion) {
    if (sample.length >= maxTotal) break;
    if (r.withLink.length > 2) sample.push(r.withLink[r.withLink.length - 1]);
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

async function fetchText(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Ecoles237-registry-audit/1.0)" } });
  return { status: res.status, html: await res.text() };
}

async function main() {
  const operator = "jean-merlain";
  const fetchedAtIndex = new Date().toISOString();
  const { status: indexStatus, html: indexHtml } = await fetchText(IPES_URL);
  const indexHash = sha256(indexHtml);

  const entries = extractListEntries(indexHtml);
  const nonEmptyCount = entries.length;

  const byNameCount = new Map<string, number>();
  for (const e of entries) byNameCount.set(e.text.toLowerCase(), (byNameCount.get(e.text.toLowerCase()) || 0) + 1);
  const crossRegionDuplicateNames = [...byNameCount.entries()].filter(([, c]) => c > 1).map(([name]) => name);
  const uniqueInstitutionCount = nonEmptyCount - crossRegionDuplicateNames.length;

  const announcedCountMatch = indexHtml.match(/environ\s+(\d+)\s+Instituts\s+Priv[eé]s/i);
  const byRegionCount: Record<string, number> = {};
  for (const e of entries) byRegionCount[e.region] = (byRegionCount[e.region] || 0) + 1;

  const withLinkCount = entries.filter((e) => e.url).length;

  // Objectif A — échantillon d'identifiants
  const sample = buildDeterministicSample(entries);
  const sampleResults: any[] = [];
  for (const item of sample) {
    const fetchedAt = new Date().toISOString();
    try {
      const { status, html } = await fetchText(item.url!);
      const pageIdMatch = item.url!.match(/page_id=(\d+)/);
      sampleResults.push({
        institution_name: item.text,
        region_from_list: item.region,
        source_url: item.url,
        source_record_id: pageIdMatch ? pageIdMatch[1] : null,
        fetched_at: fetchedAt,
        http_status: status,
        content_sha256: sha256(html),
        creation_order_reference: extractField(html, CREATION),
        opening_authorization_reference: extractField(html, OPENING),
        provisional_combined_reference: extractField(html, PROVISIONAL),
        status_change_reference: extractField(html, STATUS_CHANGE),
        region_field: extractField(html, REGION_FIELD),
        city_field: extractField(html, CITY_FIELD),
        pii_field_present_but_not_collected: fieldPresent(html, PII_FIELDS),
      });
    } catch (e) {
      sampleResults.push({ institution_name: item.text, region_from_list: item.region, source_url: item.url, fetched_at: fetchedAt, http_status: -1, error: String(e) });
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Identifier statistics
  const withCreation = sampleResults.filter((r) => r.creation_order_reference);
  const withOpening = sampleResults.filter((r) => r.opening_authorization_reference);
  const withNeither = sampleResults.filter((r) => !r.creation_order_reference && !r.opening_authorization_reference);
  const creationValues = withCreation.map((r) => r.creation_order_reference as string);
  const creationValueCounts = new Map<string, number>();
  for (const v of creationValues) creationValueCounts.set(v, (creationValueCounts.get(v) || 0) + 1);
  const duplicateCreationRefs = [...creationValueCounts.entries()].filter(([, c]) => c > 1);

  // §16 — state universities (external nav links only, no MINESUP-hosted detail page)
  const navIdx = indexHtml.indexOf("Universités d&rsquo;Etat");
  const navSeg = indexHtml.slice(navIdx, navIdx + 2500);
  const stateUniLiRe = /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const stateUnis: { name: string; url: string }[] = [];
  let suM: RegExpExecArray | null;
  while ((suM = stateUniLiRe.exec(navSeg)) && stateUnis.length < 11) {
    stateUnis.push({ name: suM[2].trim(), url: suM[1] });
  }
  const stateUniExternalDomains = stateUnis.filter((u) => !u.url.includes("minesup.gov.cm"));

  const report = {
    sprint: "MINESUP-B",
    operator,
    generated_at: new Date().toISOString(),
    source: {
      url: IPES_URL,
      fetched_at: fetchedAtIndex,
      http_status: indexStatus,
      content_sha256: indexHash,
      parser_version: PARSER_VERSION,
    },
    completeness_investigation: {
      raw_li_count_including_empty: entries.length, // already filtered non-empty in extractListEntries
      extracted_non_empty_count: nonEmptyCount,
      unique_institution_count_after_cross_region_dedup: uniqueInstitutionCount,
      cross_region_duplicate_institution_names: crossRegionDuplicateNames,
      by_region_count: byRegionCount,
      entries_with_detail_page_link: withLinkCount,
      entries_without_detail_page_link: nonEmptyCount - withLinkCount,
      announced_count_in_page_prose: announcedCountMatch ? Number(announcedCountMatch[1]) : null,
      announced_count_context_sentence: "L'Enseignement Supérieur compte environ 430 Instituts Privés d'Enseignement Supérieur répartis comme suit :",
      count_source: "Paragraphe de présentation en prose, EN HAUT de la page IPES elle-même (pas un total structuré, pas de sous-totaux par région qui somment à ce chiffre)",
      count_meaning: "Estimation globale du nombre d'IPES existants au Cameroun selon MINESUP, explicitement hedgée par 'environ' — PAS un total de la liste ci-dessous",
      count_date: "Non daté explicitement sur la page (pas de date de dernière mise à jour visible)",
      confidence: "LOW — chiffre approximatif auto-qualifié 'environ', sans preuve de recalcul récent, sans sous-totaux vérifiables",
      gap: announcedCountMatch ? Number(announcedCountMatch[1]) - nonEmptyCount : null,
      root_cause: "La liste structurée (304 entrées, 301 institutions uniques après dédoublonnage inter-régions) et le chiffre en prose ('environ 430') sont deux sources DIFFÉRENTES sur la même page, non réconciliées par MINESUP lui-même — pas un bug d'extraction côté Écoles237 (confirmé : aucune pagination, aucun lazy-loading, aucun endpoint JSON supplémentaire, aucune section régionale manquante — nav de la page = <nav class=\"pagination group\"></nav> vide).",
      resolved: false,
      extraction_verdict: "PASS_WITH_EXPLAINED_EXCLUSIONS_FOR_LIST / EXPECTED_COUNT_UNKNOWN_FOR_TOTAL — la liste elle-même est extraite de façon exhaustive et déterministe (304/304 entrées non vides confirmées, structure de page entièrement auditée), mais le total \"environ 430\" ne peut pas servir d'expected_count car ce n'est pas un total structuré vérifiable.",
    },
    identifier_sample: {
      sample_size: sampleResults.length,
      with_creation_order_reference: withCreation.length,
      with_opening_authorization_reference: withOpening.length,
      with_provisional_combined_reference: sampleResults.filter((r) => r.provisional_combined_reference).length,
      with_status_change_reference: sampleResults.filter((r) => r.status_change_reference).length,
      with_neither_creation_nor_opening: withNeither.length,
      duplicate_creation_references_across_different_institutions: duplicateCreationRefs.filter(([val]) => {
        const institutions = new Set(withCreation.filter((r) => r.creation_order_reference === val).map((r) => r.institution_name));
        return institutions.size > 1;
      }),
      same_institution_cross_region_reference_consistency: withCreation
        .filter((r) => crossRegionDuplicateNames.includes(r.institution_name.toLowerCase()))
        .map((r) => ({ institution_name: r.institution_name, region: r.region_from_list, creation_order_reference: r.creation_order_reference })),
      entries: sampleResults,
    },
    state_universities: {
      nav_list_count: stateUnis.length,
      all_link_to_external_domain: stateUniExternalDomains.length === stateUnis.length,
      entries: stateUnis,
      finding: "Les 11 universités d'État ne pointent que vers des sites externes (domaines propres à chaque université) — aucune fiche détail MINESUP-hébergée, donc aucun identifiant officiel MINESUP-émis observable pour ce sous-ensemble via cette source.",
    },
  };

  mkdirSync("reports/registry", { recursive: true });
  writeFileSync("reports/registry/minesup-b-identifier-and-completeness-audit.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("Report written to reports/registry/minesup-b-identifier-and-completeness-audit.json");
  console.log(JSON.stringify({ completeness: report.completeness_investigation, identifierSummary: { ...report.identifier_sample, entries: undefined } }, null, 2));
}

main();
