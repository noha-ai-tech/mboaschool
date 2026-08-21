/**
 * SPRINT MINSANTE-I §5 — Extracteur PDF conscient des coordonnées pour la
 * Source A ("Liste des Écoles de Formation des Personnels Médico-Sanitaires
 * Agréées du MINSANTE — Année 2025"), successeur explicitement versionné de
 * `minsante-a1-pdf-text@1` (voir pdfMinsanteA1.ts, INCHANGÉ par ce fichier).
 *
 * MOTIVATION (voir docs/03_DATA_REGISTRY/MINSANTE_IMPORT_CONTRACT.md §A.2
 * pour l'investigation complète) :
 *
 *   `pdftotext -layout` reconstruit l'ordre de lecture par un heuristique
 *   GÉOMÉTRIQUE (tri par position Y). Le tableau source place l'étiquette de
 *   région dans une cellule FUSIONNÉE, centrée verticalement sur tout le
 *   bloc de lignes qu'elle couvre. `pdftotext -layout` place donc cette
 *   étiquette à la ligne correspondant à sa position Y réelle — c'est-à-dire
 *   au MILIEU du bloc, pas à son sommet — ce qui associe la région à une
 *   mauvaise école dans le texte linéarisé.
 *
 *   Pour 4 filières (Imagerie Médicale, Kinésithérapie, Sciences
 *   Pharmaceutiques, Psychomotricité et Relaxation), ce problème est
 *   aggravé par un second défaut, cette fois dans le PDF SOURCE lui-même
 *   (pas un artefact d'outil) : pour Imagerie Médicale spécifiquement,
 *   AUCUN glyphe n'est peint dans le flux de contenu pour les numéros de
 *   ligne — vérifié par inspection de bas niveau (`page.getOperatorList()` :
 *   le nombre d'opérations `showText` égale exactement le nombre
 *   d'opérations `beginText`, aucune opération de dessin vectoriel
 *   supplémentaire n'existe aux coordonnées attendues du numéro, et l'arbre
 *   de structure taggé ne porte aucun texte `Lbl` pour ces items). Ce n'est
 *   pas une limite d'un outil d'extraction : AUCUN extracteur (pdftotext,
 *   pdfjs, pdfplumber) ne peut récupérer un numéro qui n'a jamais été
 *   peint. Kinésithérapie, Sciences Pharmaceutiques et Psychomotricité, en
 *   revanche, ONT des numéros peints dans le flux — leur quarantaine
 *   historique provient uniquement du premier défaut (association région
 *   cassée par `pdftotext -layout`), corrigible par ce parseur.
 *
 * PRINCIPE CLÉ DE CE PARSEUR : ne JAMAIS trier par Y. L'ordre de FLUX DE
 * CONTENU (l'ordre naturel dans lequel `pdf.js` restitue les items d'une
 * page, qui est l'ordre de PEINTURE du document, donc l'ordre de lecture
 * logique voulu par son auteur) est utilisé tel quel — c'est cet ordre qui
 * place correctement l'étiquette de région AVANT la première école de son
 * bloc, même quand sa coordonnée Y la place visuellement au milieu.
 *
 * Séparation des lignes en l'absence de numéro : la hauteur de ligne du
 * tableau source est un intervalle Y constant et mesuré empiriquement (~15pt
 * entre deux entrées distinctes de la colonne ECOLES, ~10.3-10.8pt entre
 * deux lignes d'un même nom d'école qui se poursuit sur plusieurs lignes
 * visuelles). Ce parseur utilise ce seuil pour distinguer "nouvelle ligne"
 * de "suite de la ligne précédente" indépendamment de tout numéro imprimé.
 */

import { OFFICIAL_PROGRAMS, PARSER_VERSION as A1_PARSER_VERSION } from "./pdfMinsanteA1";

export const PARSER_VERSION = "minsante-a2-pdf-coordinates@1";
// Référence explicite pour ne jamais confondre les deux versions dans les rapports.
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

