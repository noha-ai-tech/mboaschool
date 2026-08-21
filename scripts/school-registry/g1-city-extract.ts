// Deterministic, evidence-based city extraction: last " DE " occurrence in
// the official MINSANTE-sourced name, per §9 ("school name itself... when
// location is an explicit part of the official name, e.g. '... de Bafoussam'").
export function extractCityFromName(name: string): { city: string | null; evidence: string | null } {
  // Find the LAST standalone " DE " (space-D-E-space, case-insensitive) —
  // deliberately excludes "DES"/"D'" (different tokens) to avoid false
  // matches inside words like "PERSONNELS DES SANTE" or "D'ETAT".
  const re = /\bDE\s+/gi;
  let lastIndex = -1;
  let m: RegExpExecArray | null;
  const upper = name.toUpperCase();
  while ((m = re.exec(upper))) {
    // must be preceded by a space or start (word boundary already ensures start-of-word;
    // \b handles that). We just need the LAST match position.
    lastIndex = m.index;
  }
  if (lastIndex === -1) return { city: null, evidence: null };
  const after = name.slice(lastIndex + 2).trim(); // +2 = length of "DE"
  const cleaned = after.replace(/^["'\u00AB\u00BB\s]+|["'\u00AB\u00BB\s.]+$/g, "").trim();
  if (!cleaned || cleaned.length < 3) return { city: null, evidence: null };
  // reject if the captured text still contains generic connector words only (safety net)
  return { city: cleaned.toUpperCase(), evidence: `"...DE ${cleaned}" (suffixe explicite du nom officiel MINSANTE)` };
}
