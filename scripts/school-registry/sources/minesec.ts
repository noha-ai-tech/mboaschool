import * as cheerio from "cheerio";
import type { RawSourceRecord, SourceAdapter } from "../types";
import { politeFetchText } from "../lib/politeFetch";

// ============================================================================
// Adaptateur MINESEC — Répertoire des Établissements ESG
// (Enseignement Secondaire Général)
//
// Source : https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg
//
// Statut de vérification — voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md :
//   - Structure de page (colonnes, pagination) CONFIRMÉE par consultation
//     de la page réelle (2026-08-07).
//   - Sélecteurs CSS ci-dessous établis à partir de la structure Joomla
//     standard observée pour ce type de listing — À VALIDER contre le HTML
//     réel avant tout import à l'échelle (l'environnement d'exécution de
//     cette mission n'a pas d'accès réseau sortant fiable vers ce site
//     précis — voir SOURCE_CATALOG.md, section "Accessibilité technique").
//   - Cette page ne couvre QUE l'enseignement secondaire général (ESG) —
//     pas le technique. Aucune source MINESEC pour le technique n'a été
//     identifiée à ce stade.
//   - Région/Département/Arrondissement sont des CRITÈRES DE FILTRE sur ce
//     site, PAS des colonnes affichées par ligne. Un import complet doit
//     itérer les combinaisons de filtres pour capturer cette hiérarchie
//     administrative par établissement — non implémenté dans cette version
//     (voir IMPORT_RUNBOOK.md, limitations connues).
// ============================================================================

const BASE_URL =
  "https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg";
const SOURCE_YEAR = null; // aucune date de publication affichée sur la page — à confirmer manuellement

export interface MinesecAdapterOptions {
  /** Permet d'injecter un fetch alternatif (fixture locale) pour les tests hors-ligne. */
  htmlFetcher?: (url: string) => Promise<string>;
  /** Limite le nombre de pages parcourues (utile en test ; illimité par défaut). */
  maxPages?: number | null;
  /** Nombre d'enregistrements par page demandé au serveur. */
  pageSize?: number;
}

function parseListingPage(html: string): {
  rows: RawSourceRecord[];
  totalPagesLabel: string | null;
} {
  const $ = cheerio.load(html);
  const rows: RawSourceRecord[] = [];

  // Sélecteur best-effort pour une table Joomla standard — à ajuster contre
  // le HTML réel (voir avertissement en tête de fichier).
  $("table tr").each((_, el) => {
    const cells = $(el)
      .find("td")
      .map((__, td) => $(td).text().trim())
      .get();

    if (cells.length < 5) return; // ligne d'en-tête ou structure inattendue, ignorée

    const [nameRaw, locality, cycles, subsystemRaw, matricule] = cells;
    if (!nameRaw || nameRaw.length === 0) return;

    rows.push({
      sourceMinistry: "MINESEC",
      sourceUrl: BASE_URL,
      sourceYear: SOURCE_YEAR,
      officialIdentifier: matricule && matricule.trim().length > 0 ? matricule.trim() : null,
      raw: { nom: nameRaw, localite: locality, cycles, sousSysteme: subsystemRaw, matricule },
      nameRaw,
      region: null, // non disponible par ligne sur ce listing — voir avertissement
      department: null,
      arrondissement: null,
      commune: null,
      locality: locality || null,
      city: null,
      quarter: null,
      subsystemRaw: subsystemRaw || null,
      educationFamilyHint: cycles || null,
      ownershipHint: null, // non disponible sur ce listing
    });
  });

  const totalPagesMatch = $("body").text().match(/Page\s+\d+\s+(?:sur|of)\s+(\d+)/i);
  return { rows, totalPagesLabel: totalPagesMatch ? totalPagesMatch[0] : null };
}

export function createMinesecAdapter(options: MinesecAdapterOptions = {}): SourceAdapter {
  const pageSize = options.pageSize ?? 20;
  const fetcher = options.htmlFetcher ?? ((url: string) => politeFetchText(url));

  return {
    ministry: "MINESEC",
    sourceName: "Répertoire des Établissements ESG",

    async fetchAll(): Promise<RawSourceRecord[]> {
      const allRows: RawSourceRecord[] = [];
      let pageIndex = 0;
      let totalPages: number | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (options.maxPages != null && pageIndex >= options.maxPages) break;

        const limitstart = pageIndex * pageSize;
        const url = pageIndex === 0 ? BASE_URL : `${BASE_URL}?limitstart13=${limitstart}`;
        const html = await fetcher(url);
        const { rows, totalPagesLabel } = parseListingPage(html);

        if (rows.length === 0) break;
        allRows.push(...rows);

        if (totalPagesLabel && totalPages === null) {
          const match = totalPagesLabel.match(/(\d+)\s*$/);
          if (match) totalPages = parseInt(match[1], 10);
        }

        pageIndex++;
        if (totalPages !== null && pageIndex >= totalPages) break;
      }

      return allRows;
    },
  };
}
