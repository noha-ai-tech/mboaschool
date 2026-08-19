import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import { assertMinesupPromotionAllowed, evaluateReconciliation, MinesupPromotionRefused, MINESUP_PROMOTION_CONFIRM_PHRASE, EXPECTED_PROJECT_REF, EXPECTED_OPERATOR, EXPECTED_BATCH, EXPECTED_SOURCE_MINISTRY } from "./lib/minesupPromotionGuard";

/**
 * SPRINT MINESUP-D — script de promotion CONTRÔLÉE des candidats
 * CLEAN_APPROVABLE du pilote MINESUP (`minesup-pilot-v1`).
 *
 * MODE PAR DÉFAUT : DRY RUN (aucune écriture). L'écriture réelle exige
 * TOUS les flags suivants, fournis explicitement au moment de
 * l'exécution — jamais une valeur par défaut ni codée en dur :
 *
 *   --commit
 *   --expected-count=<N>              (nombre d'éligibles recalculé maintenant)
 *   --approval-checksum=<sha256>       (checksum recalculé maintenant)
 *   --confirm="PROMOTE_MINESUP_PILOT_TO_PRODUCTION"
 *   --operator="jean-merlain"
 *   --approved-by="<nom humain réel>"  (jamais operator, jamais codé en dur)
 *
 * §14 — aucune transaction SQL multi-tables n'est disponible depuis cet
 * environnement (pas d'accès direct au Postgres wire protocol, cf.
 * REGISTRY-MULTI-B). Stratégie fail-safe : séquentiel par candidat
 * (establishment -> staging link -> registry identifiers), avec
 * vérification de lecture après chaque étape et un audit de
 * réconciliation final qui détecte explicitement tout état partiel —
 * jamais un SUCCESS silencieux si une étape a échoué pour un candidat.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function argFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0; const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data as T[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  const commit = hasFlag("commit");
  console.log(`=== SPRINT MINESUP-D — PROMOTION ${commit ? "(--commit fourni)" : "(DRY RUN — défaut)"} ===\n`);

  // ── Recalcul FRAIS des candidats éligibles (jamais un résultat historique réutilisé) ──
  // Tri par created_at ascendant — DOIT être identique à l'ordre utilisé par
  // generateMinesupPilotReports() (canonique pour le calcul du checksum
  // d'approbation) : un ordre différent produit un JSON.stringify différent
  // et donc un SHA256 différent pour EXACTEMENT le même ensemble de
  // candidats — bug réel trouvé ici (tri par id au lieu de created_at).
  const pilotRows = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,name_normalized,region,city,department,arrondissement,commune,locality,quarter,raw_data,status,education_family,ownership,subsystem,source_url,fingerprint,promoted_establishment_id,created_at", (q) => q.eq("source_ministry", "MINESUP")).then((rows) =>
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  );
  const eligibleRows = pilotRows.filter((r) => r.status === "ready" && !r.promoted_establishment_id);
  const alreadyPromoted = pilotRows.filter((r) => r.status === "promoted" || r.promoted_establishment_id);
  console.log(`Candidats éligibles (status=ready, non déjà promus) : ${eligibleRows.length}`);
  console.log(`Déjà promus (idempotence — sera skip) : ${alreadyPromoted.length}`);

  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; }
  interface RegistryIdRow { establishment_id: string; registry: string; identifier: string; identifier_type: string | null; }
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const registryIds = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,registry,identifier,identifier_type");
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null }>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family");
  const pilotBatchIds = new Set(pilotRows.map((p) => p.id));

  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    return mainCategory === "superieur" ? "higher_education" : mainCategory;
  }
  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));
  const stagingTargets: MatchTarget[] = allStaging.filter((s) => !pilotBatchIds.has(s.id)).map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];

  // Revalidation matching + collision, identique à la logique du pre-flight.
  const existingIdentifierKeys = new Set(registryIds.map((r) => `${r.registry}|${r.identifier_type ?? ""}|${r.identifier.trim().toUpperCase()}`));
  let identifierConflicts = 0;
  const finalEligible: typeof eligibleRows = [];
  for (const r of eligibleRows) {
    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);
    if (match.level !== "NO_MATCH") {
      console.log(`  EXCLU (revalidation matching) : "${r.name_raw}" -> ${match.level} contre "${match.target?.name}"`);
      continue;
    }
    const raw = r.raw_data as any;
    let hasConflict = false;
    for (const [type, value] of [["CREATION_ORDER", raw?.identifiers?.creation_order_raw], ["OPENING_AUTHORIZATION", raw?.identifiers?.opening_authorization_raw]] as const) {
      if (!value) continue;
      const key = `MINESUP_IPES|${type}|${String(value).trim().toUpperCase()}`;
      if (existingIdentifierKeys.has(key)) { hasConflict = true; identifierConflicts++; }
    }
    if (hasConflict) {
      console.log(`  EXCLU (collision identifiant) : "${r.name_raw}"`);
      continue;
    }
    finalEligible.push(r);
  }
  console.log(`\nÉligibles finaux (post-revalidation) : ${finalEligible.length}`);

  // Checksum — MÊME méthode que generateMinesupPilotReports (approvalCandidates shape).
  const approvalCandidates = finalEligible.map((r) => {
    const raw = r.raw_data as any;
    return {
      staging_id: r.id, name: r.name_raw, region: r.region, city: r.city, category: r.education_family,
      authority: "MINESUP", registry: "MINESUP_IPES", source: r.source_url, decision: "CLEAN_APPROVABLE",
      identifiers: { creation_order: raw?.identifiers?.creation_order_raw ?? null, opening_authorization: raw?.identifiers?.opening_authorization_raw ?? null },
    };
  });
  const computedChecksum = sha256(JSON.stringify(approvalCandidates));
  console.log(`Checksum recalculé (candidats finaux) : ${computedChecksum}`);

  console.log("\n=== MINESUP-D CONTROLLED PROMOTION DRY RUN (recalcul au moment de l'exécution) ===");
  console.log(`Would insert establishments: ${finalEligible.length}`);
  console.log(`Would link staging: ${finalEligible.length}`);
  console.log(`Would insert registry identifiers: ${finalEligible.reduce((s, r) => s + [(r.raw_data as any)?.identifiers?.creation_order_raw, (r.raw_data as any)?.identifiers?.opening_authorization_raw].filter(Boolean).length, 0)}`);
  console.log(`Identifier conflicts: ${identifierConflicts}`);

  if (!commit) {
    console.log("\nDRY RUN — aucune écriture. Pour exécuter réellement, fournir --commit avec tous les flags requis (voir en-tête du fichier).");
    console.log("\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
    return;
  }

  // ── Guard — toute écriture réelle passe ICI, jamais contournable ──────
  try {
    assertMinesupPromotionAllowed({
      commit,
      confirmPhrase: argFlag("confirm"),
      projectRef,
      operator: argFlag("operator"),
      approvedBy: argFlag("approved-by"),
      actualEligibleCount: finalEligible.length,
      expectedEligibleCount: argFlag("expected-count") ? Number(argFlag("expected-count")) : undefined,
      computedChecksum,
      approvalChecksum: argFlag("approval-checksum"),
      identifierConflicts,
    });
  } catch (e) {
    if (e instanceof MinesupPromotionRefused) {
      console.error(`\n${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ── Exécution réelle — séquentielle, fail-safe, par candidat ──────────
  console.log("\n=== EXÉCUTION RÉELLE AUTORISÉE ===\n");
  let created = 0, stagingLinked = 0, identifiersInserted = 0;
  const createdWithoutStagingLink: string[] = [];
  const createdWithoutIdentifiers: string[] = [];
  const orphanIdentifiers: string[] = [];
  const establishmentIdsCreatedThisRun = new Set<string>();

  for (const r of finalEligible) {
    const raw = r.raw_data as any;
    const { data: est, error: estError } = await supabase
      .from("establishments")
      .insert({
        name: r.name_raw, main_category: "superieur", region: r.region, city: r.city,
        source_ministry: EXPECTED_SOURCE_MINISTRY, source_url: r.source_url,
        official_id: null, owner_id: null, is_verified: false,
        registry_import_batch: EXPECTED_BATCH,
      })
      .select("id")
      .single();
    if (estError || !est) {
      console.error(`ÉCHEC création establishment pour "${r.name_raw}" : ${estError?.message}`);
      continue;
    }
    created++;
    establishmentIdsCreatedThisRun.add(est.id);

    const { error: linkError } = await supabase
      .from("establishment_import_staging")
      .update({ status: "promoted", promoted_establishment_id: est.id, promoted_at: new Date().toISOString() })
      .eq("id", r.id);
    if (linkError) {
      createdWithoutStagingLink.push(est.id);
      console.error(`ÉCHEC liaison staging pour "${r.name_raw}" (establishment ${est.id} créé) : ${linkError.message}`);
    } else {
      stagingLinked++;
    }

    const idCandidates = [
      { type: "CREATION_ORDER", value: raw?.identifiers?.creation_order_raw },
      { type: "OPENING_AUTHORIZATION", value: raw?.identifiers?.opening_authorization_raw },
    ].filter((x) => x.value);
    let insertedForThis = 0;
    for (const idc of idCandidates) {
      const { error: idError } = await supabase.from("establishment_registry_identifiers").insert({
        establishment_id: est.id, authority: "MINESUP", registry: "MINESUP_IPES",
        identifier: idc.value, identifier_type: idc.type, is_primary: false,
        source_url: r.source_url, source_reference: `Promotion MINESUP-D (batch ${EXPECTED_BATCH})`,
        metadata: { promotion_batch: EXPECTED_BATCH, staging_id: r.id },
      });
      if (idError) {
        console.error(`ÉCHEC insertion identifiant ${idc.type} pour "${r.name_raw}" : ${idError.message}`);
      } else {
        identifiersInserted++;
        insertedForThis++;
      }
    }
    if (idCandidates.length > 0 && insertedForThis < idCandidates.length) createdWithoutIdentifiers.push(est.id);
  }

  // Vérification post-hoc — un identifiant inséré par CE run doit pointer vers un establishment CRÉÉ par ce même run, jamais un autre.
  const { data: postIds } = await supabase.from("establishment_registry_identifiers").select("id,establishment_id").eq("source_reference", `Promotion MINESUP-D (batch ${EXPECTED_BATCH})`);
  for (const row of postIds ?? []) {
    if (!establishmentIdsCreatedThisRun.has(row.establishment_id)) orphanIdentifiers.push(row.id);
  }

  const audit = evaluateReconciliation({ createdCount: created, stagingLinkedCount: stagingLinked, identifiersInsertedCount: identifiersInserted, createdWithoutStagingLink, createdWithoutIdentifiers, orphanIdentifiers });
  console.log("\n=== RECONCILIATION AUDIT ===");
  console.log(JSON.stringify(audit, null, 2));

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "minesup-d-promotion-result.json"), JSON.stringify({
    generated_at: new Date().toISOString(), operator: argFlag("operator"), approved_by: argFlag("approved-by"),
    project_ref: projectRef, registry_import_batch: EXPECTED_BATCH, approval_checksum: computedChecksum,
    eligible: finalEligible.length, created, staging_linked: stagingLinked, identifiers_inserted: identifiersInserted,
    audit,
  }, null, 2), "utf-8");
  if (audit.outcome !== "SUCCESS") process.exitCode = 1;
}

main().catch((error) => {
  console.error("Échec promotion MINESUP-D :", error);
  process.exit(1);
});