// ============================================================================
// Modèle d'entrée : items texte porteurs de coordonnées, un tableau par
// page, ORDONNÉ (ordre de flux de contenu, PAS trié par Y). Produit par
// pdfCoordinateLoader.ts (pdf.js) — séparé ici pour rester testable avec des
// fixtures synthétiques sans dépendance PDF réelle.
// ============================================================================
export interface CoordTextItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

export interface ExtractionEvidence {
  page: number;
  x: number;
  y: number;
  numberToken: string | null;
  regionLabelPage: number | null;
  regionLabelY: number | null;
  regionLabelText: string | null;
  rowGapFromPreviousRow: number | null;
  rowStartRule: "NUMBER_TOKEN" | "ROW_HEIGHT_GAP" | "FIRST_ROW_IN_BLOCK";
}

export interface SchoolProgramRowA2 {
  page: number;
  program: string;
  region: string;
  rowNumber: number | null;
  schoolName: string;
  extractionEvidence: ExtractionEvidence;
}

export type NumberingMode = "NUMBERED" | "NUMBERING_ABSENT_SOURCE_DEFECT" | "NUMBERING_INCONSISTENT";

export type FiliereVerdict = "SAFE" | "QUARANTINED_NUMBERING_ABSENT" | "QUARANTINED_STRUCTURE_AMBIGUOUS";

export type RegionRowStatus = "PARSED" | "ZERO_ROWS_CONFIRMED" | "REGION_NOT_PARSED";

export interface RegionBlockResult {
  region: string;
  rowCount: number;
  status: RegionRowStatus;
  numberingResetOk: boolean | null; // null si non applicable (NUMBERING_ABSENT / région vide)
}

export interface FiliereSectionResultA2 {
  filiereRaw: string;
  programNormalized: string;
  pagesInvolved: number[];
  regionsDetectedInOrder: string[];
  regionMatrix: RegionBlockResult[];
  numberingMode: NumberingMode;
  numberedRowCount: number;
  parsedRowCount: number;
  structuralAnomalies: string[];
  verdict: FiliereVerdict;
  rows: SchoolProgramRowA2[];
}

export interface MinsanteA2ParseResult {
  parserVersion: string;
  filiereSections: FiliereSectionResultA2[];
  warnings: string[];
}

// ============================================================================
// Constantes structurelles (mesurées empiriquement sur le document source,
// voir MINSANTE_IMPORT_CONTRACT.md §A.2 pour les mesures brutes).
// ============================================================================
const ROW_GAP_THRESHOLD = 13.0; // pt — sépare "nouvelle ligne" (~15pt) de "suite de ligne" (~10.3-10.8pt)
const SAME_LINE_Y_EPSILON = 0.6; // pt — items partageant cette Y (± epsilon) sont sur la même ligne physique
const LABEL_COLUMN_MAX_X = 120; // pt — au-delà, on est dans la colonne ECOLES, pas REGIONS
const BASE_X_EPSILON = 1.0; // pt — tolérance pour reconnaître "début de ligne" vs "suite indentée"

/**
 * `\s*` (pas `\s+`) : sur certaines pages (ex. page 4), les items espace
 * explicites entre "Page"/N/"sur"/M sont absents du flux (incohérence de
 * police déjà observée ailleurs dans ce document, cf. "EXTRME NORD" §10) —
 * la concaténation brute produit alors "Page4sur11" sans espace. Un
 * marqueur de page raté ici hallucine du texte de pied de page dans la
 * dernière école ouverte de la page précédente.
 */
const PAGE_MARKER_RE = /Page\s*(\d+)\s*sur\s*(\d+)/i;
const FILIERE_RE = /^FILIERE\s*:\s*(.+)$/i;
const NUMBER_ROW_RE = /^(\d{1,3})\.\s*(.*)$/;

