import { sha256 } from "./hashing";
import type { PaginationAccounting } from "./types";

/**
 * SPRINT R.2-SAFETY §19-23 — Suivi générique de pagination. Un extracteur
 * paginé appelle `tracker.recordPage(pageId, content)` à chaque page fetchée,
 * puis `tracker.finalize(pagesExpected)` pour obtenir le verdict.
 */
export class PaginationTracker {
  private fetchedPageIds: (string | number)[] = [];
  private pageFingerprints: Record<string, string> = {};
  private loopDetected = false;

  /** §20 — une page dont l'empreinte de contenu est identique à une page déjà vue = boucle. */
  recordPage(pageId: string | number, content: string): void {
    const fingerprint = sha256(content);
    const existingId = Object.entries(this.pageFingerprints).find(([, fp]) => fp === fingerprint)?.[0];
    if (existingId !== undefined && String(existingId) !== String(pageId)) {
      this.loopDetected = true;
    }
    this.fetchedPageIds.push(pageId);
    this.pageFingerprints[String(pageId)] = fingerprint;
  }

  /**
   * §21 — trou de pagination : les IDs de page fetchées ne forment pas une
   * séquence contiguë 1..N (ex. 1,2,3,5 — page 4 absente). Ne s'applique
   * qu'aux pages numériques séquentielles ; un curseur opaque doit être
   * vérifié différemment par l'appelant (§18 : "stable cursor termination").
   */
  private detectGap(): boolean {
    const numericIds = this.fetchedPageIds
      .filter((id): id is number => typeof id === "number" || /^\d+$/.test(String(id)))
      .map(Number)
      .sort((a, b) => a - b);
    if (numericIds.length < 2) return false;
    for (let i = 1; i < numericIds.length; i++) {
      if (numericIds[i] - numericIds[i - 1] > 1) return true;
    }
    return false;
  }

  finalize(pagesExpected: number | null): PaginationAccounting {
    return {
      pagesExpected,
      pagesFetched: this.fetchedPageIds.length,
      fetchedPageIds: [...this.fetchedPageIds],
      pageFingerprints: { ...this.pageFingerprints },
      gapDetected: this.detectGap(),
      loopDetected: this.loopDetected,
    };
  }
}

/** §23 — retry borné avec backoff, jamais infini. Rapporte attempts + statut final (§23). */
export async function fetchWithRetry(
  fn: () => Promise<Response>,
  { maxAttempts = 3, baseDelayMs = 500 }: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<{ response: Response | null; attempts: number; finalError: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fn();
      // §23 — retry seulement sur erreurs temporaires (429/5xx), jamais sur 4xx durables.
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status}`;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
          continue;
        }
        return { response, attempts: attempt, finalError: lastError };
      }
      return { response, attempts: attempt, finalError: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  return { response: null, attempts: maxAttempts, finalError: lastError };
}
