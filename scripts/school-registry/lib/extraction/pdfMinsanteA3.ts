/**
 * SPRINT MINSANTE-I.1 §6-9 — Successeur EXPLICITEMENT VERSIONNÉ de
 * `minsante-a2-pdf-coordinates@1` (voir pdfMinsanteA2.ts, INCHANGÉ par ce
 * fichier — aucun import de ses fonctions internes non exportées, tout est
 * dupliqué volontairement ici pour garantir qu'A.2 reste reproductible tel
 * quel, au prix d'une duplication contrôlée plutôt que d'un couplage qui
 * risquerait de modifier A.2 même indirectement).
 *
 * SEUL AJOUT PAR RAPPORT À A.2 : la récupération d'UNE étiquette de région
 * corrompue dans le flux de contenu du PDF source (glyphe manquant), quand
 * elle peut être déterminée de façon DÉTERMINISTE par corroboration
 * STRUCTURELLE — jamais par une comparaison sémantique de chaîne de
 * caractères (voir MINSANTE_IMPORT_CONTRACT.md §I.1 pour l'investigation
 * complète).
 *
 * RÈGLE GÉNÉRIQUE `CORRUPTED_REGION_LABEL_RECOVERED_BY_STRUCTURE` :
 * un item de la colonne étiquette est considéré comme une région
 * RÉCUPÉRABLE si, et seulement si, TOUTES les conditions suivantes sont
 * réunies :
 *
 *   1. SOURCE VERSIONNÉE — le SHA256 du PDF effectivement chargé correspond
 *      exactement au SHA256 attendu pour ce document (passé explicitement
 *      par l'appelant via `sourceSha256Verified`). Sur toute autre valeur
 *      de SHA256 (source changée), la récupération est ENTIÈREMENT
 *      désactivée — fail-closed, comportement identique à A.2 (quarantaine).
 *
 *   2. INVARIANT DOCUMENT-WIDE AUTO-VALIDÉ — l'ordre alphabétique canonique
 *      des régions (REGION_CANONICAL_LIST) doit être observé SANS AUCUNE
 *      EXCEPTION dans TOUTES LES AUTRES sections filière du MÊME document
 *      analysé dans CETTE exécution (jamais une hypothèse câblée en dur :
 *      l'invariant est recalculé à chaque exécution à partir des données
 *      réellement observées). Si une seule inversion est observée ailleurs
 *      dans le document, la récupération est désactivée pour tout le
 *      document (fail-closed).
 *
 *   3. POSITION — l'étiquette non reconnue se situe, dans l'ordre du flux,
 *      strictement entre deux étiquettes RECONNUES R_prev et R_next de la
 *      MÊME section filière, et il existe EXACTEMENT UNE région candidate
 *      R_mid dans REGION_CANONICAL_LIST strictement comprise entre R_prev
 *      et R_next. (S'il y a 0 ou ≥2 candidats, pas de récupération —
 *      ambiguïté non résolue.)
 *
 *   4. CONFIRMATION INDÉPENDANTE PAR LA NUMÉROTATION — la toute première
 *      ligne numérotée qui suit l'étiquette corrompue (n'importe quelle
 *      colonne) doit redémarrer exactement à "1.". C'est un signal
 *      TOTALEMENT INDÉPENDANT du texte de l'étiquette elle-même : si la
 *      numérotation ne redémarre pas à 1, l'étiquette corrompue n'introduit
 *      probablement pas une VRAIE nouvelle région (pas de récupération).
 *
 *   5. RÉSIDU TEXTUEL COHÉRENT (garde-fou secondaire, jamais la base
 *      principale de la décision) — le texte brut de l'étiquette corrompue,
 *      une fois débarrassé des accents/espaces/tirets, doit partager une
 *      portion significative de caractères avec le nom de la région
 *      candidate R_mid (seuil generique, pas une comparaison à une chaîne
 *      câblée en dur du type "EXTRME NORD"). Si ce garde-fou échoue, pas de
 *      récupération, même si 1-4 sont réunies.
 *
 * Si UNE SEULE de ces 5 conditions échoue, la ligne reste dans
 * `unknownLabels` exactement comme dans A.2, et la section reste
 * QUARANTINED_STRUCTURE_AMBIGUOUS — AUCUNE dégradation de sûreté par
 * rapport à A.2 n'est possible : ce module ne peut que RETIRER des
 * anomalies déjà présentes dans A.2, jamais en introduire de nouvelles, ni
 * changer un verdict SAFE existant (voir tests K/L/M/N).
 */