/**
 * Bande Y du bandeau République/Ministère (mesurée : 811.56 à 769.92 sur
 * les pages inspectées, avec marge). Ce bandeau est peint en FIN de flux de
 * contenu (voir en-tête du fichier) alors qu'il est positionné visuellement
 * en haut de page — au-dessus même du titre du document. Il doit être
 * retiré AVANT la fusion en lignes (et avant la restriction de fusion par
 * colonne ci-dessous), car ses fragments de texte ("REPUBLIQUE" / "DU" /
 * "CAMEROUN") traversent la frontière colonne étiquette/entrée et ne
 * reconstituent une phrase reconnaissable que si on les fusionne SANS tenir
 * compte de cette frontière — un traitement qu'on ne veut surtout pas
 * appliquer au contenu réel du tableau (voir `columnSide`). Aucun contenu
 * réel de tableau n'a été observé au-dessus de Y=758.5 sur les 11 pages.
 */
const LETTERHEAD_Y_MIN = 763;
const LETTERHEAD_Y_MAX = 816;

/**
 * Ne teste QUE la bande Y du bandeau République/Ministère — ne filtre
 * JAMAIS sur le contenu ici (un item non-vide mais composé uniquement
 * d'espace(s), ex. " ", est un séparateur RÉEL entre deux mots et doit
 * être conservé pour la concaténation brute dans `mergeLines` ; le rejeter
 * ici comme "vide après trim" a été un bug réel de ce sprint qui
 * supprimait silencieusement l'espace entre des mots légitimes comme
 * "INSTITUT" et "DES SCIENCES..." -> "INSTITUTDES SCIENCES...").
 */
function isBoilerplate(str: string, y?: number): boolean {
  if (y !== undefined && y >= LETTERHEAD_Y_MIN && y <= LETTERHEAD_Y_MAX) return true;
  return false;
}

const HEADER_ROW_RE = /^(REGIONS(\s+ECOLES)?|ECOLES)$/i;
/**
 * §4 investigation — l'en-tête République/Ministère (français + anglais)
 * n'est PAS peint en haut du flux de contenu de chaque page : il est peint
 * APRÈS le tableau principal (probablement un Form XObject d'en-tête invoqué
 * en fin de flux), alors qu'il est positionné visuellement en HAUT de page
 * (Y proche de 780-812, au-dessus du titre). Sans ce filtre post-fusion, ce
 * bloc — et le séparateur décoratif "=-=-=-=" qui l'accompagne — se
 * retrouverait halluciné comme contenu de la dernière ligne ouverte de la
 * page précédente. Découvert par inspection directe des coordonnées lors de
 * ce sprint (voir MINSANTE_IMPORT_CONTRACT.md §A.2).
 */
const LETTERHEAD_RE =
  /^(REPUBLIQUE\s+DU\s+CAMEROUN|REPUBLIC\s+OF\s+CAMEROON|Paix\s*[–\-]\s*Travail\s*[–\-]\s*Patrie|Peace\s*[–\-]\s*Work\s*[–\-]\s*Fatherland|MINISTERE\s+DE\s+LA\s+SANTE(\s+PUBLIQUE)?|MINISTRY\s+OF\s+PUBLIC\s+HEALTH)$/i;
const TITLE_RE = /^(LISTE DES ECOLES|AGREES DU MINSANTE|NELS MEDICO|AGREES|ANNEE 2025)/i;
/** Séparateur décoratif purement composé de "=" / "-" (et espaces). */
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
  x: number; // x du premier item de la ligne
  y: number;
  str: string;
}

/**
 * Fusionne les items partageant (page, y±epsilon), dans l'ordre de flux
 * fourni, en une ligne physique de texte. Ne trie JAMAIS — préserve l'ordre
 * d'entrée qui est l'ordre de peinture du document. Le filtrage du bruit
 * (en-tête République/Ministère, séparateurs, marqueurs de page, en-tête de
 * colonnes) est appliqué APRÈS fusion (`isNoiseLine`), jamais avant : ce
 * bruit est fragmenté en plusieurs items par pdf.js et ne devient
 * reconnaissable qu'une fois recomposé en ligne.
 */
