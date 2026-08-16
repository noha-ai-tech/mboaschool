import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT O — Promotion manuelle du Batch 002 vers `establishments`.
 *
 * ATTENTION : écrit directement dans la base de production (clé
 * SUPABASE_SERVICE_ROLE_KEY, contourne RLS). Ne PAS lancer sans validation
 * explicite d'Eddy/architecte — voir rapport SPRINT O.
 *
 * `establishment_import_staging` (migration 0006) n'ayant jamais été
 * exécutée en prod, cette promotion écrit directement dans `establishments`
 * plutôt que de suivre le chemin staging -> revue -> promotion prévu par
 * l'architecture. Compromis documenté, pas l'architecture cible.
 *
 * `establishments` n'a pas de colonne pour le matricule MINESEC (aucun accès
 * DDL avec cette clé) : le matricule est conservé dans `description` plutôt
 * que perdu.
 *
 * Exclut les enregistrements sans localité (`city` est NOT NULL en base) —
 * voir reports/registry/batch-002-promotion-summary.json pour la liste des
 * exclus, à traiter séparément.
 *
 * Usage : node_modules/.bin/tsx promote-batch-002.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const REGION_LABELS: Record<string, string> = {
  OUEST: "Ouest",
  ADAMAOUA: "Adamaoua",
  NORD: "Nord",
  "EXTREME-NORD": "Extrême-Nord",
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  francophone: "francophone",
  bilingual: "bilingue",
  anglophone: "anglophone",
  unknown: "sous-système inconnu",
};

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const normalizedPath = join(rootDir, "data", "registry", "normalized", "minesec-ouest-grand-nord-2026-08-16.json");
  const batch: NormalizedStagingRecord[] = JSON.parse(readFileSync(normalizedPath, "utf-8"));

  const promotable = batch.filter((r) => r.status !== "rejected" && r.locality);
  const excluded = batch.filter((r) => r.status !== "rejected" && !r.locality);

  console.log(`${batch.length} enregistrement(s) au total, ${promotable.length} promouvable(s), ${excluded.length} exclu(s) (pas de localité).`);

  const usedSlugs = new Set<string>();
  const payload = promotable.map((r) => {
    const base = slugify(r.nameRaw);
    const tail = (r.officialIdentifier ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toLowerCase();
    let slug = tail ? `${base}-${tail}` : base;
    let n = 1;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${tail}-${n}`;
      n++;
    }
    usedSlugs.add(slug);

    const regionLabel = REGION_LABELS[r.region ?? ""] ?? r.region;
    const subsystemLabel = SUBSYSTEM_LABELS[r.subsystem] ?? r.subsystem;

    return {
      name: r.nameRaw,
      slug,
      main_category: "secondaire",
      region: regionLabel,
      city: r.locality,
      description:
        `Référencé depuis le registre national MINESEC (carte scolaire numérique, table ESG), ` +
        `collecte Sprint O (2026-08-16). Matricule officiel : ${r.officialIdentifier ?? "non renseigné"}. ` +
        `Sous-système : ${subsystemLabel}. Donnée non vérifiée — à confirmer par l'établissement ou revue humaine.`,
      verification_status: "referenced",
      is_verified: false,
      is_claimed: false,
      subscription_plan: "free",
      forfait: "gratuit",
    };
  });

  const CHUNK = 100;
  let inserted = 0;
  const errors: { chunkStart: number; status: number; body: string }[] = [];

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const res = await fetch(`${url}/rest/v1/establishments`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(chunk),
    });

    if (res.ok) {
      inserted += chunk.length;
      console.log(`  Lot ${i}-${i + chunk.length}: OK (${chunk.length} ligne(s))`);
    } else {
      const text = await res.text();
      errors.push({ chunkStart: i, status: res.status, body: text.slice(0, 500) });
      console.error(`  Lot ${i}-${i + chunk.length}: ÉCHEC HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
  }

  const countRes = await fetch(
    `${url}/rest/v1/establishments?select=id&region=in.(Ouest,Adamaoua,Nord,"Extr%C3%AAme-Nord")`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" } }
  );
  const totalNowInRegions = countRes.headers.get("content-range")?.split("/")[1] ?? "?";

  const summary = {
    generatedAt: new Date().toISOString(),
    totalRecordsInBatch: batch.length,
    promotable: promotable.length,
    excludedNoLocality: excluded.length,
    excludedNames: excluded.map((r) => r.nameRaw),
    insertedThisRun: inserted,
    errors,
    totalEstablishmentsNowInTargetRegions: totalNowInRegions,
  };

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const summaryPath = join(rootDir, "reports", "registry", "batch-002-promotion-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Résumé écrit : ${summaryPath}`);
  console.log(JSON.stringify({ ...summary, excludedNames: `[${excluded.length} noms omis, voir fichier]` }, null, 2));
}

main().catch((error) => {
  console.error("Échec de la promotion Batch 002 :", error);
  process.exit(1);
});
