/**
 * SPRINT MINSANTE-A.1 — Extracteur PDF texte déterministe pour la Source A
 * ("Liste des Écoles de Formation des Personnels Médico-Sanitaires Agréées
 * du MINSANTE — Année 2025", catalogué dans MINSANTE_SOURCE_CATALOG.md).
 *
 * Structure observée : RÉGION -> FILIERE -> ÉCOLE (répétée par filière). Une
 * même école peut apparaître sous plusieurs filières — ce module extrait des
 * SchoolProgramRow (une ligne = un couple école×filière), JAMAIS un
 * établissement dédupliqué (voir minsanteDedup.ts pour cette étape séparée,
 * conformément à REGISTRY_EXTRACTION_SAFETY.md "extraction avant
 * déduplication").
 *
 * Respecte le contrat REGISTRY_EXTRACTION_SAFETY.md : jamais de
 * `catch { return [] }`, un statut de complétude toujours dérivé d'un
 * compte vérifiable, jamais d'une opinion IA. Aucune IA n'a été utilisée
 * pour compter ou décider de la complétude de ce parseur — code
 * déterministe uniquement (regex + machine à états ligne par ligne).
 */

export const PARSER_VERSION = "minsante-a1-pdf-text@1";

/**
 * Les 10 filières officielles observées dans la Source A (catalogue
 * MINSANTE_SOURCE_CATALOG.md §Source A ENTITY TYPES). Toute filière trouvée
 * dans le document qui ne figure PAS dans cette liste déclenche un
 * FAIL-CLOSED (changement de structure majeur, §7 de la spec) — cette liste
 * n'est pas un nombre arbitraire choisi pour forcer un PASS, elle vient de
 * l'observation directe du document (MINSANTE-A) et sert de garde-fou de
 * vocabulaire, pas de garde-fou de comptage (le comptage réel des lignes
 * est toujours recalculé à partir du texte, jamais hardcodé).
 */
export const OFFICIAL_PROGRAMS: Record<string, string> = {
  "ANALYSES MEDICALES": "Analyses Médicales",
  "IMAGERIE MEDICALE": "Imagerie Médicale",
  INFIRMIERS: "Infirmiers",
  KINESITHERAPIE: "Kinésithérapie",
  ODONTOSTOMATOLOGIE: "Odontostomatologie",
  "OPTIQUE REFRACTION": "Optique Réfraction",
  "PROTHESE DENTAIRE": "Prothèse Dentaire",
  "SAGES-FEMMES/MAIEUTICIENS": "Sages-femmes/Maïeuticiens",
  "SCIENCES PHARMACEUTIQUES": "Sciences Pharmaceutiques",
  "PSYCHOMOTRICITE ET RELAXATION": "Psychomotricité et Relaxation",
};

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

