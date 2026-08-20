import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./extraction/hashing";

/**
 * SPRINT MINSANTE-B — génère les rapports de revue + le snapshot d'approbation
 * à partir de l'ÉTAT RÉEL de `establishment_import_staging` (source de
 * vérité), jamais depuis la mémoire d'une exécution du collecteur — même
 * précaution que `minesupPilotReports.ts` (bug réel MINESUP-C : un second
 * passage idempotent qui n'insère rien ne doit jamais écraser un rapport
 * correct avec une vue partielle de son propre run).
 *
 * Filtre : source_ministry='MINSANTE' ET raw_data.batch='minsante-pilot-v1'
 * (scoping explicite au batch de CE pilote — une future collecte MINSANTE
 * nationale ou un autre pilote régional ne doit jamais polluer ces rapports).
 */

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BATCH_ID = "minsante-pilot-v1";

export async function generateMinsanteBPilotReports(supabase: any, rootDir: string, operator: string) {
  const { data: rows, error } = await supabase
    .from("establishment_import_staging")
    .select("id,source_url,region,city,raw_data,name_raw,name_normalized,education_family,status,duplicate_of_establishment_id,duplicate_of_staging_id,created_at")
    .eq("source_ministry", "MINSANTE")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const pilotRows = (rows as any[]).filter((r) => r.raw_data?.batch === BATCH_ID);

  const byStatus = new Map<string, number>();
  const byClassification = new Map<string, number>();
  for (const r of pilotRows) {
    byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
    const cls = r.raw_data?.classification ?? "UNKNOWN";
    byClassification.set(cls, (byClassification.get(cls) || 0) + 1);
  }

  // ── reports/registry/minsante-b-pilot-candidates.csv — vue d'ensemble, une ligne par candidat ──
  const candidatesHeader = [
    "staging_id", "name_raw", "name_normalized", "region", "programs", "education_family",
    "category_decision", "category_evidence", "classification", "classification_reason",
    "match_live_level", "match_staging_level", "status", "source",
  ];
  const candidatesCsv = [candidatesHeader.join(",")];
  for (const r of pilotRows) {
    const raw = r.raw_data as any;
    candidatesCsv.push(
      [
        r.id, r.name_raw, r.name_normalized, r.region, (raw?.programs_normalized ?? []).join(" | "), r.education_family,
        raw?.category_decision, raw?.category_evidence, raw?.classification, raw?.classification_reason,
        raw?.match_audit?.live?.level, raw?.match_audit?.staging?.level, r.status, r.source_url,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-pilot-candidates.csv"), candidatesCsv.join("\n"), "utf-8");

  // ── reports/registry/minsante-b-matching-review.csv — candidats avec un signal de correspondance (live/staging) ──
  const matchingHeader = ["staging_id", "name_raw", "region", "match_source", "match_level", "matched_id", "matched_name", "reason", "classification"];
  const matchingCsv = [matchingHeader.join(",")];
  for (const r of pilotRows) {
    const raw = r.raw_data as any;
    const live = raw?.match_audit?.live;
    const staging = raw?.match_audit?.staging;
    if (live && live.level !== "NO_MATCH") {
      matchingCsv.push([r.id, r.name_raw, r.region, "LIVE", live.level, live.target_id, live.target_name, live.reason, raw?.classification].map(csvEscape).join(","));
    }
    if (staging && staging.level !== "NO_MATCH") {
      matchingCsv.push([r.id, r.name_raw, r.region, "STAGING", staging.level, staging.target_id, staging.target_name, staging.reason, raw?.classification].map(csvEscape).join(","));
    }
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-matching-review.csv"), matchingCsv.join("\n"), "utf-8");

  // ── reports/registry/minsante-b-category-review.csv — candidats CATEGORY_REVIEW ──
  const categoryHeader = ["staging_id", "name_raw", "region", "programs", "category_decision", "category_evidence", "classification"];
  const categoryCsv = [categoryHeader.join(",")];
  for (const r of pilotRows) {
    const raw = r.raw_data as any;
    if (raw?.category_decision === "CATEGORY_REVIEW" || raw?.classification === "CATEGORY_REVIEW") {
      categoryCsv.push([r.id, r.name_raw, r.region, (raw?.programs_normalized ?? []).join(" | "), raw?.category_decision, raw?.category_evidence, raw?.classification].map(csvEscape).join(","));
    }
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-category-review.csv"), categoryCsv.join("\n"), "utf-8");

  // ── Approval snapshot (§26) — CLEAN_APPROVABLE uniquement, tri déterministe, checksum SHA256 ──
  const cleanApprovable = pilotRows.filter((r: any) => r.raw_data?.classification === "CLEAN_APPROVABLE");
  const approvalCandidates = cleanApprovable
    .map((r: any) => {
      const raw = r.raw_data as any;
      return {
        staging_id: r.id,
        name: r.name_raw,
        region: r.region,
        programs: raw?.programs_normalized ?? [],
        education_family: r.education_family,
        main_category: raw?.category_decision === "HEALTH_TRAINING_HIGHER_ED" ? "superieur" : null,
        source: { authority: "MINSANTE", source_decision: "PROBABLE_TIER_1", url: r.source_url },
        decision: "CLEAN_APPROVABLE",
        identifiers: [], // §14/§26 — aucun identifiant MINSANTE réel validé ce sprint, jamais inventé
      };
    })
    .sort((a: any, b: any) => a.staging_id.localeCompare(b.staging_id)); // tri canonique déterministe
  const checksum = sha256(JSON.stringify(approvalCandidates));
  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-b-pilot-approval.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), operator, sprint: "MINSANTE-B", batch: BATCH_ID, candidate_count: approvalCandidates.length, candidates: approvalCandidates, checksum }, null, 2),
    "utf-8"
  );

  // ── reports/registry/minsante-b-pilot-summary.json ──
  const summary = {
    generated_at: new Date().toISOString(),
    operator,
    batch: BATCH_ID,
    total_pilot_staging_rows: pilotRows.length,
    by_status: Object.fromEntries(byStatus),
    by_classification: Object.fromEntries(byClassification),
    clean_approvable_count: approvalCandidates.length,
    approval_checksum: checksum,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-pilot-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  return summary;
}
