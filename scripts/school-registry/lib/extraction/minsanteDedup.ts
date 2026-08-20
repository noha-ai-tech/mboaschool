import { createHash } from "node:crypto";
import { exactIdentityKey, fuzzyWords } from "../matching/engine";
import type { RawSchoolProgramRow } from "./pdfMinsanteA1";

/**
 * SPRINT MINSANTE-A.1 §8-9 — Une même école peut apparaître sous plusieurs
 * filières (une SchoolProgramRow par couple école×filière). Ce module
 * transforme ces lignes en UniqueSchoolCandidate (un établissement =
 * plusieurs filières en attribut), avec un contrat de sécurité strict :
 *
 *  - EXACT_SAME_SCHOOL : clé d'identité EXACTE (réutilise `exactIdentityKey`
 *    du moteur de matching partagé — accents/casse retirés, mots de
 *    catégorie PRÉSERVÉS, jamais un fuzzy) + même région -> fusion
 *    automatique en UN SEUL candidat, filières unies.
 *  - LIKELY_SAME_SCHOOL / AMBIGUOUS : signalés dans un rapport de revue,
 *    JAMAIS fusionnés automatiquement (§9 : "pas de fuzzy auto merge").
 *  - DISTINCT : aucun signal — pas de fusion, pas de rapport.
 *
 * Ordre respecté : EXTRACT (pdfMinsanteA1.ts) -> ACCOUNT -> DEDUP (ce
 * module), jamais l'inverse (REGISTRY_EXTRACTION_SAFETY.md "Ordre
 * obligatoire").
 */

export type DedupRelationship = "EXACT_SAME_SCHOOL" | "LIKELY_SAME_SCHOOL" | "AMBIGUOUS" | "DISTINCT";

export interface UniqueSchoolCandidate {
  id: string;
  region: string;
  /** Premier nom brut rencontré pour ce groupe — jamais une valeur inventée/corrigée. */
  displayName: string;
  normalizedKey: string;
  programsNormalized: string[];
  programsRaw: string[];
  sourceLines: number[];
  /** Nombre de SchoolProgramRow fusionnées (EXACT_SAME_SCHOOL uniquement) dans ce candidat. */
  mergedRowCount: number;
  /** Tous les noms bruts observés dans ce groupe exact (généralement 1, peut différer par filière si micro-variation de ponctuation/espace absorbée par exactIdentityKey). */
  rawNameVariants: string[];
}

export interface DedupReviewEntry {
  relationship: Exclude<DedupRelationship, "DISTINCT" | "EXACT_SAME_SCHOOL">;
  schoolAId: string;
  schoolAName: string;
  schoolARegion: string;
  schoolBId: string;
  schoolBName: string;
  schoolBRegion: string;
  overlapRatio: number;
  reason: string;
}

export interface DedupResult {
  candidates: UniqueSchoolCandidate[];
  reviewEntries: DedupReviewEntry[];
  exactMergeCount: number;
  totalInputRows: number;
}

function candidateId(region: string, normalizedKey: string): string {
  return createHash("sha256").update(`${region}|${normalizedKey}`, "utf-8").digest("hex").slice(0, 16);
}

function wordOverlapMinRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const aSet = new Set(a);
  const intersection = a.filter((w) => bSet.has(w)).length;
  return Math.min(intersection / aSet.size, intersection / bSet.size);
}

/**
 * §8 — Groupe les SchoolProgramRow en UniqueSchoolCandidate par
 * (région, exactIdentityKey) — la SEULE base de fusion automatique
 * autorisée. §9 — classe ensuite les paires de candidats restants
 * (LIKELY_SAME_SCHOOL / AMBIGUOUS / DISTINCT) sans jamais les fusionner.
 */
