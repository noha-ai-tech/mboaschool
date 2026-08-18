import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Correctif ponctuel — promote-master-v1-approved.ts a écrit `region` tel
 * quel depuis staging (valeurs de filtre MINESEC brutes : "CENTRE",
 * "LITTORAL", "EXTREME-NORD"...) au lieu de la nomenclature officielle déjà
 * utilisée partout ailleurs dans l'app ("Centre", "Littoral", "Extrême-
 * Nord"). Contrairement à `city` (texte libre, des milliers de valeurs
 * possibles — trop risqué à reformater automatiquement), `region` est un
 * ensemble fermé de 10 valeurs connues : une correspondance directe est
 * sûre et corrige la cause racine (filtres région dupliqués, statistiques
 * "régions couvertes" faussées par des doublons de casse).
 *
 * Usage : tsx fix-promoted-region-casing.ts --commit
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const IMPORT_BATCH = "minesec-master-v1-promotion-p3";

const REGION_LABELS: Record<string, string> = {
  CENTRE: "Centre",
  LITTORAL: "Littoral",
  OUEST: "Ouest",
  ADAMAOUA: "Adamaoua",
  NORD: "Nord",
  "EXTREME-NORD": "Extrême-Nord",
};

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const commit = process.argv.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const rows = await fetchAllPaginated<{ id: string; region: string | null }>(
    url,
    serviceKey,
    `/rest/v1/establishments?select=id,region&registry_import_batch=eq.${IMPORT_BATCH}`
  );

  const toFix = rows.filter((r) => r.region && REGION_LABELS[r.region] && REGION_LABELS[r.region] !== r.region);
  const byRegion: Record<string, number> = {};
  for (const r of toFix) byRegion[r.region as string] = (byRegion[r.region as string] ?? 0) + 1;

  console.log(`Établissements du lot : ${rows.length}`);
  console.log(`À corriger (casse région non conforme) : ${toFix.length}`, byRegion);

  if (!commit) {
    console.log("Dry-run — aucune écriture. Relancer avec --commit pour appliquer.");
    return;
  }

  let fixed = 0;
  let failed = 0;
  for (const r of toFix) {
    const target = REGION_LABELS[r.region as string];
    const res = await fetch(`${url}/rest/v1/establishments?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ region: target }),
    });
    if (res.ok) fixed++;
    else {
      failed++;
      console.error(`  ÉCHEC ${r.id} — HTTP ${res.status}`);
    }
  }
  console.log(`Terminé — ${fixed} corrigé(s), ${failed} échec(s).`);

  writeFileSync(
    join(rootDir, "reports", "registry", "fix-promoted-region-summary.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), batch: IMPORT_BATCH, totalInBatch: rows.length, toFix: toFix.length, fixed, failed, byRegion }, null, 2),
    "utf-8"
  );
}

main().catch((error) => {
  console.error("Échec du correctif :", error);
  process.exit(1);
});
