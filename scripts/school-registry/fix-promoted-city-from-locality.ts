import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Correctif ponctuel — bug réel introduit par promote-master-v1-approved.ts :
 * le script lisait `establishment_import_staging.city` (toujours NULL pour
 * les données MINESEC, qui n'utilisent que `locality`) au lieu de
 * `locality`/`raw_data._localityAudit.normalizedLocality` pour peupler
 * `establishments.city` à la création. Résultat : les 556 établissements
 * créés par le lot "minesec-master-v1-promotion-p3" ont tous `city = NULL`,
 * alors que ~409 d'entre eux ont une localité réelle et connue en staging.
 *
 * Ce script restaure `city` à partir de la valeur staging déjà légitimement
 * collectée (normalizedLocality — NULL uniquement pour les localités
 * CLEARLY_INVALID, jamais une valeur inventée). Ne touche AUCUN champ
 * métier (name, owner_id, verification_status, etc.), uniquement `city`,
 * et uniquement sur les lignes de ce batch précis, et uniquement quand
 * `city` est actuellement NULL (idempotent — relançable sans risque).
 *
 * Usage : tsx fix-promoted-city-from-locality.ts --commit
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const IMPORT_BATCH = "minesec-master-v1-promotion-p3";

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

  const [newEstablishments, stagingRows] = await Promise.all([
    fetchAllPaginated<{ id: string; official_id: string | null; city: string | null }>(
      url,
      serviceKey,
      `/rest/v1/establishments?select=id,official_id,city&registry_import_batch=eq.${IMPORT_BATCH}`
    ),
    fetchAllPaginated<{ official_identifier: string | null; locality: string | null; raw_data: { _localityAudit?: { normalizedLocality: string | null } } | null }>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=official_identifier,locality,raw_data&status=eq.promoted"
    ),
  ]);

  const localityByOfficialId = new Map<string, string | null>();
  for (const s of stagingRows) {
    if (!s.official_identifier) continue;
    const normalized = s.raw_data?._localityAudit?.normalizedLocality ?? s.locality ?? null;
    localityByOfficialId.set(s.official_identifier.trim().toUpperCase(), normalized);
  }

  const toFix = newEstablishments.filter((e) => {
    if (e.city !== null) return false; // déjà rempli (ne devrait pas arriver, mais idempotent)
    if (!e.official_id) return false;
    const locality = localityByOfficialId.get(e.official_id.trim().toUpperCase());
    return Boolean(locality);
  });

  console.log(`Établissements du lot : ${newEstablishments.length}`);
  console.log(`À corriger (city NULL alors qu'une localité réelle existe) : ${toFix.length}`);

  if (!commit) {
    console.log("Dry-run — aucune écriture. Relancer avec --commit pour appliquer.");
    return;
  }

  let fixed = 0;
  let failed = 0;
  for (const e of toFix) {
    const locality = localityByOfficialId.get((e.official_id as string).trim().toUpperCase());
    const res = await fetch(`${url}/rest/v1/establishments?id=eq.${e.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ city: locality }),
    });
    if (res.ok) fixed++;
    else {
      failed++;
      console.error(`  ÉCHEC ${e.id} — HTTP ${res.status}`);
    }
  }
  console.log(`Terminé — ${fixed} corrigé(s), ${failed} échec(s).`);

  writeFileSync(
    join(rootDir, "reports", "registry", "fix-promoted-city-summary.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), batch: IMPORT_BATCH, totalInBatch: newEstablishments.length, toFix: toFix.length, fixed, failed }, null, 2),
    "utf-8"
  );
}

main().catch((error) => {
  console.error("Échec du correctif :", error);
  process.exit(1);
});
