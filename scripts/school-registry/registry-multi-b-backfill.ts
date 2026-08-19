import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { classifyMinesecOfficialId } from "./lib/registryBackfill";

/**
 * SPRINT REGISTRY-MULTI-B — backfill CONTRÔLÉ de
 * establishment_registry_identifiers (migration 0021, exécutée
 * manuellement par jean-merlain via Supabase Dashboard SQL Editor,
 * vérifiée empiriquement dans ce sprint — voir
 * reports/registry/registry-multi-b-migration-result.json).
 *
 * Portée STRICTE, autorisation explicite jean-merlain :
 *  1. official_id MINESEC historiques valides (longueur 17) -> MINESEC_ESG / OFFICIAL_ID / is_primary=true.
 *     Les 3 identifiants de longueur atypique (REGISTRY-MULTI-A) restent REVIEW_REQUIRED, jamais insérés.
 *  2. Les 161 corroborations Cartescolaire R.3.2 (source structurée :
 *     reports/registry/major-cities-r3-2-created-ids.json, jamais un
 *     re-parsing de texte libre) -> MINESEC_CARTESCOLAIRE / CORROBORATION_ID / is_primary=false.
 *
 * N'IMPORTE PAS les 5307 lignes Cartescolaire complètes. Ne touche jamais
 * establishments ni establishment_import_staging (aucun .update()/.insert()
 * sur ces deux tables nulle part dans ce fichier). Idempotent par
 * construction : upsert avec ignoreDuplicates sur la contrainte unique
 * réelle, suivi d'une vérification post-hoc qui distingue une ligne déjà
 * présente pour LE MÊME établissement (skip normal) d'une collision avec
 * un établissement DIFFÉRENT (jamais silencieuse, toujours reportée).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const CARTESCOLAIRE_SOURCE_URL = "https://cartescolaire.cm/minesec";
const R32_CHECKSUM = "d7f7cb6eef13cd59304e0dcbe0e6223f8ab1557a1e95dec667afbed630cb3025";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

interface LiveEstablishment {
  id: string;
  name: string;
  official_id: string | null;
  source_ministry: string | null;
  owner_id: string | null;
  is_verified: boolean;
}

interface RegistryIdentifierRow {
  establishment_id: string;
  authority: string;
  registry: string;
  identifier: string;
  identifier_type: string;
  is_primary: boolean;
  source_url: string | null;
  source_reference: string | null;
  metadata: Record<string, unknown>;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  console.log("=== REGISTRY-MULTI-B — BACKFILL CONTRÔLÉ (écriture réelle, portée autorisée) ===\n");

  // ── 1. Baseline fraîche (jamais supposer les anciens chiffres) ──────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Charger tous les établissements (pagination — plafond PostgREST 1000) ──
  const allEst: LiveEstablishment[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from("establishments").select("id,name,official_id,source_ministry,owner_id,is_verified").range(offset, offset + pageSize - 1);
    if (error) throw error;
    allEst.push(...(data as LiveEstablishment[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Établissements chargés : ${allEst.length}`);

  // ── 3. Population A — official_id MINESEC historiques ───────────────────
  const withOfficialId = allEst.filter((e) => e.official_id);
  const minesecEsgRows: RegistryIdentifierRow[] = [];
  const reviewRequired: Array<{ establishment_id: string; name: string; official_id: string | null; source_ministry: string | null; reason: string }> = [];

  for (const e of withOfficialId) {
    const value = e.official_id!.trim();
    const classification = classifyMinesecOfficialId(value, e.source_ministry);
    if (classification.status === "VALID") {
      minesecEsgRows.push({
        establishment_id: e.id,
        authority: "MINESEC",
        registry: classification.registry,
        identifier: value,
        identifier_type: classification.identifierType,
        is_primary: true,
        source_url: null,
        source_reference: "official_id historique (pré-registre multi-ID, migration 0018)",
        metadata: { backfill_source: "REGISTRY-MULTI-B", import_batch: null },
      });
    } else {
      reviewRequired.push({ establishment_id: e.id, name: e.name, official_id: value, source_ministry: e.source_ministry, reason: `${classification.reason} — REVIEW_REQUIRED, non inséré` });
    }
  }
  console.log(`\nPopulation A (MINESEC_ESG) : ${minesecEsgRows.length} valides à insérer, ${reviewRequired.length} REVIEW_REQUIRED (exclus)`);

  // ── 4. Population B — 161 corroborations Cartescolaire R.3.2 (source structurée) ──
  const createdIds = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "major-cities-r3-2-created-ids.json"), "utf-8"));
  const approval = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "major-cities-official-corroboration-approval.json"), "utf-8"));
  const typeByStagingId = new Map<string, string>(approval.candidates.map((c: any) => [c.staging_id, c.official_corroboration_id_type]));

  const liveIds = new Set(allEst.map((e) => e.id));
  const cartescolaireRows: RegistryIdentifierRow[] = [];
  const cartescolaireMissing: Array<{ establishment_id: string; reason: string }> = [];

  for (const entry of createdIds.establishments as Array<{ establishment_id: string; staging_id: string; official_corroboration_id: string }>) {
    if (!liveIds.has(entry.establishment_id)) {
      cartescolaireMissing.push({ establishment_id: entry.establishment_id, reason: "establishment_id absent de la table establishments actuelle — supprimé/modifié depuis R.3.2 ?" });
      continue;
    }
    cartescolaireRows.push({
      establishment_id: entry.establishment_id,
      authority: "MINESEC",
      registry: "MINESEC_CARTESCOLAIRE",
      identifier: entry.official_corroboration_id.trim(),
      identifier_type: "CORROBORATION_ID",
      is_primary: false,
      source_url: CARTESCOLAIRE_SOURCE_URL,
      source_reference: `Corroboration officielle R.3.2 (checksum approuvé ${R32_CHECKSUM}, approved_by: Eddy)`,
      metadata: {
        backfill_source: "REGISTRY-MULTI-B",
        import_batch: "major-cities-official-corroboration-v1",
        corroboration_type: typeByStagingId.get(entry.staging_id) ?? null,
      },
    });
  }
  console.log(`Population B (MINESEC_CARTESCOLAIRE) : ${createdIds.count} candidats attendus, ${cartescolaireRows.length} exploitables, ${cartescolaireMissing.length} manquants`);
  if (cartescolaireRows.length !== 161) console.log(`  ATTENTION : ${cartescolaireRows.length} != 161 attendu — voir cartescolaireMissing dans le rapport`);

  // ── 5. Sanity cross-check : chevauchement entre les deux populations ────
  const esgEstablishmentIds = new Set(minesecEsgRows.map((r) => r.establishment_id));
  const overlap = cartescolaireRows.filter((r) => esgEstablishmentIds.has(r.establishment_id));
  console.log(`\nChevauchement établissements (MINESEC_ESG ET Cartescolaire) : ${overlap.length} (attendu 0 — les 161 R.3.2 ont official_id=null)`);

  const allRows = [...minesecEsgRows, ...cartescolaireRows];
  console.log(`\nTotal lignes à insérer (upsert idempotent) : ${allRows.length}`);

  // ── 6. Upsert par lots, idempotent via la contrainte unique réelle ──────
  async function upsertBatch(rows: RegistryIdentifierRow[]): Promise<{ inserted: number; error: string | null }> {
    if (rows.length === 0) return { inserted: 0, error: null };
    const chunkSize = 500;
    let totalReturned = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("establishment_registry_identifiers")
        .upsert(chunk, { onConflict: "registry,identifier_type,identifier", ignoreDuplicates: true })
        .select("id");
      if (error) return { inserted: totalReturned, error: error.message };
      totalReturned += data?.length ?? 0;
    }
    return { inserted: totalReturned, error: null };
  }

  const firstRun = await upsertBatch(allRows);
  if (firstRun.error) throw new Error(`Échec upsert (premier passage) : ${firstRun.error}`);
  console.log(`\nPremier passage upsert : ${firstRun.inserted} lignes effectivement insérées (les conflits sont silencieusement ignorés par ignoreDuplicates)`);

  // ── 7. Vérification post-hoc — distingue idempotence normale de collision réelle ──
  // Pagination complète obligatoire : un .select() unique est plafonné par
  // défaut à 1000 lignes par PostgREST (piège déjà documenté ailleurs dans
  // ce projet, SPRINT R.2-B) — sur >1000 lignes attendues, un select sans
  // pagination tronquerait silencieusement et produirait de fausses
  // "collisions" pour tout ce qui dépasse la première page.
  const resultRows: Array<{ id: string; establishment_id: string; registry: string; identifier_type: string | null; identifier: string }> = [];
  {
    let resOffset = 0;
    const resPageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("establishment_registry_identifiers")
        .select("id,establishment_id,registry,identifier_type,identifier")
        .range(resOffset, resOffset + resPageSize - 1);
      if (error) throw error;
      resultRows.push(...(data as typeof resultRows));
      if (!data || data.length < resPageSize) break;
      resOffset += resPageSize;
    }
  }

  const actualByTriple = new Map<string, { establishment_id: string; id: string }>();
  for (const r of resultRows) actualByTriple.set(`${r.registry}|${r.identifier_type}|${r.identifier}`, { establishment_id: r.establishment_id, id: r.id });

  const collisions: Array<{ triple: string; intended_establishment_id: string; actual_establishment_id: string }> = [];
  let confirmedPresent = 0;
  for (const row of allRows) {
    const key = `${row.registry}|${row.identifier_type}|${row.identifier}`;
    const actual = actualByTriple.get(key);
    if (!actual) {
      collisions.push({ triple: key, intended_establishment_id: row.establishment_id, actual_establishment_id: "ABSENT — ni inséré ni trouvé, anomalie à investiguer" });
    } else if (actual.establishment_id !== row.establishment_id) {
      collisions.push({ triple: key, intended_establishment_id: row.establishment_id, actual_establishment_id: actual.establishment_id });
    } else {
      confirmedPresent++;
    }
  }
  console.log(`Vérification post-hoc : ${confirmedPresent}/${allRows.length} lignes confirmées présentes avec le bon establishment_id, ${collisions.length} collision(s)/anomalie(s)`);

  // ── 8. Test d'idempotence — second passage, doit produire 0 nouvelle insertion ──
  const countAfterFirst = resultRows.length;
  const secondRun = await upsertBatch(allRows);
  if (secondRun.error) throw new Error(`Échec upsert (second passage, test idempotence) : ${secondRun.error}`);
  const { count: countAfterSecond } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nTest idempotence — second passage : ${secondRun.inserted} lignes retournées par l'upsert (attendu 0, ignoreDuplicates doit tout ignorer), count table avant=${countAfterFirst} après=${countAfterSecond} (attendu identique)`);

  // ── 9. Orphelins — garantis 0 par la contrainte FK elle-même, vérifié quand même ──
  const orphans = resultRows.filter((r) => !liveIds.has(r.establishment_id));
  console.log(`Identifiants orphelins (establishment_id sans établissement live) : ${orphans.length} (attendu 0, garanti par la FK ON DELETE CASCADE)`);

  // ── 10. establishments/staging inchangés + official_id/owner/verified inchangés (preuve empirique) ──
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const touchedIds = [...new Set(allRows.map((r) => r.establishment_id))];
  const { data: afterSample } = await supabase.from("establishments").select("id,official_id,owner_id,is_verified").in("id", touchedIds.slice(0, Math.min(touchedIds.length, 500)));
  const beforeById = new Map(allEst.map((e) => [e.id, e]));
  let officialIdChanged = 0, ownerChanged = 0, verifiedChanged = 0;
  for (const after of afterSample ?? []) {
    const before = beforeById.get(after.id);
    if (!before) continue;
    if (before.official_id !== after.official_id) officialIdChanged++;
    if (before.owner_id !== after.owner_id) ownerChanged++;
    if (before.is_verified !== after.is_verified) verifiedChanged++;
  }
  console.log(`\nestablishments : avant=${estBefore} après=${estAfter} | staging : avant=${stagingBefore} après=${stagingAfter}`);
  console.log(`official_id modifiés=${officialIdChanged} | owner modifiés=${ownerChanged} | verified modifiés=${verifiedChanged} (échantillon ${afterSample?.length ?? 0}/${touchedIds.length} établissements touchés par le backfill)`);

  // ── 11. Rapports ──────────────────────────────────────────────────────
  const summary = {
    sprint: "REGISTRY-MULTI-B",
    operator: "jean-merlain",
    approved_by: "Jean Merlain",
    generated_at: new Date().toISOString(),
    database: {
      establishments_before: estBefore, establishments_after: estAfter,
      staging_before: stagingBefore, staging_after: stagingAfter,
      registry_identifiers_before: registryBefore, registry_identifiers_after: countAfterSecond,
    },
    minesec_esg_backfill: {
      candidates_with_official_id: withOfficialId.length,
      inserted_valid: minesecEsgRows.length,
      review_required_excluded: reviewRequired.length,
    },
    cartescolaire_backfill: {
      candidates_expected: createdIds.count,
      candidates_exploitable: cartescolaireRows.length,
      missing: cartescolaireMissing.length,
      registry_import_batch: createdIds.registry_import_batch,
      approval_checksum: R32_CHECKSUM,
    },
    overlap_between_populations: overlap.length,
    total_rows_intended: allRows.length,
    first_run_inserted: firstRun.inserted,
    post_hoc_confirmed_present: confirmedPresent,
    collisions_detected: collisions.length,
    collision_detail: collisions,
    idempotence_test: {
      count_before_second_run: countAfterFirst,
      count_after_second_run: countAfterSecond,
      second_run_new_inserts: secondRun.inserted,
      idempotent: countAfterFirst === countAfterSecond && secondRun.inserted === 0,
    },
    orphan_identifiers: orphans.length,
    official_id_modified: officialIdChanged,
    owner_modified: ownerChanged,
    verified_modified: verifiedChanged,
    not_imported_by_design: {
      cartescolaire_full_national_dataset_5307_rows: true,
      minesec_v1_2_backlog: true,
      minesup_data: true,
      other_ministries: true,
    },
  };
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "registry-multi-b-backfill-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  const csvHeaders = ["category", "establishment_id", "name", "official_id_or_identifier", "source_ministry", "reason"];
  const csvLines = [csvHeaders.join(",")];
  for (const r of reviewRequired) csvLines.push([csvEscape("MINESEC_REVIEW_REQUIRED"), csvEscape(r.establishment_id), csvEscape(r.name), csvEscape(r.official_id), csvEscape(r.source_ministry), csvEscape(r.reason)].join(","));
  for (const m of cartescolaireMissing) csvLines.push([csvEscape("CARTESCOLAIRE_MISSING"), csvEscape(m.establishment_id), "", "", "", csvEscape(m.reason)].join(","));
  for (const c of collisions) csvLines.push([csvEscape("COLLISION_REVIEW"), csvEscape(c.intended_establishment_id), "", csvEscape(c.triple), "", csvEscape(`actual establishment_id trouvé: ${c.actual_establishment_id}`)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "registry-multi-b-backfill-review.csv"), csvLines.join("\n"), "utf-8");

  console.log("\nRapports écrits :");
  console.log("  reports/registry/registry-multi-b-backfill-summary.json");
  console.log("  reports/registry/registry-multi-b-backfill-review.csv");
}

main().catch((error) => {
  console.error("Échec backfill REGISTRY-MULTI-B :", error);
  process.exit(1);
});