import { OFFICIAL_PROGRAMS, PARSER_VERSION as A1_PARSER_VERSION } from "./pdfMinsanteA1";
import { PARSER_VERSION as A2_PARSER_VERSION } from "./pdfMinsanteA2";
import type { CoordTextItem, SchoolProgramRowA2, FiliereSectionResultA2, MinsanteA2ParseResult, FiliereVerdict, NumberingMode, RegionBlockResult, RegionRowStatus, ExtractionEvidence } from "./pdfMinsanteA2";

export const PARSER_VERSION = "minsante-a3-pdf-recovery@1";
export const PREVIOUS_PARSER_VERSION = A2_PARSER_VERSION;
export const LEGACY_PARSER_VERSION = A1_PARSER_VERSION;

export const REGION_CANONICAL_LIST = [
  "Adamaoua",
  "Centre",
  "Est",
  "Extrême-Nord",
  "Littoral",
  "Nord",
  "Nord-Ouest",
  "Ouest",
  "Sud",
  "Sud-Ouest",
] as const;

const REGION_TOKENS: Record<string, string> = {
  adamaoua: "Adamaoua",
  centre: "Centre",
  est: "Est",
  extremenord: "Extrême-Nord",
  littoral: "Littoral",
  nord: "Nord",
  nordouest: "Nord-Ouest",
  ouest: "Ouest",
  sud: "Sud",
  sudouest: "Sud-Ouest",
};

function regionKeyFromToken(raw: string): string | null {
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return REGION_TOKENS[key] ?? null;
}

