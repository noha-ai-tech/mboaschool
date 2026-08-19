/**
 * SPRINT R.2-SAFETY §11, §26-27 — Extraction HTML DÉTERMINISTE (regex sur le
 * DOM texte, jamais un résumé IA) pour les sources HTML_TABLE / HTML_LIST.
 * Généralise la méthode qui a retrouvé les 231 établissements de Yaoundé
 * après l'incident du résumé IA (~10) — voir REGISTRY_EXTRACTION_SAFETY.md.
 */

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è");
}

export interface HtmlSection {
  title: string;
  html: string;
}

/**
 * Segmente un document HTML par ses titres `<h3>` (ou autre niveau) —
 * pattern observé sur les pages Osidimbea (une section par arrondissement).
 * Si aucun titre ne correspond, retourne une seule section couvrant tout le
 * document (`title: "__all__"`) plutôt que d'échouer silencieusement.
 */
export function segmentByHeading(html: string, headingMatch: RegExp, level: "h2" | "h3" | "h4" = "h3"): HtmlSection[] {
  const re = new RegExp(`<${level}[^>]*>([^<]*)</${level}>`, "g");
  const heads: { title: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (headingMatch.test(m[1])) heads.push({ title: m[1].trim(), idx: m.index });
  }
  if (heads.length === 0) return [{ title: "__all__", html }];
  return heads.map((h, i) => ({
    title: h.title,
    html: html.slice(h.idx, i + 1 < heads.length ? heads[i + 1].idx : html.length),
  }));
}

export interface TableExtractionOptions {
  /** Cellules à ignorer telles quelles (en-têtes de colonnes, ex. "Type", "Date de création"). */
  ignoreCellText: string[];
  minCellLength?: number;
  /**
   * Index (0-based) de la colonne contenant le nom de l'établissement.
   * Défaut 0 (colonne 1) — le cas le plus fréquent observé (Osidimbea
   * "Etablissement | Type | Date de création"). Certaines sources inversent
   * l'ordre (ex. memoirecentre0.jimdofree.com/.../mfoundi-catholiques/ :
   * "Type d'enseignement | Nom de l'établissement | Localisation | Date") —
   * l'appelant DOIT vérifier la ligne d'en-tête réelle avant de fixer cette
   * valeur, jamais la supposer par analogie avec une autre page du même site.
   */
  nameColumnIndex?: number;
}

/**
 * Extrait une cellule déterminée (`nameColumnIndex`, colonne 1 par défaut)
 * de chaque ligne `<tr><td>...</td>...</tr>` d'un fragment HTML.
 *
 * Itère PAR LIGNE (`<tr>`) et ne prend que la cellule ciblée de chacune —
 * une version antérieure scannait tous les `<td>` du fragment sans distinguer
 * les lignes, ce qui laissait fuiter les colonnes "Type"/"Date de création"
 * (ex. "Général", "Technique", "Normal", "Mixte") dès qu'elles dépassaient
 * `minCellLength` et n'étaient pas explicitement dans `ignoreCellText` —
 * détecté en re-testant le framework sur les pages memoire*0.jimdofree.com
 * (tables 3 colonnes), absentes des fixtures de test initiales.
 *
 * Retourne les valeurs BRUTES dédupliquées à l'intérieur du fragment — la
 * déduplication inter-fragments/inter-source reste à la charge de l'appelant
 * (§35 : jamais dédupliquer avant d'avoir validé la complétude).
 */
export function extractTableFirstColumn(html: string, options: TableExtractionOptions): string[] {
  const ignore = new Set(options.ignoreCellText);
  const minLen = options.minCellLength ?? 4;
  const colIndex = options.nameColumnIndex ?? 0;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const values: string[] = [];
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = trRe.exec(html))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    const targetCell = cells[colIndex];
    if (!targetCell) continue;
    let text = decodeHtmlEntities(targetCell[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text || ignore.has(text) || text.length < minLen) continue;
    if (/^\d{4}$/.test(text)) continue; // année seule (colonne "Date de création")
    const opens = (text.match(/\(/g) ?? []).length;
    const closes = (text.match(/\)/g) ?? []).length;
    if (opens > closes) text += ")"; // troncature HTML observée en fin de cellule
    values.push(text);
  }
  return values;
}

/**
 * Extrait le texte de chaque `<option value="...">texte</option>` d'un menu
 * déroulant — pattern observé sur la page "LISTE DE TOUS LES COLLEGES"
 * (Osidimbea Douala). `minLabelLength` filtre les options placeholder vides
 * ("Cliquez sur le collège à consulter :", options vestigiales "COLLEGE" seules).
 */
export function extractSelectOptions(html: string, { excludeContains = [], minLabelLength = 4 }: { excludeContains?: string[]; minLabelLength?: number } = {}): string[] {
  const optRe = /<option[^>]*value="[^"]*"[^>]*>([\s\S]*?)<\/option>/g;
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(html))) {
    const text = decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim();
    if (!text || text.length < minLabelLength) continue;
    if (excludeContains.some((frag) => text.includes(frag))) continue;
    values.push(text);
  }
  return values;
}

/**
 * SPRINT MINESEC V1.1 — comme extractSelectOptions, mais conserve aussi
 * l'attribut `value` de chaque `<option>` (ex. un matricule officiel), pas
 * seulement son libellé texte. Nécessaire dès qu'une source encode une
 * donnée structurée (identifiant) dans `value` plutôt que dans le texte
 * affiché — cas non couvert par extractSelectOptions (cartescolaire.cm/minesec :
 * `<option value="MATRICULE">NOM ÉTABLISSEMENT</option>`).
 */
export function extractSelectOptionPairs(
  html: string,
  { excludeContains = [], minLabelLength = 4 }: { excludeContains?: string[]; minLabelLength?: number } = {}
): { value: string; label: string }[] {
  const optRe = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g;
  const pairs: { value: string; label: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(html))) {
    const value = decodeHtmlEntities(m[1]).trim();
    const label = decodeHtmlEntities(m[2]).replace(/\s+/g, " ").trim();
    if (!label || label.length < minLabelLength) continue;
    if (excludeContains.some((frag) => label.includes(frag))) continue;
    pairs.push({ value, label });
  }
  return pairs;
}
