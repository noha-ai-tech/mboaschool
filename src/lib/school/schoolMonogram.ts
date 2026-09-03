// GUYSKULL-06C §4 — generic monogram fallback for the header identity mark
// when no real logo exists. Strips common French institutional-type
// prefixes so the initial reflects the school's own distinctive name
// rather than its category word — e.g. "Collège Horizon Excellence" reads
// as "H", not "C"; a single-word name like "Guyskull" reads as "G". Purely
// a display-layer transform — never touches the stored establishment name.
const GENERIC_PREFIXES = [
  "collège", "college", "école", "ecole", "lycée", "lycee", "institut",
  "groupe scolaire", "complexe scolaire", "complexe", "centre", "académie",
  "academie", "université", "universite", "établissement", "etablissement",
  "cours", "cours privé", "cours prive", "la", "le", "les",
];

export function schoolMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const significant = words.filter((w) => !GENERIC_PREFIXES.includes(w.toLowerCase()));
  const source = significant.length > 0 ? significant : words;

  return source[0].charAt(0).toUpperCase();
}
