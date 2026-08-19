/**
 * SPRINT MINESUP-C — un snapshot brut DOIT rester consultable pour l'audit
 * de structure (REGISTRY_EXTRACTION_SAFETY.md), mais ne doit JAMAIS
 * conserver la VALEUR d'un champ personnel, même dans un fichier local non
 * public. Bug réel trouvé pendant ce sprint : 26/29 fiches détail du
 * pilote Nord-Ouest contenaient un vrai nom de promoteur en clair dans le
 * HTML sauvegardé, sur le point d'être committé — la présence du champ
 * était bien détectée (`pii_field_present_but_not_collected`), mais rien
 * ne rédigeait la VALEUR avant écriture sur disque.
 */
export function redactPiiFromHtml(html: string): string {
  return html.replace(
    /(<strong>\s*Nom\s+du\s+(?:promoteur|repr[eé]sentant\s+l[eé]gal)\s*<\/strong>\s*:?\s*(?:<br\s*\/?>)?\s*)([^<]*)/gi,
    (_match, label: string, _value: string) => `${label}[REDACTED — donnée personnelle exclue par politique de minimisation]`
  );
}