function stripAccentsUpper(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeFiliereKey(raw: string): string {
  return stripAccentsUpper(raw).replace(/\s+/g, " ").trim();
}

/** Débarrasse une chaîne de tout ce qui n'est pas une lettre A-Z (accents/espaces/tirets retirés) — pour le garde-fou §5 de similarité résiduelle, générique, pas une comparaison à une chaîne câblée en dur. */
function lettersOnly(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Ratio de recouvrement MULTI-ENSEMBLE (sac de lettres, avec multiplicité)
 * entre `raw` et `candidate`, rapporté à la longueur de `candidate` —
 * générique, INDÉPENDANT DE L'ORDRE des caractères (un glyphe corrompu peut
 * décaler l'alignement d'un appariement séquentiel strict, ex. la perte
 * d'un "E" au milieu de "EXTREME" fait échouer un appariement glouton
 * gauche-à-droite alors que le recouvrement réel de lettres reste élevé).
 * Volontairement PAS une égalité de chaîne, PAS un cas particulier câblé en
 * dur pour un mot précis — s'applique à N'IMPORTE QUELLE paire de chaînes.
 */
function subsequenceOverlapRatio(raw: string, candidate: string): number {
  const a = lettersOnly(raw);
  const b = lettersOnly(candidate);
  if (b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let matched = 0;
  for (const ch of b) {
    const remaining = counts.get(ch) ?? 0;
    if (remaining > 0) {
      matched++;
      counts.set(ch, remaining - 1);
    }
  }
  return matched / b.length;
}

export {
  regionKeyFromToken as regionKeyFromTokenA3,
  subsequenceOverlapRatio,
};

export interface CorruptedLabelRecoveryEvidence {
  method: "CORRUPTED_REGION_LABEL_RECOVERED_BY_STRUCTURE";
  rawLabelText: string;
  page: number;
  x: number;
  y: number;
  prevRegion: string;
  nextRegion: string;
  recoveredRegion: string;
  candidateCount: number;
  firstRowNumberAfterLabel: number;
  residualOverlapRatio: number;
}

const ROW_GAP_THRESHOLD = 13.0;
const SAME_LINE_Y_EPSILON = 0.6;
const LABEL_COLUMN_MAX_X = 120;
const BASE_X_EPSILON = 1.0;
const RESIDUAL_OVERLAP_MIN_RATIO = 0.75; // §5 garde-fou — seuil générique, appliqué à N'IMPORTE QUELLE paire (label brut, région candidate), jamais spécifique à une chaîne.

const PAGE_MARKER_RE = /Page\s*(\d+)\s*sur\s*(\d+)/i;
const FILIERE_RE = /^FILIERE\s*:\s*(.+)$/i;
const NUMBER_ROW_RE = /^(\d{1,3})\.\s*(.*)$/;

const LETTERHEAD_Y_MIN = 763;
const LETTERHEAD_Y_MAX = 816;

function isBoilerplate(str: string, y?: number): boolean {
  if (y !== undefined && y >= LETTERHEAD_Y_MIN && y <= LETTERHEAD_Y_MAX) return true;
  return false;
}

const HEADER_ROW_RE = /^(REGIONS(\s+ECOLES)?|ECOLES)$/i;
const LETTERHEAD_RE =
  /^(REPUBLIQUE\s+DU\s+CAMEROUN|REPUBLIC\s+OF\s+CAMEROON|Paix\s*[–\-]\s*Travail\s*[–\-]\s*Patrie|Peace\s*[–\-]\s*Work\s*[–\-]\s*Fatherland|MINISTERE\s+DE\s+LA\s+SANTE(\s+PUBLIQUE)?|MINISTRY\s+OF\s+PUBLIC\s+HEALTH)$/i;
const TITLE_RE = /^(LISTE DES ECOLES|AGREES DU MINSANTE|NELS MEDICO|AGREES|ANNEE 2025)/i;
const DIVIDER_ONLY_RE = /^[=\-\s]+$/;

function isNoiseLine(str: string): boolean {
  const t = str.trim();
  if (t === "") return true;
  if (PAGE_MARKER_RE.test(t)) return true;
  if (HEADER_ROW_RE.test(t)) return true;
  if (LETTERHEAD_RE.test(t)) return true;
  if (TITLE_RE.test(t)) return true;
  if (DIVIDER_ONLY_RE.test(t)) return true;
  return false;
}

interface MergedLine {
  page: number;
  x: number;
  y: number;
  str: string;
}

function columnSide(x: number): "LABEL" | "ENTRY" {
  return x <= LABEL_COLUMN_MAX_X ? "LABEL" : "ENTRY";
}

function mergeLines(items: CoordTextItem[]): MergedLine[] {
  const rawLines: MergedLine[] = [];
  for (const it of items) {
    if (it.str.length === 0) continue;
    if (isBoilerplate(it.str, it.y)) continue;
    const last = rawLines[rawLines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= SAME_LINE_Y_EPSILON && columnSide(last.x) === columnSide(it.x)) {
      last.str += it.str;
      continue;
    }
    rawLines.push({ page: it.page, x: it.x, y: it.y, str: it.str });
  }
  for (const l of rawLines) l.str = l.str.replace(/\s+/g, " ").trim();
  return rawLines.filter((l) => l.str !== "" && !isNoiseLine(l.str));
}

interface OpenRow {
  region: string;
  rowNumber: number | null;
  schoolNameParts: string[];
  page: number;
  x: number;
  y: number;
  regionLabelPage: number | null;
  regionLabelY: number | null;
  regionLabelText: string | null;
  rowGapFromPreviousRow: number | null;
  rowStartRule: ExtractionEvidence["rowStartRule"];
}

function joinWrappedParts(parts: string[]): string {
  let result = "";
  for (const part of parts) {
    if (result === "") {
      result = part;
      continue;
    }
    const lastWord = result.slice(result.lastIndexOf(" ") + 1);
    const isOrphanLetter = /^[A-ZÀ-Ü]$/.test(lastWord);
    result = isOrphanLetter ? result + part : `${result} ${part}`;
  }
  return result;
}

function finalizeRow(open: OpenRow, program: string): SchoolProgramRowA2 {
  const schoolName = joinWrappedParts(open.schoolNameParts).replace(/\s+/g, " ").trim();
  return {
    page: open.page,
    program,
    region: open.region,
    rowNumber: open.rowNumber,
    schoolName,
    extractionEvidence: {
      page: open.page,
      x: open.x,
      y: open.y,
      numberToken: open.rowNumber !== null ? `${open.rowNumber}.` : null,
      regionLabelPage: open.regionLabelPage,
      regionLabelY: open.regionLabelY,
      regionLabelText: open.regionLabelText,
      rowGapFromPreviousRow: open.rowGapFromPreviousRow,
      rowStartRule: open.rowStartRule,
    },
  };
}

/**
 * Pré-passe §3/§4 : localise chaque étiquette non reconnue de la colonne
 * région et détermine si elle est RÉCUPÉRABLE, en appliquant les 5
 * conditions décrites en en-tête. Ne modifie rien — se contente de calculer
 * une décision par INDEX DE LIGNE, consultée pendant la passe principale.
 */
function computeRecoveryDecisions(lines: MergedLine[], sourceSha256Verified: boolean, documentWideOrderInvariantHolds: boolean): Map<number, CorruptedLabelRecoveryEvidence> {
  const decisions = new Map<number, CorruptedLabelRecoveryEvidence>();
  if (!sourceSha256Verified || !documentWideOrderInvariantHolds) return decisions; // §1/§2 — fail-closed global.

  // Construire la séquence des étiquettes (connues + inconnues), dans l'ordre du flux, colonne LABEL uniquement.
  const labelEntries: { lineIdx: number; known: string | null; raw: string }[] = [];
  lines.forEach((line, idx) => {
    if (columnSide(line.x) !== "LABEL") return;
    const key = regionKeyFromToken(line.str);
    labelEntries.push({ lineIdx: idx, known: key, raw: line.str });
  });

  for (let i = 0; i < labelEntries.length; i++) {
    const entry = labelEntries[i];
    if (entry.known !== null) continue; // déjà reconnue, rien à récupérer.

    const prev = [...labelEntries.slice(0, i)].reverse().find((e) => e.known !== null);
    const next = labelEntries.slice(i + 1).find((e) => e.known !== null);
    if (!prev || !next) continue; // §3 — pas de bornes des deux côtés, ambigu.

    const prevIdx = REGION_CANONICAL_LIST.indexOf(prev.known as (typeof REGION_CANONICAL_LIST)[number]);
    const nextIdx = REGION_CANONICAL_LIST.indexOf(next.known as (typeof REGION_CANONICAL_LIST)[number]);
    if (prevIdx === -1 || nextIdx === -1 || nextIdx <= prevIdx + 1) continue; // pas d'écart, ou ordre incohérent -> pas de gap à combler.
    const candidates = REGION_CANONICAL_LIST.slice(prevIdx + 1, nextIdx);
    if (candidates.length !== 1) continue; // §3 — doit être EXACTEMENT un candidat.
    const candidateRegion = candidates[0];

    // §4 — chercher la toute première ligne numérotée APRÈS cette étiquette (n'importe quelle colonne), avant la ligne suivante de la colonne LABEL (ou fin de section).
    const searchEnd = i + 1 < labelEntries.length ? labelEntries[i + 1].lineIdx : lines.length;
    let firstRowNumber: number | null = null;
    for (let li = entry.lineIdx + 1; li < searchEnd; li++) {
      const m = lines[li].str.match(NUMBER_ROW_RE);
      if (m) {
        firstRowNumber = Number(m[1]);
        break;
      }
    }
    if (firstRowNumber !== 1) continue; // §4 — doit redémarrer exactement à 1.

    // §5 — garde-fou de similarité résiduelle, générique (sous-séquence de lettres), jamais une égalité de chaîne câblée en dur.
    const overlap = subsequenceOverlapRatio(entry.raw, candidateRegion);
    if (overlap < RESIDUAL_OVERLAP_MIN_RATIO) continue;

    decisions.set(entry.lineIdx, {
      method: "CORRUPTED_REGION_LABEL_RECOVERED_BY_STRUCTURE",
      rawLabelText: entry.raw,
      page: lines[entry.lineIdx].page,
      x: lines[entry.lineIdx].x,
      y: lines[entry.lineIdx].y,
      prevRegion: prev.known as string,
      nextRegion: next.known as string,
      recoveredRegion: candidateRegion,
      candidateCount: candidates.length,
      firstRowNumberAfterLabel: firstRowNumber,
      residualOverlapRatio: Math.round(overlap * 1000) / 1000,
    });
  }
  return decisions;
}

export interface FiliereSectionResultA3 extends FiliereSectionResultA2 {
  recoveryEvidence: CorruptedLabelRecoveryEvidence[];
}

function parseFiliereSection(
  filiereRaw: string,
  programNormalized: string,
  lines: MergedLine[],
  sourceSha256Verified: boolean,
  documentWideOrderInvariantHolds: boolean
): FiliereSectionResultA3 {
  const structuralAnomalies: string[] = [];
  const recoveryEvidence: CorruptedLabelRecoveryEvidence[] = [];
  const pagesInvolved = Array.from(new Set(lines.map((l) => l.page))).sort((a, b) => a - b);

  const recoveryDecisions = computeRecoveryDecisions(lines, sourceSha256Verified, documentWideOrderInvariantHolds);

  const entryLeaderXs: number[] = [];
  for (const line of lines) {
    if (line.x > LABEL_COLUMN_MAX_X) entryLeaderXs.push(line.x);
  }
  const xCounts = new Map<number, number>();
  for (const x of entryLeaderXs) xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
  let baseX: number | null = null;
  for (const [x, count] of xCounts) {
    if (count >= 2 && (baseX === null || x < baseX)) baseX = x;
  }
  if (baseX === null && entryLeaderXs.length > 0) baseX = Math.min(...entryLeaderXs);

  let currentRegion: string | null = null;
  let currentRegionLabelPage: number | null = null;
  let currentRegionLabelY: number | null = null;
  let currentRegionLabelText: string | null = null;
  const regionsInOrder: string[] = [];
  const rows: SchoolProgramRowA2[] = [];
  let openRow: OpenRow | null = null;
  let lastLineY: number | null = null;
  let lastLinePage: number | null = null;
  let numberedRowCount = 0;
  const unknownLabels: string[] = [];

  function closeOpenRow() {
    if (openRow) {
      rows.push(finalizeRow(openRow, programNormalized));
      openRow = null;
    }
  }

  lines.forEach((line, lineIdx) => {
    if (line.x <= LABEL_COLUMN_MAX_X) {
      const key = regionKeyFromToken(line.str);
      const recovered = key === null ? recoveryDecisions.get(lineIdx) : undefined;
      const effectiveKey = key ?? recovered?.recoveredRegion ?? null;

      if (effectiveKey) {
        closeOpenRow();
        if (regionsInOrder.length === 0 || regionsInOrder[regionsInOrder.length - 1] !== effectiveKey) {
          if (regionsInOrder.includes(effectiveKey)) {
            structuralAnomalies.push(
              `REGION_LABEL_NONADJACENT_REPEAT: "${effectiveKey}" réapparaît après une autre région (page ${line.page}, y=${line.y}) — association région/ligne non fiable.`
            );
          }
          regionsInOrder.push(effectiveKey);
        }
        currentRegion = effectiveKey;
        currentRegionLabelPage = line.page;
        currentRegionLabelY = line.y;
        currentRegionLabelText = recovered ? `${line.str} [RECOVERED->${effectiveKey}]` : line.str;
        lastLineY = null;
        lastLinePage = null;
        if (recovered) recoveryEvidence.push(recovered);
        return;
      }
      unknownLabels.push(`"${line.str}" (page ${line.page}, y=${line.y})`);
      return;
    }

    if (currentRegion === null) {
      structuralAnomalies.push(`ENTRY_BEFORE_REGION_LABEL: contenu détecté (page ${line.page}, y=${line.y}) avant toute étiquette région dans cette filière.`);
      return;
    }

    const numMatch = line.str.match(NUMBER_ROW_RE);
    if (numMatch) {
      closeOpenRow();
      const num = Number(numMatch[1]);
      numberedRowCount += 1;
      const rowGap = lastLineY !== null ? Number((lastLineY - line.y).toFixed(2)) : null;
      openRow = {
        region: currentRegion,
        rowNumber: num,
        schoolNameParts: numMatch[2] ? [numMatch[2]] : [],
        page: line.page,
        x: line.x,
        y: line.y,
        regionLabelPage: currentRegionLabelPage,
        regionLabelY: currentRegionLabelY,
        regionLabelText: currentRegionLabelText,
        rowGapFromPreviousRow: rowGap,
        rowStartRule: "NUMBER_TOKEN",
      };
      lastLineY = line.y;
      lastLinePage = line.page;
      return;
    }

    const isAtBaseX = baseX !== null && Math.abs(line.x - baseX) <= BASE_X_EPSILON;
    const pageChanged = lastLinePage !== null && line.page !== lastLinePage;
    const gapFromLastLine = lastLineY !== null && !pageChanged ? lastLineY - line.y : null;
    const isNewRowByGap = openRow === null || pageChanged || (isAtBaseX && gapFromLastLine !== null && gapFromLastLine >= ROW_GAP_THRESHOLD);

    if (isNewRowByGap && isAtBaseX) {
      closeOpenRow();
      const rowGap = gapFromLastLine !== null ? Number(gapFromLastLine.toFixed(2)) : null;
      openRow = {
        region: currentRegion,
        rowNumber: null,
        schoolNameParts: [line.str],
        page: line.page,
        x: line.x,
        y: line.y,
        regionLabelPage: currentRegionLabelPage,
        regionLabelY: currentRegionLabelY,
        regionLabelText: currentRegionLabelText,
        rowGapFromPreviousRow: rowGap,
        rowStartRule: lastLineY === null ? "FIRST_ROW_IN_BLOCK" : "ROW_HEIGHT_GAP",
      };
      lastLineY = line.y;
      lastLinePage = line.page;
      return;
    }

    if (openRow) {
      (openRow as OpenRow).schoolNameParts.push(line.str);
    } else {
      structuralAnomalies.push(`UNATTACHED_CONTINUATION: fragment "${line.str.slice(0, 60)}" (page ${line.page}, y=${line.y}) sans ligne ouverte à rattacher.`);
    }
    lastLineY = line.y;
    lastLinePage = line.page;
  });
  closeOpenRow();

  if (unknownLabels.length > 0) {
    structuralAnomalies.push(`UNKNOWN_REGION_LABEL: ${unknownLabels.length} étiquette(s) dans la colonne région non reconnue(s) : ${unknownLabels.slice(0, 5).join("; ")}${unknownLabels.length > 5 ? "…" : ""}`);
  }

  const parsedRowCount = rows.length;
  let numberingMode: NumberingMode;
  if (numberedRowCount === 0) {
    numberingMode = "NUMBERING_ABSENT_SOURCE_DEFECT";
  } else if (numberedRowCount === parsedRowCount) {
    numberingMode = "NUMBERED";
  } else {
    numberingMode = "NUMBERING_INCONSISTENT";
    structuralAnomalies.push(`NUMBERING_PARTIAL: ${numberedRowCount}/${parsedRowCount} lignes numérotées — incohérence, source non homogène pour cette filière.`);
  }

  const numberingResetByRegion = new Map<string, boolean>();
  for (const region of REGION_CANONICAL_LIST) {
    const regionRows = rows.filter((r) => r.region === region);
    if (regionRows.length === 0 || numberingMode !== "NUMBERED") continue;
    const nums = regionRows.map((r) => r.rowNumber as number);
    const expected = Array.from({ length: nums.length }, (_, i) => i + 1);
    const ok = JSON.stringify(nums) === JSON.stringify(expected);
    numberingResetByRegion.set(region, ok);
    if (!ok) {
      structuralAnomalies.push(`NUMBERING_GAP: région "${region}" — numéros observés [${nums.join(",")}] ≠ séquence attendue [${expected.join(",")}].`);
    }
  }

  const regionMatrix: RegionBlockResult[] = [];
  for (const region of REGION_CANONICAL_LIST) {
    const regionRows = rows.filter((r) => r.region === region);
    let status: RegionRowStatus;
    const numberingResetOk = numberingResetByRegion.get(region) ?? null;
    if (regionRows.length > 0) {
      status = "PARSED";
    } else if (regionsInOrder.includes(region)) {
      status = "ZERO_ROWS_CONFIRMED";
    } else if (structuralAnomalies.length === 0) {
      status = "ZERO_ROWS_CONFIRMED";
    } else {
      status = "REGION_NOT_PARSED";
    }
    regionMatrix.push({ region, rowCount: regionRows.length, status, numberingResetOk });
  }

  let verdict: FiliereVerdict;
  if (structuralAnomalies.length > 0) {
    verdict = "QUARANTINED_STRUCTURE_AMBIGUOUS";
  } else if (numberingMode === "NUMBERING_ABSENT_SOURCE_DEFECT") {
    verdict = "QUARANTINED_NUMBERING_ABSENT";
  } else {
    verdict = "SAFE";
  }

  return {
    filiereRaw,
    programNormalized,
    pagesInvolved,
    regionsDetectedInOrder: regionsInOrder,
    regionMatrix,
    numberingMode,
    numberedRowCount,
    parsedRowCount,
    structuralAnomalies,
    verdict,
    rows,
    recoveryEvidence,
  };
}

export interface MinsanteA3ParseResult {
  parserVersion: string;
  filiereSections: FiliereSectionResultA3[];
  warnings: string[];
  documentWideOrderInvariantHolds: boolean;
  sourceSha256Verified: boolean;
}

/**
 * Point d'entrée A.3. Identique à `parseMinsanteA2` pour la structure
 * générale, avec DEUX ajouts :
 *  - `sourceSha256Verified` doit être calculé par l'appelant en comparant le
 *    SHA256 réel du PDF chargé au SHA256 attendu — jamais recalculé ici
 *    (un seul point de calcul de hash, §10 R.2-SAFETY).
 *  - L'invariant document-wide (ordre alphabétique des régions, §2) est
 *    calculé en PREMIER, à partir d'une PREMIÈRE PASSE identique à A.2 (sans
 *    récupération), puis réutilisé pour activer, ou non, la récupération
 *    dans une SECONDE PASSE.
 */
export function parseMinsanteA3(pagesItems: CoordTextItem[][], sourceSha256Verified: boolean): MinsanteA3ParseResult {
  const allItems: CoordTextItem[] = ([] as CoordTextItem[]).concat(...pagesItems);
  if (allItems.length === 0) {
    throw new Error("PDF EXTRACTION STOP — aucun item texte fourni (extraction coordonnée vide).");
  }

  const filiereStarts: { index: number; label: string }[] = [];
  allItems.forEach((it, idx) => {
    const m = it.str.trim().match(FILIERE_RE);
    if (m) filiereStarts.push({ index: idx, label: m[1].trim() });
  });
  if (filiereStarts.length === 0) {
    throw new Error("PDF EXTRACTION STOP — aucun en-tête 'FILIERE :' détecté dans les items fournis.");
  }

  function sectionLinesFor(index: number, sectionEnd: number): MergedLine[] {
    const sectionItems = allItems.slice(index + 1, sectionEnd);
    return mergeLines(sectionItems);
  }

  // ── PASSE 1 (identique à A.2, SANS récupération) — établit l'invariant. ──
  const baselineSections: { programNormalized: string; regionsDetectedInOrder: string[] }[] = [];
  for (let i = 0; i < filiereStarts.length; i++) {
    const { index, label } = filiereStarts[i];
    const sectionEnd = i + 1 < filiereStarts.length ? filiereStarts[i + 1].index : allItems.length;
    const key = normalizeFiliereKey(label);
    const known = OFFICIAL_PROGRAMS[key];
    if (!known) {
      throw new Error(`PDF EXTRACTION STOP — filière inconnue "${label}" (normalisée "${key}").`);
    }
    const lines = sectionLinesFor(index, sectionEnd);
    const baseline = parseFiliereSection(label, known, lines, false, false); // recovery désactivée pour la passe de calcul de l'invariant.
    baselineSections.push({ programNormalized: known, regionsDetectedInOrder: baseline.regionsDetectedInOrder });
  }

  let documentWideOrderInvariantHolds = true;
  for (const s of baselineSections) {
    for (let i = 1; i < s.regionsDetectedInOrder.length; i++) {
      const prevIdx = REGION_CANONICAL_LIST.indexOf(s.regionsDetectedInOrder[i - 1] as (typeof REGION_CANONICAL_LIST)[number]);
      const curIdx = REGION_CANONICAL_LIST.indexOf(s.regionsDetectedInOrder[i] as (typeof REGION_CANONICAL_LIST)[number]);
      if (prevIdx === -1 || curIdx === -1 || curIdx <= prevIdx) {
        documentWideOrderInvariantHolds = false;
      }
    }
  }

  // ── PASSE 2 — parse définitif, récupération activée seulement si (source vérifiée) ET (invariant tenu). ──
  const warnings: string[] = [];
  const filiereSections: FiliereSectionResultA3[] = [];
  for (let i = 0; i < filiereStarts.length; i++) {
    const { index, label } = filiereStarts[i];
    const sectionEnd = i + 1 < filiereStarts.length ? filiereStarts[i + 1].index : allItems.length;
    const key = normalizeFiliereKey(label);
    const known = OFFICIAL_PROGRAMS[key];
    if (!known) {
      throw new Error(`PDF EXTRACTION STOP — filière inconnue "${label}" (normalisée "${key}").`);
    }
    const lines = sectionLinesFor(index, sectionEnd);
    const section = parseFiliereSection(label, known, lines, sourceSha256Verified, documentWideOrderInvariantHolds);
    filiereSections.push(section);
    if (section.verdict !== "SAFE") {
      warnings.push(`Filière "${label}" : verdict ${section.verdict} (${section.structuralAnomalies.length} anomalie(s), numberingMode=${section.numberingMode}).`);
    }
    if (section.recoveryEvidence.length > 0) {
      warnings.push(`Filière "${label}" : ${section.recoveryEvidence.length} étiquette(s) de région récupérée(s) par corroboration structurelle (${section.recoveryEvidence.map((e) => `"${e.rawLabelText}"->${e.recoveredRegion}`).join(", ")}).`);
    }
  }

  if (filiereSections.length !== Object.keys(OFFICIAL_PROGRAMS).length) {
    warnings.push(`Attention : ${filiereSections.length}/${Object.keys(OFFICIAL_PROGRAMS).length} filières officielles détectées dans ce document.`);
  }

  return { parserVersion: PARSER_VERSION, filiereSections, warnings, documentWideOrderInvariantHolds, sourceSha256Verified };
}