export function buildUniqueSchoolCandidates(rows: RawSchoolProgramRow[]): DedupResult {
  const groups = new Map<string, RawSchoolProgramRow[]>();
  for (const row of rows) {
    const key = `${row.region}|${exactIdentityKey(row.rawSchoolName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const candidates: UniqueSchoolCandidate[] = [];
  for (const [key, groupRows] of groups) {
    const region = groupRows[0].region;
    const normalizedKey = exactIdentityKey(groupRows[0].rawSchoolName);
    const displayName = groupRows[0].rawSchoolName;
    const rawNameVariants = Array.from(new Set(groupRows.map((r) => r.rawSchoolName)));
    const programsNormalized = Array.from(new Set(groupRows.map((r) => r.programNormalized))).sort();
    const programsRaw = Array.from(new Set(groupRows.map((r) => r.filiereRaw))).sort();
    const sourceLines = groupRows.map((r) => r.sourceLine).sort((a, b) => a - b);

    candidates.push({
      id: candidateId(region, normalizedKey),
      region,
      displayName,
      normalizedKey,
      programsNormalized,
      programsRaw,
      sourceLines,
      mergedRowCount: groupRows.length,
      rawNameVariants,
    });
    void key;
  }

  // §9 — comparaison par paires du résultat POST-fusion exacte uniquement
  // (deux candidats ne peuvent plus partager la même (région, clé exacte) à
  // ce stade par construction). Jamais O(n²) global irréaliste ici : ~100-
  // 200 candidats attendus pour ce document, coût négligeable.
  const reviewEntries: DedupReviewEntry[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      // Collision de nom EXACT mais région différente — jamais fusionné
      // (§9), mais anomalie notable : signalée en AMBIGUOUS explicite.
      if (a.normalizedKey === b.normalizedKey && a.region !== b.region) {
        reviewEntries.push({
          relationship: "AMBIGUOUS",
          schoolAId: a.id,
          schoolAName: a.displayName,
          schoolARegion: a.region,
          schoolBId: b.id,
          schoolBName: b.displayName,
          schoolBRegion: b.region,
          overlapRatio: 1,
          reason: "Nom normalisé strictement identique mais région différente dans le document source — collision de nom entre deux régions, ou possible erreur d'assignation région en amont. Jamais fusionné automatiquement, revue humaine requise.",
        });
        continue;
      }

      if (a.region !== b.region) continue; // §9 — la région est une partition dure pour LIKELY/AMBIGUOUS, jamais comparée entre régions différentes sauf collision de nom ci-dessus.

      const aWords = fuzzyWords(a.displayName);
      const bWords = fuzzyWords(b.displayName);
      const ratio = wordOverlapMinRatio(aWords, bWords);

      // SPRINT MINSANTE-B §8.C — bug réel trouvé APRÈS durcissement des
      // FUZZY_STOPWORDS (santé/sanitaire/personnel/formation/centre/medico
      // ajoutés au moteur partagé, voir engine.ts) : l'ancien calcul
      // `normalizedKey.includes(...)` comparait des clés ALPHABÉTISÉES
      // (exactIdentityKey trie les mots) — un mot distinctif inséré au
      // milieu de l'ordre alphabétique (ex. "NGAOUNDERE" entre "ISSTMADD" et
      // "PERSONNEL") cassait la contiguïté de sous-chaîne même quand une
      // variante était structurellement un sur-ensemble exact de l'autre.
      // Cas réel régressé par le durcissement : "ECOLE DE FORMATION DU
      // PERSONNEL DE SANTE ISSTMADD" vs sa variante "(NGAOUNDERE)" tombait
      // de LIKELY_SAME_SCHOOL à AMBIGUOUS une fois formation/personnel/sante
      // retirés (ratio 0.8 -> 0.5, sous le seuil sans la relation
      // sous-ensemble). Remplacé par un vrai test d'inclusion ENSEMBLISTE
      // sur les mots significatifs (ordre non pertinent, exactement ce que
      // "une variante est un sur-ensemble de l'autre" doit vérifier) —
      // jamais un signal d'auto-fusion (§9 toujours respecté), seulement un
      // signal LIKELY_SAME_SCHOOL plus fiable pour la revue humaine.
      const aWordSet = new Set(aWords);
      const bWordSet = new Set(bWords);
      const oneIsWordSubsetOfOther =
        (aWords.length > 0 && aWords.every((w) => bWordSet.has(w))) ||
        (bWords.length > 0 && bWords.every((w) => aWordSet.has(w)));

      if (ratio === 0 && !oneIsWordSubsetOfOther) continue; // DISTINCT — pas de rapport.

      if (ratio >= 0.8 || (oneIsWordSubsetOfOther && ratio >= 0.5)) {
        reviewEntries.push({
          relationship: "LIKELY_SAME_SCHOOL",
          schoolAId: a.id,
          schoolAName: a.displayName,
          schoolARegion: a.region,
          schoolBId: b.id,
          schoolBName: b.displayName,
          schoolBRegion: b.region,
          overlapRatio: ratio,
          reason: `Chevauchement de mots significatifs élevé (${Math.round(ratio * 100)}%)${oneIsWordSubsetOfOther ? " + mots significatifs d'un candidat inclus dans l'autre" : ""}, même région — probablement la même école (variante de saisie), mais PAS fusionné automatiquement (§9 : pas de fuzzy auto merge).`,
        });
      } else if (ratio >= 0.34) {
        reviewEntries.push({
          relationship: "AMBIGUOUS",
          schoolAId: a.id,
          schoolAName: a.displayName,
          schoolARegion: a.region,
          schoolBId: b.id,
          schoolBName: b.displayName,
          schoolBRegion: b.region,
          overlapRatio: ratio,
          reason: `Chevauchement de mots partiel (${Math.round(ratio * 100)}%), même région — ambigu, ne peut pas être classé automatiquement. Reste deux candidats séparés (§9).`,
        });
      }
      // ratio > 0 mais < 0.34 et pas de relation sous-chaîne -> DISTINCT, aucun rapport (bruit).
    }
  }

  return {
    candidates: candidates.sort((a, b) => a.region.localeCompare(b.region) || a.displayName.localeCompare(b.displayName)),
    reviewEntries,
    exactMergeCount: rows.length - candidates.length,
    totalInputRows: rows.length,
  };
}