/**
 * Colonne logique d'un item par sa X : la table source a deux colonnes
 * (REGIONS étroite à gauche, ECOLES large à droite). Deux items ne
 * partagent JAMAIS une ligne fusionnée s'ils sont dans des colonnes
 * différentes, même à Y quasi-identique — sans ce garde-fou, une région
 * dont le bloc ne contient qu'UNE SEULE école voit son étiquette se
 * retrouver quasiment à la même Y que cette unique ligne (le "centrage
 * vertical" d'un bloc à une seule ligne coïncide avec cette ligne), ce qui
 * fusionnerait à tort "SUD-OUEST" et "1. ST JOAN OF ARC..." en une seule
 * ligne illisible comme étiquette de région (découvert en testant ce
 * parseur contre le PDF réel, cf. MINSANTE_IMPORT_CONTRACT.md §A.2).
 */
function columnSide(x: number): "LABEL" | "ENTRY" {
  return x <= LABEL_COLUMN_MAX_X ? "LABEL" : "ENTRY";
}

/**
 * §5 investigation — ce document encode systématiquement les espaces réels
 * entre mots comme leurs PROPRES items texte autonomes (ex. un item " "
 * séparé entre "DE" et "YAOUNDE"), avec un écart X quasi nul entre items
 * adjacents dans TOUS les cas (qu'il y ait un vrai espace ou non). Preuve
 * directe (page 6) : l'item "ECOLE PRIVEE DE FORMATION DES PERSON" se
 * termine en X=311.90 et l'item suivant "NELS DE SANTE..." commence en
 * X=311.95 — écart de 0.05pt, alors qu'AUCUN item espace ne les sépare :
 * c'est le même mot "PERSONNELS" coupé par un changement de police/glyphe
 * en plein milieu, PAS deux mots. En conséquence, la fusion doit
 * concaténer les chaînes BRUTES sans jamais insérer d'espace synthétique
 * — la présence ou l'absence d'espace dans le texte fusionné doit
 * provenir UNIQUEMENT des items espace explicites déjà présents dans le
 * flux, jamais d'une heuristique de ponctuation locale (l'ancienne
 * logique "espace sauf si le fragment précédent finit par un tiret"
 * produisait "PERSON NELS" au lieu de "PERSONNELS").
 */