function stripAccentsUpper(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function regionKeyFromToken(raw: string): string | null {
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return REGION_TOKENS[key] ?? null;
}

function normalizeFiliereKey(raw: string): string {
  return stripAccentsUpper(raw).replace(/\s+/g, " ").trim();
}

export interface RawSchoolProgramRow {
  filiereRaw: string;
  programNormalized: string;
  region: string;
  rawSchoolName: string;
  /** Ligne de départ (1-based) dans le texte source — traçabilité/audit. */
  sourceLine: number;
}

export type FiliereSectionStatus = "PARSED" | "STRUCTURE_ANOMALY";

export interface FiliereSectionResult {
  filiereRaw: string;
  programNormalized: string;
  status: FiliereSectionStatus;
  rows: RawSchoolProgramRow[];
  regionResetCount: number;
  regionLabelCount: number;
  anomalyReason: string | null;
  /** Pour une section STRUCTURE_ANOMALY : nombre de lignes de contenu non-région/non-header trouvées, compté explicitement (jamais silencieusement perdu). */
  unparsedContentLineCount: number;
}

export interface MinsanteA1ParseResult {
  parserVersion: string;
  declaredTotalPages: number;
  pagesFound: number[];
  filiereSections: FiliereSectionResult[];
  rows: RawSchoolProgramRow[]; // uniquement les sections PARSED
  regionsObserved: string[];
  explainedExclusions: { category: "STRUCTURE_ANOMALY" | "OTHER"; count: number; reason: string; filiere: string }[];
  warnings: string[];
}

interface ParsedItemLine {
  lineIndex: number;
  number: number;
  prefixRegionCandidate: string | null;
  text: string;
}

const PAGE_MARKER_RE = /Page\s+(\d+)\s+sur\s+(\d+)/i;
const FILIERE_RE = /^FILIERE\s*:\s*(.+)$/i;
const HEADER_ROW_RE = /^\s*REGIONS\s+ECOLES\s*$/i;
const ITEM_LINE_RE = /^\s*(?:([A-ZÀ-Ü][A-ZÀ-Ü'’\-\s]{1,40}?)\s+)?(\d+)\.\s+(.+?)\s*$/;
const STANDALONE_CAPS_RE = /^\s*([A-ZÀ-Ü][A-ZÀ-Ü'’\- ]{1,40})\s*$/;

function joinContinuation(prev: string, cont: string): string {
  const trimmedPrev = prev.replace(/\s+$/, "");
  const trimmedCont = cont.trim();
  if (/-$/.test(trimmedPrev)) return trimmedPrev + trimmedCont;
  return `${trimmedPrev} ${trimmedCont}`;
}

/**
 * §7 — STOP obligatoire si les pages du document ne forment pas une
 * séquence complète 1..N sans trou/doublon. Ne jamais interpréter des pages
 * manquantes comme "document complet".
 */
function extractAndValidatePages(text: string): { declaredTotalPages: number; pagesFound: number[] } {
  const lines = text.split("\n");
  const found: number[] = [];
  let declaredTotal: number | null = null;
  for (const line of lines) {
    const m = line.match(PAGE_MARKER_RE);
    if (m) {
      const page = Number(m[1]);
      const total = Number(m[2]);
      if (declaredTotal === null) declaredTotal = total;
      if (total !== declaredTotal) {
        throw new Error(`PDF EXTRACTION STOP — total de pages incohérent entre marqueurs ("${declaredTotal}" puis "${total}"). Structure inattendue.`);
      }
      found.push(page);
    }
  }
  if (declaredTotal === null) {
    throw new Error("PDF EXTRACTION STOP — aucun marqueur de pagination ('Page N sur M') trouvé. Impossible de prouver la complétude du document.");
  }
  const expected = Array.from({ length: declaredTotal }, (_, i) => i + 1);
  const sortedFound = [...found].sort((a, b) => a - b);
  const missing = expected.filter((p) => !sortedFound.includes(p));
  const duplicated = found.length !== new Set(found).size;
  if (missing.length > 0) {
    throw new Error(`PDF EXTRACTION STOP — page(s) manquante(s) : ${missing.join(", ")} sur ${declaredTotal} attendues.`);
  }
  if (duplicated) {
    throw new Error(`PDF EXTRACTION STOP — marqueur de page dupliqué détecté (boucle/extraction corrompue).`);
  }
  return { declaredTotalPages: declaredTotal, pagesFound: sortedFound };
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  if (PAGE_MARKER_RE.test(trimmed)) return true;
  if (HEADER_ROW_RE.test(trimmed)) return true;
  if (/^REPUBLIQUE DU CAMEROUN|^REPUBLIC OF CAMEROON|^MINISTERE DE LA SANTE|^MINISTRY OF PUBLIC HEALTH|^Paix|^Peace|^=-=/.test(trimmed)) return true;
  if (/^LISTE DES ECOLES|^AGREES DU MINSANTE/i.test(trimmed)) return true;
  return false;
}

/**
 * Parse une section filière (texte compris entre deux en-têtes `FILIERE :`)
 * en lignes école×région. §9 — n'assigne JAMAIS une région par proximité
 * visuelle seule : exige une correspondance EXACTE entre le nombre de
 * redémarrages de numérotation (nouvelle région) et le nombre d'étiquettes
 * région trouvées dans la section. En cas de désaccord -> STRUCTURE_ANOMALY,
 * la section entière est exclue du dataset de confiance mais son volume est
 * compté explicitement (jamais une perte silencieuse).
 */
function parseFiliereSection(filiereRaw: string, programNormalized: string, sectionLines: string[], sectionStartLine: number): FiliereSectionResult {
  const items: ParsedItemLine[] = [];
  const regionLabelsInOrder: string[] = [];
  const unknownCapsLines: string[] = [];
  let unparsedContentLineCount = 0;

  sectionLines.forEach((line, idx) => {
    if (isNoiseLine(line)) return;
    if (FILIERE_RE.test(line.trim())) return; // ne devrait pas arriver (segmentation en amont), garde-fou

    const itemMatch = line.match(ITEM_LINE_RE);
    if (itemMatch) {
      const [, prefix, numStr, rest] = itemMatch;
      const num = Number(numStr);
      let prefixRegion: string | null = null;
      if (prefix) {
        const key = regionKeyFromToken(prefix);
        if (key) {
          prefixRegion = key;
          regionLabelsInOrder.push(key);
        }
      }
      items.push({ lineIndex: sectionStartLine + idx, number: num, prefixRegionCandidate: prefixRegion, text: rest.trim() });
      unparsedContentLineCount += 1;
      return;
    }

    const standaloneMatch = line.match(STANDALONE_CAPS_RE);
    if (standaloneMatch) {
      const candidate = standaloneMatch[1].trim();
      const key = regionKeyFromToken(candidate);
      if (key) {
        regionLabelsInOrder.push(key);
        unparsedContentLineCount += 1;
        return;
      }
      // Ligne tout en majuscules mais pas une région connue -> probable
      // continuation de nom d'école (ex. fragment de ville). Traitée plus
      // bas comme continuation, pas comme label région.
      unknownCapsLines.push(candidate);
    }

    // Continuation : rattachée au dernier item ouvert.
    if (items.length > 0) {
      const last = items[items.length - 1];
      last.text = joinContinuation(last.text, line.trim());
      unparsedContentLineCount += 1;
    } else {
      unparsedContentLineCount += 1;
    }
  });

  const resetIndices = items.map((it, i) => (it.number === 1 ? i : -1)).filter((i) => i >= 0);
  const regionResetCount = resetIndices.length;
  const regionLabelCount = regionLabelsInOrder.length;

  if (regionResetCount === 0 || regionResetCount !== regionLabelCount) {
    return {
      filiereRaw,
      programNormalized,
      status: "STRUCTURE_ANOMALY",
      rows: [],
      regionResetCount,
      regionLabelCount,
      anomalyReason:
        regionResetCount === 0
          ? `Aucune numérotation "1." détectée (0 redémarrage de région) — structure non conforme au modèle numéroté attendu. ${items.length} ligne(s) de contenu candidates non exploitables sans invention de région.`
          : `Désaccord structurel : ${regionResetCount} redémarrage(s) de numérotation vs ${regionLabelCount} étiquette(s) région détectée(s) — assignation région non fiable, section mise en quarantaine plutôt que devinée.`,
      unparsedContentLineCount,
    };
  }

  // Zip 1:1, en ordre document, redémarrage i -> regionLabelsInOrder[i].
  const rows: RawSchoolProgramRow[] = [];
  for (let i = 0; i < resetIndices.length; i++) {
    const start = resetIndices[i];
    const end = i + 1 < resetIndices.length ? resetIndices[i + 1] : items.length;
    const region = regionLabelsInOrder[i];
    for (let j = start; j < end; j++) {
      const item = items[j];
      rows.push({
        filiereRaw,
        programNormalized,
        region,
        rawSchoolName: item.text.replace(/\s+/g, " ").trim(),
        sourceLine: item.lineIndex,
      });
    }
  }

  return {
    filiereRaw,
    programNormalized,
    status: "PARSED",
    rows,
    regionResetCount,
    regionLabelCount,
    anomalyReason: null,
    unparsedContentLineCount,
  };
}

/**
 * Point d'entrée. §7 — lève une exception (jamais un tableau vide
 * silencieux) si : aucune filière détectée, aucune école détectée au total,
 * pages manquantes, ou aucune filière connue trouvée.
 */
export function parseMinsanteA1Pdf(text: string): MinsanteA1ParseResult {
  if (!text || text.trim().length === 0) {
    throw new Error("PDF EXTRACTION STOP — texte source vide (extraction pdftotext a échoué ou fichier vide).");
  }

  const { declaredTotalPages, pagesFound } = extractAndValidatePages(text);

  const lines = text.split("\n");
  const filiereStarts: { lineIndex: number; label: string }[] = [];
  lines.forEach((line, idx) => {
    const m = line.trim().match(FILIERE_RE);
    if (m) filiereStarts.push({ lineIndex: idx, label: m[1].trim() });
  });

  if (filiereStarts.length === 0) {
    throw new Error("PDF EXTRACTION STOP — aucun en-tête 'FILIERE :' détecté. Structure du document non reconnue.");
  }

  const warnings: string[] = [];
  const filiereSections: FiliereSectionResult[] = [];

  for (let i = 0; i < filiereStarts.length; i++) {
    const { lineIndex, label } = filiereStarts[i];
    const sectionEnd = i + 1 < filiereStarts.length ? filiereStarts[i + 1].lineIndex : lines.length;
    const sectionLines = lines.slice(lineIndex + 1, sectionEnd);

    const key = normalizeFiliereKey(label);
    const known = OFFICIAL_PROGRAMS[key];
    if (!known) {
      throw new Error(
        `PDF EXTRACTION STOP — filière inconnue "${label}" (normalisée "${key}") absente du vocabulaire officiel observé (${Object.keys(OFFICIAL_PROGRAMS).length} filières connues). Changement de structure majeur — nécessite revue humaine avant d'étendre le vocabulaire.`
      );
    }

    const section = parseFiliereSection(label, known, sectionLines, lineIndex + 2 /* 1-based + en-tête */);
    filiereSections.push(section);
    if (section.status === "STRUCTURE_ANOMALY") {
      warnings.push(`Filière "${label}" : ${section.anomalyReason}`);
    }
  }

  const rows = filiereSections.filter((s) => s.status === "PARSED").flatMap((s) => s.rows);
  const anomalous = filiereSections.filter((s) => s.status === "STRUCTURE_ANOMALY");

  if (rows.length === 0) {
    throw new Error("PDF EXTRACTION STOP — 0 ligne école×filière extraite au total (toutes les filières en anomalie structurelle). Jamais interprété comme '0 résultat' valide.");
  }

  const regionsObserved = Array.from(new Set(rows.map((r) => r.region))).sort();

  const explainedExclusions = anomalous.map((s) => ({
    category: "STRUCTURE_ANOMALY" as const,
    count: s.unparsedContentLineCount,
    reason: s.anomalyReason ?? "anomalie structurelle",
    filiere: s.filiereRaw,
  }));

  return {
    parserVersion: PARSER_VERSION,
    declaredTotalPages,
    pagesFound,
    filiereSections,
    rows,
    regionsObserved,
    explainedExclusions,
    warnings,
  };
}
