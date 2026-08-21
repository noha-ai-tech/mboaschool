import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256Bytes } from "./lib/extraction/hashing";

/**
 * SPRINT MINSANTE-I.1 §3 + §6 — Investigation forensique READ-ONLY du PDF
 * source pour les 2 filières en quarantaine (Imagerie Médicale, Sciences
 * Pharmaceutiques). AUCUNE écriture DB. Ne modifie ni A.1 ni A.2.
 *
 * Objectif : produire des preuves de bas niveau (opérateurs de contenu,
 * arbre de structure, annotations, polices) permettant de déterminer si :
 *  (a) les numéros d'Imagerie Médicale sont réellement ABSENTS du flux de
 *      contenu peint, ou seulement encodés autrement que du texte ;
 *  (b) le glyphe corrompu de Sciences Pharmaceutiques ("EXTRME NORD") est
 *      un défaut de mapping cosmétique ou une perte structurelle réelle.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

const SOURCE_PDF_URL =
  "https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm";
const EXPECTED_PDF_SHA256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

const FILIERE_RE = /^FILIERE\s*:\s*(.+)$/i;

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log("=== MINSANTE-I.1 FORENSICS (READ-ONLY) ===\n");

  // ── 1. Baseline DB (avant) ────────────────────────────────────────────
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";
  console.log(`Project ref : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);
  if (projectRef !== "umcwwynrftidytxgqkwi") throw new Error("PROJET INATTENDU — STOP (sécurité).");

  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline AVANT : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Récupération + pinning source ──────────────────────────────────
  console.log(`\nRécupération PDF source...`);
  const resp = await fetch(SOURCE_PDF_URL);
  if (!resp.ok) throw new Error(`Échec récupération PDF source : HTTP ${resp.status}`);
  const pdfBytes = new Uint8Array(await resp.arrayBuffer());
  const actualSha256 = sha256Bytes(pdfBytes);
  const sourceUnchanged = actualSha256 === EXPECTED_PDF_SHA256;
  console.log(`SHA256 attendu  : ${EXPECTED_PDF_SHA256}`);
  console.log(`SHA256 recalculé: ${actualSha256}`);
  console.log(sourceUnchanged ? "SOURCE STABLE." : "SOURCE_CHANGED — ARRÊT.");
  if (!sourceUnchanged) {
    throw new Error("SOURCE_CHANGED — investigation forensique annulée par sécurité (recovery source-versionné interdit sur SHA mismatch).");
  }

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: pdfBytes, disableFontFace: true, useSystemFonts: false }).promise;
  console.log(`Pages : ${doc.numPages}`);

  // ── 3. Localiser les sections FILIERE (pages + bornes d'items) ────────
  interface PageDump {
    page: number;
    items: { x: number; y: number; str: string; fontName: string; height: number; width: number }[];
    styles: Record<string, any>;
  }
  const pageDumps: PageDump[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .filter((it) => typeof it.str === "string")
      .map((it) => ({
        x: Math.round(it.transform[4] * 100) / 100,
        y: Math.round(it.transform[5] * 100) / 100,
        str: it.str as string,
        fontName: it.fontName as string,
        height: it.height,
        width: it.width,
      }));
    pageDumps.push({ page: pageNum, items, styles: content.styles });
  }

  // ── 3bis. Index PLAT (comme allItems dans pdfMinsanteA2.ts) — c'est le
  // SEUL découpage fiable : deux filières peuvent partager une même page
  // (ex. IMAGERIE se termine et INFIRMIERS commence toutes deux sur la
  // page 4). Un découpage par PAGE mélangerait les lignes numérotées
  // d'INFIRMIERS avec la fin d'IMAGERIE — bug piégé et corrigé pendant
  // cette investigation (voir minsante-i1-imagerie-analysis.json "caveat").
  interface FlatItem {
    globalIdx: number;
    page: number;
    x: number;
    y: number;
    str: string;
    fontName: string;
  }
  const allItemsFlat: FlatItem[] = [];
  for (const pd of pageDumps) {
    for (const it of pd.items) {
      allItemsFlat.push({ globalIdx: allItemsFlat.length, page: pd.page, x: it.x, y: it.y, str: it.str, fontName: it.fontName });
    }
  }

  const filiereStarts: { globalIdx: number; page: number; label: string }[] = [];
  allItemsFlat.forEach((it) => {
    const m = it.str.trim().match(FILIERE_RE);
    if (m) filiereStarts.push({ globalIdx: it.globalIdx, page: it.page, label: m[1].trim() });
  });
  console.log(`\nFilières trouvées (${filiereStarts.length}) :`);
  for (const f of filiereStarts) console.log(`  - page ${f.page} (item#${f.globalIdx}): "${f.label}"`);

  function findSectionExact(labelSubstr: string): { startIdxExclusive: number; endIdxExclusive: number; startPage: number; endPage: number } {
    const idx = filiereStarts.findIndex((f) => f.label.toUpperCase().includes(labelSubstr));
    if (idx === -1) throw new Error(`Filière "${labelSubstr}" introuvable.`);
    const start = filiereStarts[idx];
    const next = filiereStarts[idx + 1];
    const startIdxExclusive = start.globalIdx + 1;
    const endIdxExclusive = next ? next.globalIdx : allItemsFlat.length;
    const sliceItems = allItemsFlat.slice(startIdxExclusive, endIdxExclusive);
    const pages = Array.from(new Set(sliceItems.map((i) => i.page)));
    return { startIdxExclusive, endIdxExclusive, startPage: Math.min(...pages), endPage: Math.max(...pages) };
  }

  const imagerieSectionExact = findSectionExact("IMAGERIE");
  const pharmaSectionExact = findSectionExact("SCIENCES PHARMACEUTIQUES");
  const kineSectionExact = findSectionExact("KINESITHERAPIE"); // contrôle : SAFE, numéros peints

  const imagerieItemsExact = allItemsFlat.slice(imagerieSectionExact.startIdxExclusive, imagerieSectionExact.endIdxExclusive);
  const pharmaItemsExact = allItemsFlat.slice(pharmaSectionExact.startIdxExclusive, pharmaSectionExact.endIdxExclusive);
  const kineItemsExact = allItemsFlat.slice(kineSectionExact.startIdxExclusive, kineSectionExact.endIdxExclusive);

  console.log(`\nImagerie Médicale (EXACT, ${imagerieItemsExact.length} items) : pages ${imagerieSectionExact.startPage}..${imagerieSectionExact.endPage}`);
  console.log(`Sciences Pharmaceutiques (EXACT, ${pharmaItemsExact.length} items) : pages ${pharmaSectionExact.startPage}..${pharmaSectionExact.endPage}`);
  console.log(`Kinésithérapie (contrôle, EXACT, ${kineItemsExact.length} items) : pages ${kineSectionExact.startPage}..${kineSectionExact.endPage}`);

  // Opérateurs restent dumpés par PAGE ENTIÈRE (granularité pdf.js), mais on
  // marque explicitement quelles pages sont PARTAGÉES entre deux filières.
  const imagerieSection = { startPage: imagerieSectionExact.startPage, endPageExclusive: imagerieSectionExact.endPage + 1 };
  const pharmaSection = { startPage: pharmaSectionExact.startPage, endPageExclusive: pharmaSectionExact.endPage + 1 };
  const kineSection = { startPage: kineSectionExact.startPage, endPageExclusive: kineSectionExact.endPage + 1 };

  // ── 4. Dump opérateurs de contenu par page (comptage par type d'op) ───
  const OPS = pdfjsLib.OPS as Record<string, number>;
  const OP_NAME_BY_CODE: Record<number, string> = {};
  for (const [name, code] of Object.entries(OPS)) OP_NAME_BY_CODE[code] = name;

  async function dumpPageOperators(pageNum: number) {
    const page = await doc.getPage(pageNum);
    const opList = await page.getOperatorList();
    const counts: Record<string, number> = {};
    for (const fn of opList.fnArray) {
      const name = OP_NAME_BY_CODE[fn] ?? `UNKNOWN_${fn}`;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    let annotations: any[] = [];
    try {
      annotations = (await page.getAnnotations()).map((a: any) => ({ subtype: a.subtype, rect: a.rect, contents: a.contents }));
    } catch (e) {
      annotations = [{ error: String(e) }];
    }
    let structTree: any = null;
    try {
      structTree = await (page as any).getStructTree?.();
    } catch (e) {
      structTree = { error: String(e) };
    }
    const viewport = page.getViewport({ scale: 1 });
    return { pageNum, opCounts: counts, totalOps: opList.fnArray.length, annotations, structTree, viewport: { width: viewport.width, height: viewport.height } };
  }

  console.log("\n=== OPÉRATEURS PAR PAGE ===");
  const imagerieOpDumps = [];
  for (let p = imagerieSection.startPage; p <= imagerieSection.endPageExclusive - 1 && p <= doc.numPages; p++) {
    const d = await dumpPageOperators(p);
    imagerieOpDumps.push(d);
    console.log(`Page ${p} (Imagerie) : totalOps=${d.totalOps}, showText=${d.opCounts.showText ?? 0}, beginText=${d.opCounts.beginText ?? 0}, endText=${d.opCounts.endText ?? 0}, paintImageXObject=${d.opCounts.paintImageXObject ?? 0}, paintFormXObjectBegin=${d.opCounts.paintFormXObjectBegin ?? 0}, constructPath=${d.opCounts.constructPath ?? 0}, fill=${d.opCounts.fill ?? 0}, stroke=${d.opCounts.stroke ?? 0}, annotations=${d.annotations.length}`);
  }
  const pharmaOpDumps = [];
  for (let p = pharmaSection.startPage; p <= pharmaSection.endPageExclusive - 1 && p <= doc.numPages; p++) {
    const d = await dumpPageOperators(p);
    pharmaOpDumps.push(d);
    console.log(`Page ${p} (Pharma) : totalOps=${d.totalOps}, showText=${d.opCounts.showText ?? 0}, beginText=${d.opCounts.beginText ?? 0}, endText=${d.opCounts.endText ?? 0}, paintImageXObject=${d.opCounts.paintImageXObject ?? 0}, paintFormXObjectBegin=${d.opCounts.paintFormXObjectBegin ?? 0}, constructPath=${d.opCounts.constructPath ?? 0}, fill=${d.opCounts.fill ?? 0}, stroke=${d.opCounts.stroke ?? 0}, annotations=${d.annotations.length}`);
  }
  const kineOpDumps = [];
  for (let p = kineSection.startPage; p <= kineSection.endPageExclusive - 1 && p <= doc.numPages; p++) {
    const d = await dumpPageOperators(p);
    kineOpDumps.push(d);
    console.log(`Page ${p} (Kiné, contrôle SAFE) : totalOps=${d.totalOps}, showText=${d.opCounts.showText ?? 0}, beginText=${d.opCounts.beginText ?? 0}, endText=${d.opCounts.endText ?? 0}, paintImageXObject=${d.opCounts.paintImageXObject ?? 0}, paintFormXObjectBegin=${d.opCounts.paintFormXObjectBegin ?? 0}, constructPath=${d.opCounts.constructPath ?? 0}, fill=${d.opCounts.fill ?? 0}, stroke=${d.opCounts.stroke ?? 0}, annotations=${d.annotations.length}`);
  }

  // ── 5. Items texte bruts des 3 sections, DÉCOUPAGE EXACT (§3bis) ──────
  const imagerieItems = imagerieItemsExact;
  const pharmaItems = pharmaItemsExact;
  const kineItems = kineItemsExact;

  // Recherche de tout token purement numérique n'importe où dans la section Imagerie (au cas où un numéro serait peint ailleurs que dans la colonne attendue).
  const anyDigitTokensImagerie = imagerieItems.filter((it) => /\d/.test(it.str));
  console.log(`\nImagerie — items contenant un chiffre (n'importe où dans la section EXACTE) : ${anyDigitTokensImagerie.length}`);
  for (const it of anyDigitTokensImagerie.slice(0, 60)) console.log(`   page ${it.page} x=${it.x} y=${it.y} "${it.str}"`);

  // ── 6. Isoler le glyphe corrompu Sciences Pharmaceutiques ─────────────
  const corruptedCandidates = pharmaItems.filter((it) => /EXTR[^A-ZÀ-Ü]*NORD|EXTREME|EST\b/i.test(it.str));
  console.log(`\nPharma — candidats glyphe région corrompu/Est (${corruptedCandidates.length}) :`);
  for (const it of corruptedCandidates) console.log(`   page ${it.page} x=${it.x} y=${it.y} font=${it.fontName} "${it.str}"`);

  // Contexte : toutes les étiquettes région (x <= 120) de la section pharma EXACTE, dans l'ordre du flux.
  const labelLikeItems = pharmaItems.filter((it) => it.x <= 120 && it.str.trim() !== "");
  console.log(`\nPharma — tous les items colonne étiquette (x<=120), dans l'ordre du flux EXACT (${labelLikeItems.length}) :`);
  for (const it of labelLikeItems) console.log(`   page ${it.page} x=${it.x} y=${it.y} font=${it.fontName} globalIdx=${it.globalIdx} "${it.str}"`);

  // Voisinage immédiat (5 items avant/après) de chaque candidat corrompu, en index global — preuve de contexte brut.
  const corruptedNeighborhoods = corruptedCandidates.map((c) => ({
    target: c,
    before: allItemsFlat.slice(Math.max(0, c.globalIdx - 5), c.globalIdx),
    after: allItemsFlat.slice(c.globalIdx + 1, c.globalIdx + 6),
  }));

  // Font styles pertinents (pharma + imagerie + kiné, pour comparaison).
  const relevantFontNames = new Set<string>([...pharmaItems.map((i) => i.fontName), ...imagerieItems.map((i) => i.fontName), ...kineItems.map((i) => i.fontName)]);
  const fontStylesDump: Record<string, any> = {};
  for (const pd of pageDumps) {
    for (const [fname, style] of Object.entries(pd.styles ?? {})) {
      if (relevantFontNames.has(fname)) fontStylesDump[fname] = style;
    }
  }

  // ── 7. Rendu canvas (si disponible) pour capter les warnings pdf.js bas niveau ──
  let canvasWarnings: string[] = [];
  let canvasRenderAttempted = false;
  let canvasRenderError: string | null = null;
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    canvasRenderAttempted = true;
    const originalWarn = console.warn;
    const originalError = console.error;
    const captured: string[] = [];
    console.warn = (...args: any[]) => {
      captured.push(args.map(String).join(" "));
      originalWarn(...args);
    };
    console.error = (...args: any[]) => {
      captured.push(args.map(String).join(" "));
      originalError(...args);
    };
    try {
      for (const p of [pharmaSection.startPage, pharmaSection.endPageExclusive - 1, imagerieSection.startPage]) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx as any, viewport }).promise;
      }
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }
    canvasWarnings = captured;
  } catch (e) {
    canvasRenderError = String(e);
  }
  console.log(`\nRendu canvas tenté=${canvasRenderAttempted}, warnings capturés=${canvasWarnings.length}, erreur=${canvasRenderError}`);
  for (const w of canvasWarnings.slice(0, 30)) console.log(`   [canvas-warn] ${w}`);

  // ── 8. Écriture des artefacts bruts (JSON forensique complet) ─────────
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(
    join(reportsDir, "minsante-i1-forensics-raw.json"),
    JSON.stringify(
      {
        sprint: "MINSANTE-I.1",
        generated_at: runStartedAt,
        source: { sha256: actualSha256, source_status: sourceUnchanged ? "SOURCE_STABLE" : "SOURCE_CHANGED", pdf_byte_length: pdfBytes.length },
        filiere_starts: filiereStarts,
        imagerie: {
          section_exact: imagerieSectionExact,
          op_dumps: imagerieOpDumps,
          items: imagerieItems,
          any_digit_tokens: anyDigitTokensImagerie,
          caveat: "Le découpage est EXACT par index d'item global (borne = item 'FILIERE : ...' suivant), PAS par page entière — la page 4 est partagée avec INFIRMIERS qui commence en milieu de page 4 et contient de nombreuses lignes numérotées ; un découpage par page aurait attribué ces numéros à tort à Imagerie Médicale.",
        },
        pharma: {
          section_exact: pharmaSectionExact,
          op_dumps: pharmaOpDumps,
          items: pharmaItems,
          corrupted_candidates: corruptedCandidates,
          corrupted_neighborhoods: corruptedNeighborhoods,
          label_items_ordered: labelLikeItems,
        },
        kine_control: { section_exact: kineSectionExact, op_dumps: kineOpDumps, items_sample: kineItems.slice(0, 20) },
        font_styles: fontStylesDump,
        canvas_render: { attempted: canvasRenderAttempted, error: canvasRenderError, warnings: canvasWarnings },
      },
      null,
      2
    ),
    "utf-8"
  );

  // ── 9. Baseline DB (après) — doit être strictement identique ──────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const dbUnchanged = estBefore === estAfter && stagingBefore === stagingAfter && registryBefore === registryAfter;
  console.log(`\nBaseline APRÈS : establishments=${estAfter}, staging=${stagingAfter}, registry_identifiers=${registryAfter} — inchangé: ${dbUnchanged}`);
  writeFileSync(
    join(reportsDir, "minsante-i1-db-baseline.json"),
    JSON.stringify(
      {
        sprint: "MINSANTE-I.1",
        generated_at: runStartedAt,
        establishments_before: estBefore,
        establishments_after: estAfter,
        staging_before: stagingBefore,
        staging_after: stagingAfter,
        registry_identifiers_before: registryBefore,
        registry_identifiers_after: registryAfter,
        unchanged: dbUnchanged,
        production_writes: 0,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\n=== FIN INVESTIGATION FORENSIQUE (READ-ONLY) ===");
}

main().catch((e) => {
  console.error("ERROR:", e.stack ?? e);
  process.exit(1);
});