function mergeLines(items: CoordTextItem[]): MergedLine[] {
  const rawLines: MergedLine[] = [];
  for (const it of items) {
    if (it.str.length === 0) continue; // items marqueurs vides (largeur nulle) observés systématiquement avant le vrai item — jamais de contenu réel.
    if (isBoilerplate(it.str, it.y)) continue;
    const last = rawLines[rawLines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= SAME_LINE_Y_EPSILON && columnSide(last.x) === columnSide(it.x)) {
      last.str += it.str; // concaténation brute — voir note ci-dessus.
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

/**
 * Recolle les fragments d'un nom d'école qui s'étend sur plusieurs lignes
 * PHYSIQUES (retour à la ligne dans la cellule du tableau — Y différent,
 * contrairement à `mergeLines` qui gère la même ligne). Contrairement à un
 * retour à la ligne HTML/Word normal (qui ne coupe jamais un mot), ce
 * document coupe parfois un mot en plein milieu au niveau du retour à la
 * ligne SANS trait d'union (ex. page 6 : ligne 1 se termine par l'orphelin
 * "F", ligne 2 commence par "ORMATION..." -> doit redevenir "FORMATION",
 * jamais "F ORMATION"). Signal retenu, avec preuve directe (pas une
 * supposition) : un retour à la ligne normal ne laisse jamais un fragment
 * final d'UNE SEULE lettre isolée après le dernier espace — un mot réel de
 * 1 lettre en fin de ligne coupée serait une coïncidence extraordinaire
 * dans ce corpus (noms d'établissements). Quand ce cas se présente, on
 * concatène SANS espace ; sinon on insère un espace (comportement par
 * défaut, correct pour l'immense majorité des retours à la ligne réels,
 * ex. "...SAINT MAURICE DE" + "BAFOUSSAM" -> doit garder l'espace).
 */
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

function parseFiliereSection(filiereRaw: string, programNormalized: string, lines: MergedLine[]): FiliereSectionResultA2 {
  const structuralAnomalies: string[] = [];
  const pagesInvolved = Array.from(new Set(lines.map((l) => l.page))).sort((a, b) => a - b);

  // Passe 1 : déterminer la X de base de la colonne ECOLES (la valeur la
  // plus petite parmi les X de "début de ligne" apparaissant plusieurs
  // fois — la colonne région étant toujours < LABEL_COLUMN_MAX_X).
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

  // Passe 2 : parcours en ordre de flux, construction des lignes région +
  // écoles. JAMAIS de tri par Y.
  let currentRegion: string | null = null;
  let currentRegionLabelPage: number | null = null;
  let currentRegionLabelY: number | null = null;
  let currentRegionLabelText: string | null = null;
  const regionsInOrder: string[] = [];
  const rows: SchoolProgramRowA2[] = [];
  let openRow: OpenRow | null = null;
  // §5 — suit la DERNIÈRE LIGNE PHYSIQUE traitée dans la colonne ECOLES
  // (nouvelle ligne OU suite), jamais seulement le début de ligne de la
  // ligne ouverte : un nom d'école déroulé sur 3 lignes physiques ou plus
  // doit comparer chaque écart LOCALEMENT (ligne à ligne), pas cumulé
  // depuis le début de la ligne — sinon l'écart cumulé dépasse le seuil et
  // une suite légitime est prise à tort pour une nouvelle ligne.
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

  for (const line of lines) {
    if (line.x <= LABEL_COLUMN_MAX_X) {
      // Candidat étiquette région.
      const key = regionKeyFromToken(line.str);
      if (key) {
        closeOpenRow();
        // Répétition ADJACENTE de la même région (ex. bloc qui continue
        // après un saut de page) -> fusion silencieuse, PAS une anomalie.
        if (regionsInOrder.length === 0 || regionsInOrder[regionsInOrder.length - 1] !== key) {
          if (regionsInOrder.includes(key)) {
            structuralAnomalies.push(
              `REGION_LABEL_NONADJACENT_REPEAT: "${key}" réapparaît après une autre région (page ${line.page}, y=${line.y}) — association région/ligne non fiable.`
            );
          }
          regionsInOrder.push(key);
        }
        currentRegion = key;
        currentRegionLabelPage = line.page;
        currentRegionLabelY = line.y;
        currentRegionLabelText = line.str;
        lastLineY = null;
        lastLinePage = null;
        continue;
      }
      // X dans la colonne région mais texte non reconnu comme région
      // officielle -> ambigu, fail-closed (pas de nom de région inventé).
      unknownLabels.push(`"${line.str}" (page ${line.page}, y=${line.y})`);
      continue;
    }

    // Colonne ECOLES.
    if (currentRegion === null) {
      // Contenu école avant toute étiquette région détectée -> ambigu.
      structuralAnomalies.push(`ENTRY_BEFORE_REGION_LABEL: contenu détecté (page ${line.page}, y=${line.y}) avant toute étiquette région dans cette filière.`);
      continue;
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
      continue;
    }

    // Pas de numéro : décider "nouvelle ligne" vs "suite" par la
    // combinaison X de base + seuil d'écart Y LOCAL (hauteur de ligne du
    // tableau, comparée à la ligne physique précédente, pas au début de la
    // ligne ouverte — un nom d'école peut se dérouler sur 3+ lignes
    // physiques). Un changement de PAGE (bloc région qui continue au-delà
    // d'un saut de page) rend la comparaison Y directe invalide (l'origine
    // Y repart en haut de la page suivante) — dans ce cas, une ligne à la X
    // de base est toujours traitée comme une NOUVELLE ligne, jamais comme
    // suite d'une ligne de la page précédente.
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
      continue;
    }

    // Suite de la ligne courante (indentation ou petit écart Y local).
    if (openRow) {
      (openRow as OpenRow).schoolNameParts.push(line.str);
    } else {
      structuralAnomalies.push(`UNATTACHED_CONTINUATION: fragment "${line.str.slice(0, 60)}" (page ${line.page}, y=${line.y}) sans ligne ouverte à rattacher.`);
    }
    lastLineY = line.y;
    lastLinePage = line.page;
  }
  closeOpenRow();

  if (unknownLabels.length > 0) {
    structuralAnomalies.push(`UNKNOWN_REGION_LABEL: ${unknownLabels.length} étiquette(s) dans la colonne région non reconnue(s) : ${unknownLabels.slice(0, 5).join("; ")}${unknownLabels.length > 5 ? "…" : ""}`);
  }

  // Numérotation : mode global de la section.
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

  // Réconciliation de numérotation par région (uniquement si NUMBERED).
  // §8 fail-closed — DEUX passes, jamais une seule : la première calcule
  // TOUTES les anomalies NUMBERING_GAP (une par région), la seconde décide
  // ZERO_ROWS_CONFIRMED vs REGION_NOT_PARSED pour les régions jamais vues
  // en se basant sur la liste D'ANOMALIES COMPLÈTE. Une seule passe ferait
  // dépendre le verdict d'une région de l'ORDRE ARBITRAIRE de
  // REGION_CANONICAL_LIST (ex. "Adamaoua", traité en premier, ne verrait
  // pas encore l'anomalie détectée plus tard pour "Centre" et serait donc
  // classé ZERO_ROWS_CONFIRMED à tort) — bug réel trouvé par les tests de
  // ce sprint (cf. §15.H).
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
      // Étiquette vue dans le document, mais 0 ligne rattachée avant la
      // limite suivante -> confirmé par construction (détection
      // indépendante du numéro), pas une perte de parsing.
      status = "ZERO_ROWS_CONFIRMED";
    } else if (structuralAnomalies.length === 0) {
      // Aucune anomalie ailleurs dans la section (liste COMPLÈTE, deux
      // passes) -> confiance suffisante pour traiter l'absence totale de
      // l'étiquette comme un zéro réel (omission éditoriale légitime),
      // PAS une conversion aveugle.
      status = "ZERO_ROWS_CONFIRMED";
    } else {
      // Section par ailleurs anormale -> on ne peut pas garantir que
      // l'étiquette n'a pas été manquée. Fail-closed.
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
  };
}

/**
 * Point d'entrée. `pagesItems[i]` doit être les items de la page i+1, DANS
 * L'ORDRE DE FLUX DE CONTENU d'origine (jamais trié par Y) — voir
 * `pdfCoordinateLoader.ts` pour le producteur canonique de cette forme
 * depuis un PDF réel via pdf.js.
 */
export function parseMinsanteA2(pagesItems: CoordTextItem[][]): MinsanteA2ParseResult {
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

  const warnings: string[] = [];
  const filiereSections: FiliereSectionResultA2[] = [];

  for (let i = 0; i < filiereStarts.length; i++) {
    const { index, label } = filiereStarts[i];
    const sectionEnd = i + 1 < filiereStarts.length ? filiereStarts[i + 1].index : allItems.length;
    const sectionItems = allItems.slice(index + 1, sectionEnd);

    const key = normalizeFiliereKey(label);
    const known = OFFICIAL_PROGRAMS[key];
    if (!known) {
      throw new Error(
        `PDF EXTRACTION STOP — filière inconnue "${label}" (normalisée "${key}") absente du vocabulaire officiel (${Object.keys(OFFICIAL_PROGRAMS).length} filières connues). Changement de structure majeur.`
      );
    }

    const lines = mergeLines(sectionItems);
    const section = parseFiliereSection(label, known, lines);
    filiereSections.push(section);
    if (section.verdict !== "SAFE") {
      warnings.push(`Filière "${label}" : verdict ${section.verdict} (${section.structuralAnomalies.length} anomalie(s), numberingMode=${section.numberingMode}).`);
    }
  }

  if (filiereSections.length !== Object.keys(OFFICIAL_PROGRAMS).length) {
    warnings.push(`Attention : ${filiereSections.length}/${Object.keys(OFFICIAL_PROGRAMS).length} filières officielles détectées dans ce document — vocabulaire incomplet ou document tronqué.`);
  }

  return { parserVersion: PARSER_VERSION, filiereSections, warnings };
}
