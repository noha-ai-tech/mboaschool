import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REPORTS_DIR = join(rootDir, "reports", "registry");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length && r.some((v) => v !== "")).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i]));
    return o;
  });
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  const deferred: any[] = [];

  // ── MINESUP: minesup-e-national-candidates.csv (DUPLICATE_REVIEW / SOURCE_REVIEW / INVALID) ──
  const minesupCandidates = csvToObjects(
    readFileSync(join(REPORTS_DIR, "minesup-e-national-candidates.csv"), "utf-8")
  );
  const minesupMatches = csvToObjects(
    readFileSync(join(REPORTS_DIR, "minesup-e-existing-matches.csv"), "utf-8")
  );
  const matchByName = new Map(minesupMatches.map((m) => [m.candidate_name, m]));
  const reasonCodeForMinesup: Record<string, string> = {
    DUPLICATE_REVIEW: "DEFERRED_V2_DUPLICATE",
    SOURCE_REVIEW: "DEFERRED_V2_SOURCE",
    INVALID: "REJECTED_INVALID",
  };
  let minesupCount = 0;
  for (const c of minesupCandidates) {
    if (!["DUPLICATE_REVIEW", "SOURCE_REVIEW", "INVALID"].includes(c.decision)) continue;
    minesupCount++;
    const match = matchByName.get(c.name);
    deferred.push({
      candidate_id: `MINESUP-E:${c.name}`,
      name: c.name,
      ministry: "MINESUP",
      source_authority: "MINESUP national IPES + state university consolidation (MINESUP-E)",
      staging_source_reference: "reports/registry/minesup-e-national-candidates.csv",
      reason_code: reasonCodeForMinesup[c.decision] ?? "DEFERRED_V2_SOURCE",
      reason_detail: match?.reason || c.decision,
      matching_signal: c.match_type || null,
      identity_state: c.decision,
      source_confidence: c.identifier_count && Number(c.identifier_count) > 0 ? "HAS_IDENTIFIER" : "NO_IDENTIFIER",
      official_verification_state: "NOT_VERIFIED",
      cross_ministry_evidence: null,
      recommended_future_action:
        c.decision === "INVALID"
          ? "Discard — not a valid establishment record."
          : "Human review of matched_target (see minesup-e-existing-matches.csv) before any future publication attempt.",
    });
  }

  // ── MINSANTE: 22-candidate pilot, live status for the 14 not promoted (8 were, via minsante-h) ──
  const minsantePilot = csvToObjects(
    readFileSync(join(REPORTS_DIR, "minsante-b-pilot-candidates.csv"), "utf-8")
  );
  const stagingIds = minsantePilot.map((r) => r.staging_id).filter(Boolean);
  const { data: liveStagingRows, error: stagingErr } = await supabase
    .from("establishment_import_staging")
    .select("id, status, name_raw")
    .in("id", stagingIds);
  if (stagingErr) throw stagingErr;
  const liveById = new Map((liveStagingRows ?? []).map((r: any) => [r.id, r]));
  let minsantePilotDeferredCount = 0;
  for (const c of minsantePilot) {
    const live = liveById.get(c.staging_id);
    if (live && live.status === "promoted") continue;
    minsantePilotDeferredCount++;
    deferred.push({
      candidate_id: `MINSANTE-PILOT:${c.staging_id}`,
      name: c.name_raw,
      ministry: "MINSANTE",
      source_authority: "MINSANTE pilot (22-candidate batch, minsante-b through g3-final-preflight)",
      staging_source_reference: `establishment_import_staging.id=${c.staging_id}`,
      reason_code:
        c.classification === "DUPLICATE_REVIEW"
          ? "DEFERRED_V2_DUPLICATE"
          : "DEFERRED_V2_CATEGORY",
      reason_detail: c.classification_reason || c.classification,
      matching_signal: `original_B_classification=${c.classification}; live_staging_status=${live?.status ?? "not_found"}`,
      identity_state: c.classification,
      source_confidence: "PILOT_SOURCE",
      official_verification_state: "NOT_VERIFIED",
      cross_ministry_evidence: null,
      recommended_future_action:
        "Confirmed via minsante-g3-deferred-protection.json (13 category_review + 1 duplicate_review = 14 of 22 not promoted). Live staging status cross-checked this sprint. See registry-national-d-resolution-evidence.csv.",
    });
  }

  // ── MINSANTE: Imagerie Médicale quarantined program (never staged — documentary block) ──
  deferred.push({
    candidate_id: "MINSANTE-QUARANTINE:imagerie-medicale",
    name: "Imagerie Médicale (MINSANTE program-level quarantine — up to 31 physical rows, never staged)",
    ministry: "MINSANTE",
    source_authority: "MINSANTE source PDF, program-level extraction (MINSANTE-I.1/I.2)",
    staging_source_reference:
      "reports/registry/minsante-i2-imagerie-validation.json, reports/registry/minsante-i2-human-validation-pack.md",
    reason_code: "DEFERRED_V2_DOCUMENTARY",
    reason_detail:
      "QUARANTINED_NUMBERING_ABSENT (permanent source defect, confirmed via getOperatorList()/structure tree — not a parsing artifact) + a merged Bafang/Bafoussam physical row (sequence 29, region Ouest) that may represent two distinct schools (demonstrated_minimum_physical_row_count=31, not 30). human_documentary_validation_required=true.",
    matching_signal: null,
    identity_state: "UNRESOLVED",
    source_confidence: "SOURCE_INCOMPLETE",
    official_verification_state: "NOT_VERIFIED",
    cross_ministry_evidence: null,
    recommended_future_action:
      "MUST NOT be silently marked SAFE. Requires explicit MINSANTE confirmation of (A) exhaustive total and (B) that the two merged names are genuinely distinct schools, per the escalation pack already produced (minsante-i2-human-validation-pack.md). ready_for_minsante_j=false — blocks MINSANTE-J until resolved.",
  });
  deferred.push({
    candidate_id: "MINSANTE-QUARANTINE:sciences-pharmaceutiques",
    name: "Sciences Pharmaceutiques (MINSANTE program-level quarantine, 32 candidates)",
    ministry: "MINSANTE",
    source_authority: "MINSANTE source PDF, program-level extraction",
    staging_source_reference: "reports/registry/minsante-i-quarantined-program-review.csv",
    reason_code: "DEFERRED_V2_DOCUMENTARY",
    reason_detail: "QUARANTINED_STRUCTURE_AMBIGUOUS — font-decoding glyph defect cascades onto Est-region numbering.",
    matching_signal: null,
    identity_state: "UNRESOLVED",
    source_confidence: "SOURCE_INCOMPLETE",
    official_verification_state: "NOT_VERIFIED",
    cross_ministry_evidence: null,
    recommended_future_action: "Same documentary-validation requirement as Imagerie Médicale before any extraction attempt.",
  });

  // ── MINTRANSPORT: 14 of 17 Tier-3 candidates not (yet) live (3 published via registry-national-c) ──
  const transportDeferred5 = csvToObjects(
    readFileSync(join(REPORTS_DIR, "transport-a2-t3-import-exec-deferred.csv"), "utf-8")
  );
  for (const c of transportDeferred5) {
    deferred.push({
      candidate_id: `MINTRANSPORT:${c.candidate_id}`,
      name: c.name,
      ministry: "MINTRANSPORT",
      source_authority: "MINTRANSPORT Tier-3 discovery (TRANSPORT-A.2-T3)",
      staging_source_reference: "reports/registry/transport-a2-t3-import-exec-deferred.csv",
      reason_code: "DEFERRED_V2_MISSING_PROVENANCE",
      reason_detail: c.reason_not_staged || "MISSING_SOURCE_URL",
      matching_signal: c.missing_provenance_element || null,
      identity_state: "IDENTITY_KNOWN_SOURCE_MISSING",
      source_confidence: "NO_VERIFIABLE_SOURCE_URL",
      official_verification_state:
        c.candidate_id === "TC-17"
          ? "MINEFOP_IDENTIFIER_N000471_PRESERVED_AS_METADATA_ONLY_NEVER_MINTRANSPORT"
          : "NOT_VERIFIED",
      cross_ministry_evidence: c.candidate_id === "TC-17" ? "MINEFOP N°000471 (19-09-2022) — never converted to MINTRANSPORT" : null,
      recommended_future_action: c.recommended_remediation || "Re-run targeted discovery for a verifiable source URL.",
    });
  }
  // Remaining 9 (of the 12 "insertable" bucket minus the 3 already published) — still under
  // TRANSPORT-A.2-T3's own review classification (SOURCE_REVIEW / DUPLICATE_REVIEW / IDENTITY_REVIEW),
  // never separately authorized. Not re-researched this sprint — preserved exactly as classified.
  deferred.push({
    candidate_id: "MINTRANSPORT:TC-remaining-9",
    name: "9 remaining MINTRANSPORT Tier-3 candidates (of the 12-candidate 'insertable' bucket, excluding the 3 already published: EFO-CCAA, Le Paquebot, AUTO ECOLE ASTRALE)",
    ministry: "MINTRANSPORT",
    source_authority: "TRANSPORT-A.2-T3-IMPORT-EXEC preflight (decision D, WAITING_FOR_HUMAN_APPROVAL)",
    staging_source_reference: "reports/registry/transport-a2-t3-import-exec-preflight.json (classification_tally)",
    reason_code: "DEFERRED_V2_CROSS_MINISTRY",
    reason_detail:
      "classification_tally at this preflight: SOURCE_REVIEW=12, DUPLICATE_REVIEW=3, IDENTITY_REVIEW=2 across the full 17-candidate population (clean_approvable_count=0 at THIS specific preflight pass). The 3 published establishments were approved through a SEPARATE later revalidation (REGISTRY-NATIONAL-B/C), not through this preflight's own CLEAN_APPROVABLE bucket. Reconciling exactly which of the remaining 9 correspond to which classification bucket, and why 3 were approvable despite this preflight showing 0 CLEAN_APPROVABLE, was NOT re-derived this sprint — flagged as an open documentation gap rather than guessed. TC-12 (IT2MIP) specifically carries cross_ministry_decision=AMBIGUOUS (rejected fabricated MINEFOP identifier N°352/MINEFOP/SG/DFOP/SDGSF/SACD). TC-11 (EMIPAC) also flagged for review.",
    matching_signal: "AMBIGUOUS (TC-12 IT2MIP specifically)",
    identity_state: "MIXED_REVIEW_STATES_NOT_RECONCILED_THIS_SPRINT",
    source_confidence: "MIXED",
    official_verification_state: "NOT_VERIFIED",
    cross_ministry_evidence: "TC-12 IT2MIP: fabricated identifier already rejected in a prior sprint (see hallucination audit trail)",
    recommended_future_action:
      "Before any further MINTRANSPORT publication, reconcile TRANSPORT-A.2-T3's own classification_tally against the REGISTRY-NATIONAL-B/C revalidation logic that approved the 3, to establish a single authoritative status per remaining candidate. Do not batch-approve based on the 'insertable_count=12' figure alone — it does not equal 'clean'.",
  });

  // ── Sort deterministically ──
  deferred.sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : a.candidate_id > b.candidate_id ? 1 : 0));

  const snapshot = {
    sprint: "REGISTRY-NATIONAL-D",
    generated_at: new Date().toISOString(),
    total_deferred: deferred.length,
    by_ministry: deferred.reduce((acc: Record<string, number>, d) => {
      acc[d.ministry] = (acc[d.ministry] ?? 0) + 1;
      return acc;
    }, {}),
    by_reason_code: deferred.reduce((acc: Record<string, number>, d) => {
      acc[d.reason_code] = (acc[d.reason_code] ?? 0) + 1;
      return acc;
    }, {}),
    caveats: [
      "MINSANTE pilot entries: the 14-of-22-not-promoted COUNT is independently confirmed this sprint (live staging status cross-check against minsante-b-pilot-candidates.csv's 22 staging_ids). The reason_code split (DUPLICATE vs CATEGORY) uses each candidate's ORIGINAL MINSANTE-B classification, which may have been superseded by later MINSANTE-C/D/E/F/G reclassification passes not individually re-traced this sprint. The authoritative aggregate split per the latest source (minsante-g3-deferred-protection.json) is 13 category_review_excluded + 1 duplicate_review_excluded — this may not match this snapshot's per-candidate reason_code 1:1. Treat reason_code on these 14 entries as indicative, not final, pending a full C-G reclassification trace.",
      "MINTRANSPORT 'TC-remaining-9' entry is a single grouped placeholder, not 9 individual candidate rows — TRANSPORT-A.2-T3's own classification_tally (SOURCE_REVIEW=12/DUPLICATE_REVIEW=3/IDENTITY_REVIEW=2 across all 17) was not reconciled against which specific candidates correspond to the 3 already published vs the 9 remaining. See its reason_detail for the full explanation.",
    ],
    entries: deferred,
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  const snapshotPath = join(REPORTS_DIR, "registry-v2-deferred-snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  const checksumInput = JSON.stringify(deferred.map((d) => ({ candidate_id: d.candidate_id, name: d.name, reason_code: d.reason_code })));
  const checksum = createHash("sha256").update(checksumInput).digest("hex");
  writeFileSync(
    join(REPORTS_DIR, "registry-v2-deferred-checksum.json"),
    JSON.stringify(
      {
        sprint: "REGISTRY-NATIONAL-D",
        generated_at: new Date().toISOString(),
        total_deferred: deferred.length,
        checksum_algorithm: "sha256",
        checksum_input: "sorted array of {candidate_id, name, reason_code}",
        checksum,
        source_file: "reports/registry/registry-v2-deferred-snapshot.json",
        note: "This checksum is the official REGISTRY V2 restart point per REGISTRY-NATIONAL-D §19.",
      },
      null,
      2
    )
  );

  // ── §16 evidence matrix CSV, §18 final classification CSV, §12 unresolved CSV ──
  function csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const evidenceHeader = [
    "candidate_id", "name", "ministries", "previous_status", "source_1", "source_1_tier",
    "source_2", "source_2_tier", "independent_source_count", "official_source_found",
    "identity_confidence", "geo_confidence", "category_confidence", "duplicate_signal",
    "cross_ministry_signal", "official_identifier", "identifier_source", "final_certainty",
    "publication_decision", "reason",
  ];
  const evidenceRows = deferred.map((d) => {
    const finalCertainty =
      d.reason_code === "REJECTED_INVALID" ? "INVALID" :
      d.reason_code === "DEFERRED_V2_DUPLICATE" ? "CONFLICTING" :
      d.identity_state === "MIXED_REVIEW_STATES_NOT_RECONCILED_THIS_SPRINT" ? "UNRESOLVED" :
      "UNRESOLVED";
    return [
      d.candidate_id, d.name, d.ministry, d.identity_state,
      d.staging_source_reference, "Tier-3 (internal prior-sprint durable artifact, not re-verified this sprint)",
      "", "", d.staging_source_reference ? "1" : "0",
      d.official_verification_state === "NOT_VERIFIED" ? "NO" : "PARTIAL",
      d.identity_state, "", "", d.reason_code === "DEFERRED_V2_DUPLICATE" ? "YES" : "NO",
      d.reason_code === "DEFERRED_V2_CROSS_MINISTRY" ? "YES" : "NO",
      d.cross_ministry_evidence ?? "", d.cross_ministry_evidence ? "prior sprint (see cross_ministry_evidence)" : "",
      finalCertainty, "DO_NOT_PUBLISH_THIS_SPRINT", d.reason_detail,
    ];
  });
  const evidenceCsv = [evidenceHeader, ...evidenceRows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  writeFileSync(join(REPORTS_DIR, "registry-national-d-resolution-evidence.csv"), evidenceCsv);

  const unresolvedHeader = ["candidate_id", "name", "ministry", "reason_code", "reason_detail", "source_reference"];
  const unresolvedRows = deferred.map((d) => [d.candidate_id, d.name, d.ministry, d.reason_code, d.reason_detail, d.staging_source_reference]);
  const unresolvedCsv = [unresolvedHeader, ...unresolvedRows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  writeFileSync(join(REPORTS_DIR, "registry-national-d-unresolved.csv"), unresolvedCsv);

  const finalClassHeader = ["candidate_id", "name", "ministry", "final_v1_classification"];
  const finalClassRows = [
    ...["fef9e2a5-fe95-45f5-9416-e33aae3b6d46", "9e458451-dc1d-40c2-8ecc-ad883478ddab", "f6635829-0c3f-4e15-a144-2f1f7c99ab24"].map((id, i) => [
      id, ["École de Formation (EFO) - CCAA", "Centre de formation professionnelle maritime « Le Paquebot »", "AUTO ECOLE ASTRALE"][i],
      "MINTRANSPORT", "ALREADY_LIVE",
    ]),
    ...deferred.map((d) => [
      d.candidate_id, d.name, d.ministry,
      d.reason_code === "REJECTED_INVALID" ? "REJECTED_INVALID" : d.reason_code,
    ]),
  ];
  const finalClassCsv = [finalClassHeader, ...finalClassRows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  writeFileSync(join(REPORTS_DIR, "registry-national-d-final-classification.csv"), finalClassCsv);

  console.log(`MINESUP deferred/invalid: ${minesupCount}`);
  console.log(`MINSANTE pilot not-promoted: ${minsantePilotDeferredCount}`);
  console.log(`Total V2 deferred entries: ${deferred.length}`);
  console.log(`By ministry:`, snapshot.by_ministry);
  console.log(`By reason code:`, snapshot.by_reason_code);
  console.log(`Checksum: ${checksum}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
