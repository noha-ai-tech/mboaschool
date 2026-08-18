import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Investigation ad-hoc, lecture seule — pourquoi establishments_count=1277 au
// lieu des 721 attendus par SPRINT P.4 §3. Aucune écriture.

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

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
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const establishments = await fetchAllPaginated<{
    id: string;
    official_id: string | null;
    source_ministry: string | null;
    registry_import_batch: string | null;
    owner_id: string | null;
    created_at: string;
  }>(url, serviceKey, "/rest/v1/establishments?select=id,official_id,source_ministry,registry_import_batch,owner_id,created_at");

  const staging = await fetchAllPaginated<{
    id: string;
    status: string;
    promoted_establishment_id: string | null;
    promoted_at: string | null;
  }>(url, serviceKey, "/rest/v1/establishment_import_staging?select=id,status,promoted_establishment_id,promoted_at");

  const byBatch: Record<string, number> = {};
  for (const e of establishments) {
    const b = e.registry_import_batch ?? "(null)";
    byBatch[b] = (byBatch[b] ?? 0) + 1;
  }

  const bySourceMinistry: Record<string, number> = {};
  for (const e of establishments) {
    const s = e.source_ministry ?? "(null)";
    bySourceMinistry[s] = (bySourceMinistry[s] ?? 0) + 1;
  }

  const withOfficialId = establishments.filter((e) => e.official_id).length;
  const withoutOwner = establishments.filter((e) => !e.owner_id).length;

  const stagingByStatus: Record<string, number> = {};
  for (const r of staging) stagingByStatus[r.status] = (stagingByStatus[r.status] ?? 0) + 1;
  const stagingPromotedLinked = staging.filter((r) => r.promoted_establishment_id).length;

  const sortedByDate = [...establishments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last10 = sortedByDate.slice(-10).map((e) => ({ id: e.id, official_id: e.official_id, source_ministry: e.source_ministry, batch: e.registry_import_batch, created_at: e.created_at }));

  console.log("=== establishments total ===", establishments.length);
  console.log("=== by registry_import_batch ===", byBatch);
  console.log("=== by source_ministry ===", bySourceMinistry);
  console.log("=== with official_id ===", withOfficialId);
  console.log("=== unclaimed (owner_id null) ===", withoutOwner);
  console.log("=== staging by status ===", stagingByStatus);
  console.log("=== staging rows with promoted_establishment_id set ===", stagingPromotedLinked);
  console.log("=== 10 most recently created establishments ===");
  console.log(JSON.stringify(last10, null, 2));
}

main().catch((error) => {
  console.error("Échec investigation :", error);
  process.exit(1);
});
