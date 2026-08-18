import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT R §14-18 — Résolution nommée des 6 cas `duplicate_review`. Chaque
 * décision est justifiée individuellement (jamais sur similarité de texte
 * seule, §15) et documentée ici en dur — pas un algorithme générique,
 * volontairement, pour que le raisonnement reste auditable ligne par ligne.
 *
 * Écrit UNIQUEMENT establishment_import_staging (status, raw_data._review,
 * et duplicate_of_establishment_id pour les NOT_DUPLICATE). Ne touche
 * JAMAIS `establishments` — aucun établissement live modifié, aucune
 * suppression (§16 : "aucun changement de l'établissement live").
 *
 * Usage : tsx resolve-duplicate-review.ts [--apply]
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

type Verdict = "CONFIRMED_DUPLICATE" | "NOT_DUPLICATE" | "STILL_AMBIGUOUS";

interface Decision {
  officialId: string;
  verdict: Verdict;
  reason: string;
}

// Raisonnement détaillé — voir reports/registry/duplicate-review-decisions.md
const DECISIONS: Decision[] = [
  {
    officialId: "5EL1GSFD102849115", // CES de NKOLMELEN
    verdict: "NOT_DUPLICATE",
    reason:
      "Candidat live \"École Publique de Melen\" est main_category=primaire ; la ligne staging est un CES (secondary_general). " +
      "Même toponyme (Melen/Nkolmelen), catégories manifestement différentes (§17, exemple type) — deux établissements distincts.",
  },
  {
    officialId: "5LH1GSFD111715052", // Lycée Général Leclerc
    verdict: "STILL_AMBIGUOUS",
    reason:
      "Nom quasi identique + même région (Centre) + même catégorie (secondaire), mais AUCUNE localité disponible d'aucun côté pour corroborer " +
      "(candidate live n'a que city=Yaoundé, ville entière). Politique constante du projet depuis SPRINT P.2C : le nom seul n'est jamais une preuve " +
      "suffisante. Aucune nouvelle donnée ce sprint ne permet de lever l'ambiguïté — reste en revue.",
  },
  {
    officialId: "5LJ1GSBD110162077", // Lyce Bilingue de YAOUNDE
    verdict: "STILL_AMBIGUOUS",
    reason:
      "Nom quasi identique + même région + même catégorie, mais locality_missing côté staging et city=Yaoundé (ville de plus de 2M d'habitants, " +
      "aucune granularité de quartier) côté live — aucune corroboration indépendante du nom. Même politique que Général Leclerc : reste en revue, " +
      "pas de confirmation sur similarité de nom seule.",
  },
  {
    officialId: "5LL1GSFD112162098", // Lyce Classique de NKOLBISSON
    verdict: "NOT_DUPLICATE",
    reason:
      "Candidat live est \"Lycée TECHNIQUE de Nkolbisson\", la ligne staging est un \"Lycée CLASSIQUE de Nkolbisson\" — deux établissements " +
      "distincts par construction dans le système éducatif camerounais (filière classique vs filière technique), coexistant fréquemment dans la " +
      "même localité. Le nom lui-même porte la distinction, pas seulement une similarité de texte fortuite.",
  },
  {
    officialId: "7IC1GSBD110036092", // Lyce Bilingue de DEIDO
    verdict: "CONFIRMED_DUPLICATE",
    reason:
      "Nom quasi identique + même région (Littoral) + même catégorie + corroboration INDÉPENDANTE du nom : la localité renseignée côté staging " +
      "(\"DEDO\") est auto-cohérente avec le nom de l'établissement lui-même (\"...de DEIDO\", quartier connu de Douala) — pas une simple " +
      "similarité de texte entre deux enregistrements différents, mais deux champs indépendants du MÊME enregistrement staging qui se corroborent " +
      "mutuellement, en plus de la correspondance de nom avec l'existant.",
  },
  {
    officialId: "7IE1GSBD110300109", // Lyce Bilingue de NEW-BELL
    verdict: "NOT_DUPLICATE",
    reason:
      "Candidat live \"École Publique de New Bell\" est main_category=primaire ; la ligne staging est un Lycée Bilingue (secondary_general). " +
      "Même toponyme (New-Bell), catégories manifestement différentes — deux établissements distincts, même logique que NKOLMELEN.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(`${url}/rest/v1/establishment_import_staging?status=eq.duplicate_review&select=id,official_identifier,name_raw,raw_data`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`Lecture staging -> HTTP ${res.status}`);
  const staging: { id: string; official_identifier: string; name_raw: string; raw_data: Record<string, unknown> }[] = await res.json();

  if (staging.length !== DECISIONS.length) {
    console.error(`ATTENTION — ${staging.length} ligne(s) duplicate_review trouvée(s), ${DECISIONS.length} décision(s) documentée(s). Vérifier avant d'appliquer.`);
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const rows: string[] = ["official_id,name_raw,verdict,reason"];

  let confirmed = 0, notDup = 0, ambiguous = 0, notFound = 0;

  for (const row of staging) {
    const decision = DECISIONS.find((d) => d.officialId === row.official_identifier);
    if (!decision) {
      console.log(`AUCUNE décision documentée pour ${row.official_identifier} (${row.name_raw}) — laissé tel quel.`);
      notFound++;
      continue;
    }

    console.log(`\n${row.name_raw} (${row.official_identifier}) -> ${decision.verdict}`);
    console.log(`  ${decision.reason}`);
    rows.push([decision.officialId, row.name_raw, decision.verdict, decision.reason].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

    if (decision.verdict === "CONFIRMED_DUPLICATE") confirmed++;
    else if (decision.verdict === "NOT_DUPLICATE") notDup++;
    else ambiguous++;

    if (!apply) continue;

    const nextReview = {
      reviewed_by: "operator:jean-merlain",
      reviewed_at: new Date().toISOString(),
      review_action: decision.verdict === "CONFIRMED_DUPLICATE" ? "link_existing" : decision.verdict === "NOT_DUPLICATE" ? "keep_as_new" : "needs_more_review",
      review_note: decision.reason,
    };
    const nextRawData = { ...row.raw_data, _review: nextReview, _duplicateReviewVerdict: decision.verdict };

    const patchBody: Record<string, unknown> = { raw_data: nextRawData };
    if (decision.verdict === "CONFIRMED_DUPLICATE") {
      patchBody.status = "duplicate_exact"; // duplicate_of_establishment_id déjà renseigné, conservé tel quel
    } else if (decision.verdict === "NOT_DUPLICATE") {
      patchBody.status = "ready";
      patchBody.duplicate_of_establishment_id = null; // ne correspond PAS à ce candidat live — jamais laissé pointer vers un mauvais match
    }
    // STILL_AMBIGUOUS : status reste duplicate_review, uniquement raw_data._review mis à jour.

    const patchRes = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patchBody),
    });
    if (!patchRes.ok) console.error(`  ÉCHEC PATCH ${row.id} : HTTP ${patchRes.status}`);
  }

  writeFileSync(join(rootDir, "reports", "registry", "duplicate-review-decisions.csv"), rows.join("\n"), "utf-8");

  console.log(`\n=== RÉSUMÉ ===`);
  console.log(`Before: ${staging.length}`);
  console.log(`CONFIRMED_DUPLICATE: ${confirmed}`);
  console.log(`NOT_DUPLICATE: ${notDup}`);
  console.log(`STILL_AMBIGUOUS: ${ambiguous}`);
  console.log(`Sans décision documentée: ${notFound}`);
  console.log(`After (reste en duplicate_review): ${ambiguous + notFound}`);
  console.log(apply ? "\n--apply : écritures effectuées (staging uniquement)." : "\n(mode calcul seul — relancer avec --apply pour écrire)");
}

main().catch((error) => {
  console.error("Échec résolution duplicate_review :", error);
  process.exit(1);
});
