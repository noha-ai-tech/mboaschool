// MODIFICATION 5/7 — couleurs CMS de l'école (establishments.couleur_primaire
// / couleur_secondaire), réutilisées à la fois par le mini-site public
// (MiniSiteShell) et le formulaire de préinscription. Partagé ici pour que
// les deux endroits appliquent exactement la même règle de lisibilité —
// jamais une couleur inventée, juste la couleur réelle de l'école assombrie
// quand elle est trop claire pour porter du texte blanc ou rester lisible
// en texte sur fond clair.

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function ensureReadableColor(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;
  const rgb = parseHex(hex);
  if (!rgb) return fallback;
  const [r, g, b] = rgb;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance <= 140) return `#${hex.replace("#", "")}`;
  const factor = 0.35;
  const toHex = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(5,150,105,${alpha})`;
  const [r, g, b] = rgb;
  return `rgba(${r},${g},${b},${alpha})`;
}
