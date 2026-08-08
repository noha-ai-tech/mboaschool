/**
 * Fetch "poli" pour les sources gouvernementales : User-Agent identifiable,
 * délai entre requêtes, retries avec backoff. Aucune source dont l'accès
 * automatisé est explicitement interdit (robots.txt, mentions légales) ne
 * doit être appelée avec cette fonction sans revue préalable — voir
 * docs/03_DATA_REGISTRY/SOURCE_CATALOG.md pour le statut de chaque source.
 */

const USER_AGENT = "Ecoles237-Registry-Bot/0.1 (+contact: enwaha22@gmail.com)";

export interface PoliteFetchOptions {
  delayMsBetweenCalls?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<PoliteFetchOptions> = {
  delayMsBetweenCalls: 1500,
  maxRetries: 3,
  timeoutMs: 30000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Effectue une requête GET avec délai, timeout et retries.
 * NOTE : les sites gouvernementaux camerounais observés pendant cette mission
 * peuvent répondre lentement (voir SOURCE_CATALOG.md, note MINESEC) —
 * le timeout par défaut (30s) est volontairement généreux.
 */
export async function politeFetchText(
  url: string,
  options: PoliteFetchOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} pour ${url}`);
      }

      const text = await response.text();
      await sleep(opts.delayMsBetweenCalls);
      return text;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      const backoffMs = opts.delayMsBetweenCalls * attempt * 2;
      if (attempt < opts.maxRetries) {
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(
    `Échec après ${opts.maxRetries} tentatives pour ${url} : ${String(lastError)}`
  );
}
