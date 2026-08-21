/**
 * SPRINT MINSANTE-I §4-5 — chargeur PDF conscient des coordonnées, basé sur
 * `pdfjs-dist` (moteur de rendu PDF de Mozilla, disponible hors-ligne dans
 * ce paquet via `node_modules/pdfjs-dist`, voir package.json). Séparé de
 * `pdfMinsanteA2.ts` (logique pure, testable sans PDF réel) : ce module est
 * la SEULE dépendance d'exécution vers `pdfjs-dist`.
 *
 * Fournit les items texte de chaque page dans leur ORDRE DE FLUX DE CONTENU
 * D'ORIGINE (l'ordre `pdf.js` restitue par défaut — l'ordre de peinture du
 * document), jamais trié par position. C'est ce qui permet au parseur A.2
 * de préserver la relation "étiquette de région avant sa première école",
 * même quand la coordonnée Y de l'étiquette la place visuellement au milieu
 * de son bloc (cellule fusionnée centrée verticalement — voir
 * pdfMinsanteA2.ts en-tête).
 */

import type { CoordTextItem } from "./pdfMinsanteA2";

export interface PdfLoadResult {
  numPages: number;
  pages: CoordTextItem[][];
}

/**
 * Charge un PDF depuis ses octets bruts et retourne, pour chaque page (1
 * à N, dans l'ordre), la liste de ses items texte avec coordonnées
 * (origine PDF : Y croissant vers le haut de la page).
 *
 * Aucun `catch` ici : une page illisible ou un PDF corrompu doit faire
 * échouer l'appelant (§7 REGISTRY_EXTRACTION_SAFETY.md — jamais de tableau
 * vide silencieux en cas d'échec réel).
 */
export async function loadPdfCoordinateItems(pdfBytes: Uint8Array): Promise<PdfLoadResult> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: pdfBytes, disableFontFace: true, useSystemFonts: false }).promise;
  const pages: CoordTextItem[][] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items: CoordTextItem[] = content.items
      .filter((it: any) => typeof it.str === "string")
      .map((it: any) => ({
        page: pageNum,
        x: Math.round(it.transform[4] * 100) / 100,
        y: Math.round(it.transform[5] * 100) / 100,
        str: it.str as string,
      }));
    pages.push(items);
  }
  return { numPages: doc.numPages, pages };
}
