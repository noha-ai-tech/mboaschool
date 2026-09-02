// GUYSKULL-06 §9 — no dedicated "values" CMS field exists (confirmed
// during the GUYSKULL-04 audit); schools that list them do so as an
// optional "Nos valeurs :" block inside the free-text Vision field
// (— Label : description one per line). This is a presentation-only
// parser — it never writes data, and returns an empty list (rendered as
// nothing) for any vision text that doesn't follow the convention, which
// is the common case for most schools.
export type ParsedValue = { label: string; description: string };

const VALUE_LINE = /^—\s*([^:]+?)\s*:\s*(.+)$/;

export function parseValuesFromText(text: string | null): ParsedValue[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(VALUE_LINE))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ label: m[1].trim(), description: m[2].trim() }));
}

/** The same text with any parsed "— Label : description" lines removed, for display alongside the extracted value cards without repeating them. */
const VALUES_HEADER_LINE = /^nos valeurs\s*:?\s*$/i;

export function stripValuesFromText(text: string | null): string {
  if (!text) return "";
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !VALUE_LINE.test(trimmed) && !VALUES_HEADER_LINE.test(trimmed);
    })
    .join("\n")
    .trim();
}
