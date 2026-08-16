import * as cheerio from "cheerio";
import type { RawSourceRecord, SourceAdapter } from "../types";
import { politeFetchText } from "../lib/politeFetch";
import { openFabrikSession, fetchFabrikFilteredPage, type FabrikListConfig } from "../lib/fabrikFilterFetch";

// ============================================================================
// Adaptateur MINESEC — Registre National des Établissements, "carte scolaire
// numérique", table ESG (Enseignement Secondaire Général).
//
// SPRINT N (Batch 001) — remplace la version précédente de cet adaptateur.
// Correctifs par rapport à la version DATA-REGISTRY-01 :
//   - URL corrigée : l'ancienne URL cataloguée (350-repertoire-des-
//     etablissements-esg) répond toujours HTTP 200 mais n'a pas été
//     revérifiée ; la version courante du portail ("carte scolaire
//     numérique") vit à /fr/carte-scolaire/immatriculation-fr et a été
//     vérifiée directement (accès réseau réel disponible dans cet
//     environnement, contrairement à la mission précédente — voir
//     docs/03_DATA_REGISTRY/SOURCE_CATALOG.md, mis à jour).
//   - Les sélecteurs ne sont plus un "best-effort" : ils correspondent au
//     HTML Fabrik réel observé (classes `esg___<champ>_esg`), vérifié par
//     inspection directe du HTML brut.
//   - Ajout du filtrage serveur par région (`esg___region_esg`, via le
//     formulaire Fabrik en POST) — la version précédente ne filtrait pas et
//     aurait mélangé toutes les régions. Département/Arrondissement restent
//     de simples critères de filtre non capturés par ligne (comme documenté
//     précédemment) ; le filtrage par département n'est PAS implémenté ici
//     (limité au niveau région pour ce batch — voir rapport SPRINT N).
//   - Couverture inchangée : ESG uniquement (secondaire général). Les
//     répertoires ESTP (technique) et ENI (écoles normales), également
//     présents sur la même page sous d'autres tables Fabrik, restent hors
//     périmètre — reportés à un batch ultérieur.
// ============================================================================

const PAGE_URL = "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr";
const SOURCE_YEAR = null; // aucune date de publication affichée sur la page

const LIST_CONFIG: FabrikListConfig = {
  pageUrl: PAGE_URL,
  listId: "13",
  listRef: "13_com_content_13",
};

const REGION_FILTER_FIELD = "fabrik___filter[list_13_com_content_13][value][0]";
const LIMIT_FIELD = "limit13";
const LIMITSTART_FIELD = "limitstart13";

function parseEsgTable(html: string): RawSourceRecord[] {
  const $ = cheerio.load(html);
  const rows: RawSourceRecord[] = [];

  $(`#list_${LIST_CONFIG.listId}_com_content_${LIST_CONFIG.listId} tbody tr.fabrik_row`).each((_, el) => {
    const nameRaw = $(el).find("td.esg___nom_etablissement_esg").text().trim();
    if (!nameRaw) return;
    const locality = $(el).find("td.esg___localite_esg").text().trim();
    const cycles = $(el).find("td.esg___cycles_esg").text().trim();
    const subsystemRaw = $(el).find("td.esg___sous_systeme_esg").text().trim();
    const matricule = $(el).find("td.esg___matricule_esg").text().trim();

    rows.push({
      sourceMinistry: "MINESEC",
      sourceUrl: PAGE_URL,
      sourceYear: SOURCE_YEAR,
      officialIdentifier: matricule.length > 0 ? matricule : null,
      raw: { nom: nameRaw, localite: locality, cycles, sousSysteme: subsystemRaw, matricule },
      nameRaw,
      region: null, // rempli par fetchEsgByRegion (valeur réellement demandée au filtre serveur)
      department: null,
      arrondissement: null,
      commune: null,
      locality: locality || null,
      city: null,
      quarter: null,
      subsystemRaw: subsystemRaw || null,
      educationFamilyHint: cycles || null,
      ownershipHint: null, // non disponible sur cette table ESG
    });
  });

  return rows;
}

function extractTotalPages(html: string): number | null {
  const idx = html.indexOf(`id="list_${LIST_CONFIG.listId}_com_content_${LIST_CONFIG.listId}"`);
  if (idx === -1) return null;
  const chunk = html.slice(idx, idx + 3000);
  const match = chunk.match(/Page\s+\d+\s+sur\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

export interface FetchEsgByRegionOptions {
  /** Nombre de lignes par page demandé au serveur (max observé sur le site : 100). */
  pageSize?: number;
  /** Limite de pages parcourues — garde-fou pour les tests. `null` = jusqu'à épuisement. */
  maxPages?: number | null;
  /** Permet d'injecter une session/fetch alternatif pour les tests hors-ligne (fixture). */
  htmlFetcher?: (url: string) => Promise<string>;
}

/**
 * Récupère toutes les lignes ESG pour UNE région MINESEC (valeur exacte du
 * filtre serveur, ex. "CENTRE", "LITTORAL"), toutes pages confondues.
 * `region` sur chaque enregistrement retourné = la valeur réellement
 * demandée au filtre — jamais devinée depuis le texte de la ligne.
 */
export async function fetchEsgByRegion(
  region: string,
  options: FetchEsgByRegionOptions = {}
): Promise<{ records: RawSourceRecord[]; pagesFetched: number; totalPagesReported: number | null }> {
  const pageSize = options.pageSize ?? 100;

  if (options.htmlFetcher) {
    // Mode fixture : une seule page, pas de session Fabrik réelle nécessaire.
    const html = await options.htmlFetcher(PAGE_URL);
    const records = parseEsgTable(html).map((r) => ({ ...r, region }));
    return { records, pagesFetched: 1, totalPagesReported: extractTotalPages(html) };
  }

  const session = await openFabrikSession(LIST_CONFIG);

  const allRecords: RawSourceRecord[] = [];
  let page = 0;
  let totalPages: number | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (options.maxPages != null && page >= options.maxPages) break;

    const html = await fetchFabrikFilteredPage(LIST_CONFIG, session, {
      [REGION_FILTER_FIELD]: region,
      [LIMIT_FIELD]: String(pageSize),
      [LIMITSTART_FIELD]: String(page * pageSize),
    });

    const rows = parseEsgTable(html);
    if (rows.length === 0) break;

    for (const r of rows) allRecords.push({ ...r, region });

    if (totalPages === null) totalPages = extractTotalPages(html);

    page++;
    if (totalPages !== null && page >= totalPages) break;
  }

  return { records: allRecords, pagesFetched: page, totalPagesReported: totalPages };
}

// ── Compat DATA-REGISTRY-01 : conserve l'ancienne interface SourceAdapter
// (sans filtre région) pour le flag --fixture de run-import.ts. ────────────

export interface MinesecAdapterOptions {
  htmlFetcher?: (url: string) => Promise<string>;
  maxPages?: number | null;
  pageSize?: number;
}

export function createMinesecAdapter(options: MinesecAdapterOptions = {}): SourceAdapter {
  const fetcher = options.htmlFetcher ?? ((url: string) => politeFetchText(url));

  return {
    ministry: "MINESEC",
    sourceName: "Registre National des Établissements — carte scolaire numérique (ESG)",
    async fetchAll(): Promise<RawSourceRecord[]> {
      const html = await fetcher(PAGE_URL);
      return parseEsgTable(html);
    },
  };
}
