import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT P.2A §13-15 — Classifie les 53 "localités suspectes" de
 * reports/registry/master-v1-human-review.csv.
 *
 * Règle CLEARLY_INVALID (§14) : la valeur, une fois débarrassée des tokens
 * "administratifs" connus (oui/non, chiffres, "degré"/"degre" et ses
 * variantes d'accord — er/e/eme/me/1r —, "de"/"du"), ne contient plus AUCUN
 * token résiduel. C'est-à-dire que la valeur entière n'est composée que de
 * bruit de saisie (une case "cycle" recopiée dans la case "localité"), sans
 * aucun fragment qui pourrait être un nom de lieu.
 *
 * Règle POSSIBLE_REAL_LOCALITY (§15) : la valeur contient explicitement
 * "chefferie" — jamais rejeté uniquement parce qu'inhabituel.
 *
 * Tout le reste (un token résiduel qui pourrait être un nom de lieu, mais
 * mêlé à du bruit "degré" — ex. "3e DEGRE DE MENDONG") -> NEEDS_REVIEW,
 * jamais classé automatiquement comme un vrai lieu ni rejeté.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const NOISE_TOKENS = new Set([
  "oui", "non", "degre", "degres", "deg", "er", "e", "eme", "me", "1r", "de", "du", "et",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(value: string): string[] {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[()\/]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function classify(value: string): "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW" {
  const lower = stripAccents(value).toLowerCase();
  if (lower.includes("chefferie")) return "POSSIBLE_REAL_LOCALITY";

  const tokens = tokenize(value);
  // Ordinaux collés au chiffre (2e, 3e, 1er, 3me, 2eme, 1r...) sont du même
  // bruit "degré" que "2 DEGRE" — l'exemple même donné en §14 ("2e degré")
  // les traite comme invalides, pas comme un fragment de nom de lieu.
  const ORDINAL_RE = /^\d+(er|eme|me|e|r)$/;
  const residual = tokens.filter((t) => !NOISE_TOKENS.has(t) && !/^\d+$/.test(t) && !ORDINAL_RE.test(t));

  if (residual.length === 0) return "CLEARLY_INVALID";
  return "NEEDS_REVIEW";
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const raw = readFileSync(join(rootDir, "reports", "registry", "master-v1-human-review.csv"), "utf-8");
  const [, ...lines] = raw.trim().split("\n");

  const rows = lines.map((line) => {
    const [name, region, suspicious] = parseCsvLine(line);
    return { name, region, rawLocality: suspicious, status: classify(suspicious) };
  });

  const counts = { CLEARLY_INVALID: 0, POSSIBLE_REAL_LOCALITY: 0, NEEDS_REVIEW: 0 };
  for (const r of rows) counts[r.status]++;

  const outPath = join(rootDir, "reports", "registry", "suspicious-localities-classified.csv");
  const header = "name,region,raw_locality,status";
  const outLines = [header, ...rows.map((r) => [r.name, r.region, r.rawLocality, r.status].map(csvEscape).join(","))];
  writeFileSync(outPath, outLines.join("\n"), "utf-8");

  console.log(`Total : ${rows.length}`);
  console.log(`CLEARLY_INVALID: ${counts.CLEARLY_INVALID}`);
  console.log(`POSSIBLE_REAL_LOCALITY: ${counts.POSSIBLE_REAL_LOCALITY}`);
  console.log(`NEEDS_REVIEW: ${counts.NEEDS_REVIEW}`);
  console.log(`Rapport écrit : ${outPath}`);
}

main();
