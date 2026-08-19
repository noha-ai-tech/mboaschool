import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./extraction/hashing";

/**
 * SPRINT MINESUP-C — génère review.csv / approval.json / link-proposals.csv
 * à partir de l'ÉTAT RÉEL de establishment_import_staging (source de
 * vérité), jamais depuis la mémoire d'une exécution du collecteur. Un
 * second passage idempotent du collecteur (qui n'insère rien de nouveau)
 * ne doit jamais pouvoir écraser un rapport correct avec une vue partielle
 * de son propre run — bug réel trouvé et corrigé dans ce sprint.
 */

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function generateMinesupPilotReports(supabase: any, rootDir: string, operator: string, batch: string) {
  const { data: rows, error } = await supabase
    .from("establishment_import_staging")
    .select("id,source_url,region,city,raw_data,name_raw,status,duplicate_of_establishment_id,education_family")
    .eq("source_ministry", "MINESUP")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);

  // ── Review CSV ──
  const csvHeaders = ["staging_id", "name", "raw_name", "region", "city", "institution_type", "creation_order", "opening_authorization", "source", "match_type", "matched_establishment_id", "decision", "reason", "pii_safe", "extraction_status"];
  const csvLines = [csvHeaders.join(",")];
  for (const r of rows) {
    const raw = r.raw_data as any;
    const decision = r.status === "ready" ? "CLEAN_APPROVABLE" : r.status === "normalized" ? "SOURCE_REVIEW" : r.status === "duplicate_exact" ? "DUPLICATE_EXACT" : r.status === "duplicate_review" ? "DUPLICATE_REVIEW" : r.status === "rejected" ? "INVALID" : r.status;
    csvLines.push([
      csvEscape(r.id), csvEscape(r.name_raw), csvEscape(r.name_raw), csvEscape(r.region), csvEscape(r.city),
      csvEscape(raw?.educationFamilyHint ?? "IPES/Université d'Etat"), csvEscape(raw?.identifiers?.creation_order_raw), csvEscape(raw?.identifiers?.opening_authorization_raw),
      csvEscape(r.source_url), csvEscape(r.duplicate_of_establishment_id ? "MATCH" : raw?.has_detail_page ? "NO_MATCH (fiche détail disponible)" : "NO_MATCH (liste seule)"), csvEscape(r.duplicate_of_establishment_id),
      csvEscape(decision), csvEscape(raw?.has_detail_page === false ? "aucune fiche détail MINESUP disponible pour ce candidat" : "candidat nouveau, aucun signal de doublon"),
      csvEscape(!raw?.pii_field_present_but_not_collected), csvEscape("PASS"),
    ].join(","));
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-review.csv"), csvLines.join("\n"), "utf-8");

  // ── Approval snapshot (CLEAN_APPROVABLE only) ──
  const cleanApprovable = rows.filter((r: any) => r.status === "ready");
  const approvalCandidates = cleanApprovable.map((r: any) => {
    const raw = r.raw_data as any;
    return {
      staging_id: r.id, name: r.name_raw, region: r.region, city: r.city, category: r.education_family,
      authority: "MINESUP", registry: "MINESUP_IPES", source: r.source_url, decision: "CLEAN_APPROVABLE",
      identifiers: { creation_order: raw?.identifiers?.creation_order_raw ?? null, opening_authorization: raw?.identifiers?.opening_authorization_raw ?? null },
    };
  });
  const checksum = sha256(JSON.stringify(approvalCandidates));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-approval.json"), JSON.stringify({
    generated_at: new Date().toISOString(), operator, sprint: "MINESUP-C", batch,
    candidate_count: approvalCandidates.length, candidates: approvalCandidates, checksum,
  }, null, 2), "utf-8");

  // ── Link proposals — candidats avec un match live existant (aucun cas ce pilote, structure prête) ──
  const linkProposalHeaders = ["existing_establishment_id", "candidate_staging_id", "registry", "identifier_type", "identifier", "match_type", "confidence", "reason"];
  const linkProposalLines = [linkProposalHeaders.join(",")];
  for (const r of rows) {
    if (!r.duplicate_of_establishment_id) continue;
    const raw = r.raw_data as any;
    if (raw?.identifiers?.creation_order_raw) linkProposalLines.push([csvEscape(r.duplicate_of_establishment_id), csvEscape(r.id), csvEscape("MINESUP_IPES"), csvEscape("CREATION_ORDER"), csvEscape(raw.identifiers.creation_order_raw), csvEscape(r.status), csvEscape("proposed, not executed"), csvEscape("candidat matché contre un établissement live existant")].join(","));
    if (raw?.identifiers?.opening_authorization_raw) linkProposalLines.push([csvEscape(r.duplicate_of_establishment_id), csvEscape(r.id), csvEscape("MINESUP_IPES"), csvEscape("OPENING_AUTHORIZATION"), csvEscape(raw.identifiers.opening_authorization_raw), csvEscape(r.status), csvEscape("proposed, not executed"), csvEscape("candidat matché contre un établissement live existant")].join(","));
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-identifier-link-proposals.csv"), linkProposalLines.join("\n"), "utf-8");

  return {
    total_staging_rows: rows.length,
    by_status: Object.fromEntries(byStatus),
    clean_approvable_count: approvalCandidates.length,
    approval_checksum: checksum,
    link_proposals_count: linkProposalLines.length - 1,
  };
}
