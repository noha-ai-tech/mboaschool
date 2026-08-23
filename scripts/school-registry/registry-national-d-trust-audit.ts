import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveEstablishmentTrustState,
  trustInputFromEstablishmentRow,
  getPrimaryPublicBadge,
} from "../../src/lib/trust/resolveEstablishmentTrustState";

const REPORTS_DIR = join(process.cwd(), "reports", "registry");

const authorized3 = [
  { id: "fef9e2a5-fe95-45f5-9416-e33aae3b6d46", name: "École de Formation (EFO) - CCAA", is_verified: false, owner_id: null, is_claimed: false, verification_status: null, official_id: null, source_ministry: "MINTRANSPORT" },
  { id: "9e458451-dc1d-40c2-8ecc-ad883478ddab", name: "Centre de formation professionnelle maritime « Le Paquebot »", is_verified: false, owner_id: null, is_claimed: false, verification_status: null, official_id: null, source_ministry: "MINTRANSPORT" },
  { id: "f6635829-0c3f-4e15-a144-2f1f7c99ab24", name: "AUTO ECOLE ASTRALE", is_verified: false, owner_id: null, is_claimed: false, verification_status: null, official_id: null, source_ministry: "MINTRANSPORT" },
];

// Sample: unverified establishment with no registry provenance at all (baseline).
const sampleNone = { id: "sample-none", name: "(sample) no registry provenance, not verified", is_verified: false, owner_id: null, is_claimed: false, verification_status: null, official_id: null, source_ministry: null };
// Sample: platform-verified only (is_verified=true) — must NOT show an official badge.
const samplePlatformOnly = { id: "sample-platform", name: "(sample) platform-verified only", is_verified: true, owner_id: "some-owner", is_claimed: true, verification_status: "active", official_id: null, source_ministry: null };
// Sample: registry identifier CORROBORATED — the only path that may reach OFFICIALLY_VERIFIED.
const sampleOfficial = { id: "sample-official", name: "(sample) registry identifier CORROBORATED", is_verified: false, owner_id: null, is_claimed: false, verification_status: null, official_id: "X-123", source_ministry: "MINESUP" };

function audit(row: any) {
  const extra =
    row.id === "sample-official"
      ? { registryIdentifierVerificationStatuses: ["CORROBORATED"] }
      : undefined;
  const state = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(row, extra));
  return {
    id: row.id,
    name: row.name,
    input: { is_verified: row.is_verified, owner_id: row.owner_id, official_id: row.official_id, source_ministry: row.source_ministry },
    state,
    primary_badge: getPrimaryPublicBadge(state),
  };
}

const results = [...authorized3, sampleNone, samplePlatformOnly, sampleOfficial].map(audit);

const report = {
  sprint: "REGISTRY-NATIONAL-D",
  generated_at: new Date().toISOString(),
  method: "Direct import + call of the pure resolveEstablishmentTrustState() function (no DB, no HTTP — deterministic by construction) with real field values for the 3 authorized establishments (confirmed live this sprint), plus 3 illustrative samples covering the 'no provenance', 'platform-verified only', and 'officially verified' cases.",
  results,
  invariant_checks: {
    authorized_3_never_officially_verified: authorized3
      .map((r) => audit(r))
      .every((r) => r.state.official_verification !== "OFFICIALLY_VERIFIED"),
    authorized_3_directory_status_listed: authorized3.map((r) => audit(r)).every((r) => r.state.directory_status === "LISTED"),
    authorized_3_not_claimed: authorized3.map((r) => audit(r)).every((r) => r.state.claim_status === "UNCLAIMED"),
    authorized_3_not_platform_verified: authorized3.map((r) => audit(r)).every((r) => r.state.platform_verification === "NOT_PLATFORM_VERIFIED"),
    platform_verified_alone_never_yields_official_badge: audit(samplePlatformOnly).state.official_verification !== "OFFICIALLY_VERIFIED" && audit(samplePlatformOnly).state.official_verification !== "OFFICIAL_SOURCE_FOUND",
    officially_verified_requires_corroborated_registry_identifier: audit(sampleOfficial).state.official_verification === "OFFICIALLY_VERIFIED",
  },
  note: "Per brief §8/§18/§24: official_verification for the 3 authorized establishments resolves to OFFICIAL_SOURCE_FOUND (source_ministry='MINTRANSPORT' is cited), which is expected and permitted — it is a distinct, clearly-labeled badge ('Source officielle disponible') from OFFICIALLY_VERIFIED ('Vérification officielle'), which never triggers without a CORROBORATED/CONFIRMED registry_identifier row (none exist for these 3 — confirmed 0 via live query this sprint).",
};

mkdirSync(REPORTS_DIR, { recursive: true });
writeFileSync(join(REPORTS_DIR, "registry-national-d-trust-audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
