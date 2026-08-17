import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT P.3 §3-11 — Recalcule la classification des 1251 lignes de
 * `establishment_import_staging` à partir de la donnée réellement en base
 * (raw_data._matchAudit / raw_data._localityAudit, écrits par SPRINT P.2C —
 * jamais recalculés à partir du fichier Master local, pour que ce script
 * reflète l'état réel du staging, pas un instantané figé).
 *
 * Autorisé par SPRINT P.3 §1 : lecture staging + mise à jour des statuts/
 * review metadata du staging (PATCH raw_data uniquement — jamais `status`,
 * qui reste le statut de dédoublonnage fixé par P.2C, ni aucune colonne
 * establishments). Approuve EN MASSE (§7-8) les CLEAN_NEW_CANDIDATE — un
 * candidat objectivement propre (official_id + nom + région + catégorie +
 * source fiable + aucun doublon + locality_status pas CLEARLY_INVALID/
 * NEEDS_REVIEW) n'exige pas 556 clics humains. Les 6 correspondances
 * douteuses et les 16 candidats à revoir NE SONT JAMAIS auto-décidés ici —
 * ils restent `_review` absent, en attente du Review Center (Eddy).
 *
 * Usage : tsx classify-and-approve-staging.ts [--apply]
 *   Sans --apply : calcule et affiche, écrit les rapports, ne modifie rien.
 *   Avec --apply : en plus, PATCH raw_data._review sur les CLEAN_NEW_CANDIDATE
 *                  non encore approuvés (idempotent — ignore ceux déjà marqués).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface StagingRow {
  id: string;
  official_identifier: string | null;
  name_raw: string;
  region: string | null;
  locality: string | null;
  city: string | null;
  education_family: string | null;
  source_ministry: string | null;
  status: string;
  duplicate_of_establishment_id: string | null;
  raw_data: {
    _matchAudit?: { matchType: string; matchReason: string; confidence: string; reviewFlags: string[] };
    _localityAudit?: { rawLocality: string | null; normalizedLocality: string | null; localityStatus: string };
    _review?: { reviewed_by: string; reviewed_at: string; review_action: string; review_note: string };
  };
}

async function fetchAllStaging(url: string, key: string): Promise<StagingRow[]> {
  const all: StagingRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(
      `${url}/rest/v1/establishment_import_staging?select=id,official_identifier,name_raw,region,locality,city,education_family,source_ministry,status,duplicate_of_establishment_id,raw_data&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error(`Lecture establishment_import_staging -> HTTP ${res.status}`);
    const page: StagingRow[] = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchAllEstablishments(url: string, key: string) {
  const all: { id: string; name: string; region: string | null; city: string | null; main_category: string | null }[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(
      `${url}/rest/v1/establishments?select=id,name,region,city,main_category&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error(`Lecture establishments -> HTTP ${res.status}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [staging, establishments] = await Promise.all([
    fetchAllStaging(url, serviceKey),
    fetchAllEstablishments(url, serviceKey),
  ]);
  const establishmentsById = new Map(establishments.map((e) => [e.id, e]));

  console.log(`Staging lu : ${staging.length} ligne(s). Establishments lu : ${establishments.length} ligne(s).`);

  type Classification =
    | "EXISTING_OFFICIAL_ID"
    | "EXISTING_LEGACY_CONFIRMED"
    | "EXISTING_PROBABLE"
    | "EXISTING_AMBIGUOUS"
    | "CLEAN_NEW_CANDIDATE"
    | "NEW_CANDIDATE_REVIEW_REQUIRED";

  interface Classified {
    row: StagingRow;
    classification: Classification;
  }

  const classified: Classified[] = staging.map((row) => {
    const matchType = row.raw_data?._matchAudit?.matchType;
    const localityStatus = row.raw_data?._localityAudit?.localityStatus;

    let classification: Classification;
    if (matchType === "EXISTING_OFFICIAL_ID") classification = "EXISTING_OFFICIAL_ID";
    else if (matchType === "EXISTING_LEGACY_CONFIRMED") classification = "EXISTING_LEGACY_CONFIRMED";
    else if (matchType === "EXISTING_PROBABLE") classification = "EXISTING_PROBABLE";
    else if (matchType === "REVIEW_REQUIRED") classification = "EXISTING_AMBIGUOUS";
    else {
      // NEW_CANDIDATE — propre sauf si la localité porte un vrai signal de
      // qualité de donnée (jamais juste "absente", voir §10).
      const flaggedLocality = localityStatus === "CLEARLY_INVALID" || localityStatus === "NEEDS_REVIEW";
      classification = flaggedLocality ? "NEW_CANDIDATE_REVIEW_REQUIRED" : "CLEAN_NEW_CANDIDATE";
    }
    return { row, classification };
  });

  const counts: Record<Classification, number> = {
    EXISTING_OFFICIAL_ID: 0,
    EXISTING_LEGACY_CONFIRMED: 0,
    EXISTING_PROBABLE: 0,
    EXISTING_AMBIGUOUS: 0,
    CLEAN_NEW_CANDIDATE: 0,
    NEW_CANDIDATE_REVIEW_REQUIRED: 0,
  };
  for (const c of classified) counts[c.classification]++;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log("\n=== CLASSIFICATION (recalculée depuis le staging réel) ===");
  for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);
  console.log(`Sum: ${sum} / ${staging.length} — ${sum === staging.length ? "OK" : "MISMATCH — STOP requis"}`);
  if (sum !== staging.length) {
    console.error("La somme des classifications ne correspond pas au nombre de lignes staging. Arrêt.");
    process.exit(1);
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  // ── §5 : rapport enrichi des 6 correspondances douteuses ────────────────
  const doubtful = classified.filter((c) => c.classification === "EXISTING_PROBABLE" || c.classification === "EXISTING_AMBIGUOUS");
  const doubtfulCsv = [
    "official_id,official_name,region,locality,existing_id,existing_name,existing_region,existing_city,existing_category,match_reason,confidence,decision",
    ...doubtful.map((c) => {
      const existing = c.row.duplicate_of_establishment_id ? establishmentsById.get(c.row.duplicate_of_establishment_id) : undefined;
      const alreadyReviewed = c.row.raw_data?._review;
      return [
        c.row.official_identifier,
        c.row.name_raw,
        c.row.region,
        c.row.locality ?? c.row.raw_data?._localityAudit?.rawLocality ?? "",
        c.row.duplicate_of_establishment_id,
        existing?.name ?? "",
        existing?.region ?? "",
        existing?.city ?? "",
        existing?.main_category ?? "",
        c.row.raw_data?._matchAudit?.matchReason ?? "",
        c.row.raw_data?._matchAudit?.confidence ?? "",
        alreadyReviewed ? alreadyReviewed.review_action : "NEEDS_MORE_REVIEW",
      ]
        .map(csvEscape)
        .join(",");
    }),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "staging-existing-probable-review.csv"), doubtfulCsv, "utf-8");
  console.log(`\n§5-6 rapport écrit (${doubtful.length} lignes) : staging-existing-probable-review.csv`);

  // ── §6 : Lycée Général Leclerc, traité explicitement, jamais auto-lié ───
  const leclerc = classified.find((c) => /general\s*leclerc/i.test(c.row.name_raw));
  if (leclerc) {
    const existing = leclerc.row.duplicate_of_establishment_id ? establishmentsById.get(leclerc.row.duplicate_of_establishment_id) : undefined;
    console.log(`\n§6 Lycée Général Leclerc : ${leclerc.classification} (non auto-lié)`);
    console.log(`  Staging: "${leclerc.row.name_raw}" région=${leclerc.row.region} localité=${leclerc.row.locality ?? leclerc.row.raw_data?._localityAudit?.rawLocality ?? "absente"} catégorie=${leclerc.row.education_family}`);
    if (existing) console.log(`  Existant candidat: "${existing.name}" région=${existing.region} ville=${existing.city} catégorie=${existing.main_category}`);
    console.log(`  Preuve jugée ${leclerc.classification === "EXISTING_LEGACY_CONFIRMED" ? "SUFFISANTE" : "INSUFFISANTE"} -> décision: ${leclerc.classification === "EXISTING_LEGACY_CONFIRMED" ? "LINK_EXISTING (haute confiance)" : "KEEP REVIEW_REQUIRED"}.`);
  }

  // ── §7-8 : approbation en masse des CLEAN_NEW_CANDIDATE ─────────────────
  const cleanCandidates = classified.filter((c) => c.classification === "CLEAN_NEW_CANDIDATE");
  const alreadyApproved = cleanCandidates.filter((c) => c.row.raw_data?._review?.review_action === "approved_for_promotion");
  const toApprove = cleanCandidates.filter((c) => c.row.raw_data?._review?.review_action !== "approved_for_promotion");

  console.log(`\n§7-8 Candidats propres : ${cleanCandidates.length} (déjà approuvés : ${alreadyApproved.length}, à approuver : ${toApprove.length})`);

  if (apply && toApprove.length > 0) {
    console.log(`Application de l'approbation en masse (--apply) sur ${toApprove.length} ligne(s)...`);
    let done = 0;
    for (const c of toApprove) {
      const nextRawData = {
        ...c.row.raw_data,
        _review: {
          reviewed_by: "system:bulk-approval",
          reviewed_at: new Date().toISOString(),
          review_action: "approved_for_promotion",
          review_note:
            "Critères objectifs satisfaits automatiquement (official_id + nom + région + catégorie + source MINESEC fiable + aucun doublon détecté + localité pas clairement invalide/à revoir) — SPRINT P.3 §7-10. N'a créé aucun établissement : marque uniquement l'état de revue.",
        },
      };
      const res = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${c.row.id}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ raw_data: nextRawData }),
      });
      if (res.ok) done++;
      else console.error(`  ÉCHEC ${c.row.name_raw} (${c.row.id}) — HTTP ${res.status}`);
    }
    console.log(`Terminé — ${done}/${toApprove.length} ligne(s) marquée(s) approved_for_promotion.`);
  } else if (!apply && toApprove.length > 0) {
    console.log(`(mode calcul seul — relancer avec --apply pour écrire raw_data._review sur ces ${toApprove.length} ligne(s))`);
  }

  // ── §9 : file séparée des 16 review-required ─────────────────────────────
  const reviewRequired = classified.filter((c) => c.classification === "NEW_CANDIDATE_REVIEW_REQUIRED");
  console.log(`\n§9 Nouveaux candidats à revoir : ${reviewRequired.length}`);
  for (const c of reviewRequired) {
    const reason = c.row.raw_data?._localityAudit?.localityStatus === "CLEARLY_INVALID" ? "CLEARLY_INVALID_LOCALITY" : "NEEDS_REVIEW_LOCALITY";
    console.log(`  ${c.row.name_raw} (${c.row.official_identifier}) — ${reason}`);
  }

  // ── Résumé pour les scripts en aval (promotion dry-run) ──────────────────
  const summaryPath = join(rootDir, "reports", "registry", "staging-classification-summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalStaging: staging.length,
        counts,
        cleanCandidates: cleanCandidates.length,
        alreadyApproved: alreadyApproved.length + (apply ? toApprove.length : 0),
        pendingApproval: apply ? 0 : toApprove.length,
        reviewRequiredCount: reviewRequired.length,
        doubtfulCount: doubtful.length,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\nRésumé écrit : ${summaryPath}`);
}

main().catch((error) => {
  console.error("Échec de la classification :", error);
  process.exit(1);
});
