/**
 * Client minimal pour les listes Joomla/Fabrik filtrables du type utilisé par
 * le "carte scolaire numérique" de MINESEC (SPRINT N, Batch 001).
 *
 * Ces listes exposent des filtres serveur (région, département, ...) via un
 * <form method="post"> classique, protégé par un jeton anti-CSRF Joomla
 * (nom de champ = hash, valeur "1"), et paginent via un paramètre
 * `limitstart<N>` où N est l'id numérique de la liste Fabrik. Ce module :
 *   1. Récupère la page une première fois (GET) pour capturer le cookie de
 *      session Joomla + le jeton CSRF courant.
 *   2. Rejoue le formulaire de filtre en POST en ne modifiant QUE le(s)
 *      champ(s) explicitement demandé(s) — tous les autres champs du
 *      formulaire (hidden + select) sont conservés tels quels, pour ne
 *      jamais construire une requête que le site n'accepterait pas
 *      lui-même via son UI.
 *
 * Site public sans robots.txt (404 constaté) ni mention légale anti-scraping
 * — voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md. Respecte politeFetch pour
 * le délai entre requêtes.
 */

const USER_AGENT = "Ecoles237-Registry-Bot/0.1 (+contact: enwaha22@gmail.com)";

export interface FabrikListConfig {
  /** URL de la page contenant le formulaire (sans paramètres de filtre). */
  pageUrl: string;
  /** id Fabrik de la liste, ex. "13" pour list_13_com_content_13. */
  listId: string;
  /** listref exact tel qu'observé dans le HTML, ex. "13_com_content_13". */
  listRef: string;
}

interface Session {
  cookie: string;
  baseParams: [string, string][];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrait tous les champs input/select du <form id="listform_..."> et leur valeur actuelle. */
function extractFormParams(html: string, listRef: string): [string, string][] {
  const formMarker = `id="listform_${listRef}"`;
  const formStart = html.indexOf(formMarker);
  if (formStart === -1) {
    throw new Error(`Formulaire listform_${listRef} introuvable dans la page — structure inattendue.`);
  }
  const formTagStart = html.lastIndexOf("<form", formStart);
  const formEnd = html.indexOf("</form>", formTagStart);
  const formHtml = html.slice(formTagStart, formEnd);

  const params: [string, string][] = [];

  const inputRegex = /<input\s+[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRegex.exec(formHtml)) !== null) {
    const tag = m[0];
    const nameMatch = tag.match(/name="([^"]*)"/);
    if (!nameMatch) continue;
    const typeMatch = tag.match(/type="([^"]*)"/);
    const type = typeMatch ? typeMatch[1] : "text";
    if (type === "checkbox" || type === "radio") continue;
    const valueMatch = tag.match(/value="([^"]*)"/);
    params.push([nameMatch[1], valueMatch ? decodeHtmlEntities(valueMatch[1]) : ""]);
  }

  const selectRegex = /<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selectRegex.exec(formHtml)) !== null) {
    const name = m[1];
    const body = m[2];
    const selectedMatch = body.match(/<option[^>]*value="([^"]*)"[^>]*selected/i);
    params.push([name, selectedMatch ? decodeHtmlEntities(selectedMatch[1]) : ""]);
  }

  return params;
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Établit une session (cookie + jeton CSRF + valeurs par défaut du formulaire) via un GET initial. */
export async function openFabrikSession(config: FabrikListConfig): Promise<Session> {
  const res = await fetch(config.pageUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`GET initial ${config.pageUrl} -> HTTP ${res.status}`);
  const html = await res.text();
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  const baseParams = extractFormParams(html, config.listRef);
  await sleep(1200);
  return { cookie, baseParams };
}

/**
 * Rejoue le formulaire de filtre avec des overrides (ex. valeur de région,
 * page de pagination). `session` doit venir de `openFabrikSession`.
 */
export async function fetchFabrikFilteredPage(
  config: FabrikListConfig,
  session: Session,
  overrides: Record<string, string>
): Promise<string> {
  const params = new Map(session.baseParams);
  for (const [k, v] of Object.entries(overrides)) params.set(k, v);

  const body = Array.from(params.entries())
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .join("&");

  const url = `${config.pageUrl}?resetfilters=0&clearordering=0&clearfilters=0`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: config.pageUrl,
      Cookie: session.cookie,
    },
    body,
  });
  if (!res.ok) throw new Error(`POST ${url} -> HTTP ${res.status}`);
  const html = await res.text();
  await sleep(1500);
  return html;
}
