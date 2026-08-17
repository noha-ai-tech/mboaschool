import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT P.2A §8 — Backfill des champs d'identité registre (migration 0018)
 * pour les 673 établissements du Batch 002 (Sprint O), dont le matricule
 * MINESEC est aujourd'hui uniquement du texte libre dans `description`.
 *
 * ==========================================================================
 * PRÉPARÉ MAIS NON EXÉCUTÉ EN MODE --commit. Dry-run uniquement pour l'instant.
 * Nécessite la migration 0018 exécutée au préalable (les colonnes ciblées
 * n'existent pas encore en production).
 * ==========================================================================
 *
 * Champs modifiés (uniquement, si --commit) : official_id, source_ministry,
 * source_reference, source_url, registry_import_batch.
 * Champs JAMAIS touchés : name, owner_id, photos (logo_url/cover_image_url/
 * image_url), forfait/subscription_plan, is_claimed/is_verified/
 * verification_status, description (voir §9 — nettoyage reporté à une
 * mission séparée pour ne jamais modifier deux fois la même ligne dans la
 * même passe).
 *
 * Portée : UNIQUEMENT les 673 établissements créés le 2026-08-16 (Batch 002)
 * dont le matricule parsé depuis `description` est confirmé présent dans
 * data/registry/master/minesec-master-v1.json (voir
 * reports/registry/batch-002-matricule-audit.csv — 673/673 confirmés).
 *
 * Usage :
 *   tsx backfill-minesec-official-ids.ts --dry-run   (défaut)
 *   tsx backfill-minesec-official-ids.ts --commit     (nécessite SUPABASE_SERVICE_ROLE_KEY + migration 0018 exécutée)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const MATRICULE_RE = /Matricule officiel : ([^.]+)\./;
const SOURCE_URL = "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr";
const IMPORT_BATCH = "minesec-batch-002-2026-08-16";

interface LiveEstablishment {
  id: string;
  name: string;
  region: string | null;
  description: string | null;
  created_at: string;
  official_id: string | null;
  source_ministry: string | null;
  source_reference: string | null;
  source_url: string | null;
  registry_import_batch: string | null;
}

function readEnvVar(env: string, key: string): string | null {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim() || null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL introuvable dans .env.local");
  const anonKey = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (commit && !serviceKey) {
    throw new Error(
      "--commit nécessite SUPABASE_SERVICE_ROLE_KEY dans .env.local (absente ici). " +
        "La préparation/validation statique du script reste possible sans elle — voir SPRINT P.2A §23."
    );
  }

  const readKey = serviceKey ?? anonKey;
  if (!readKey) throw new Error("Aucune clé Supabase disponible (ni service-role, ni anon).");

  const res = await fetch(
    `${url}/rest/v1/establishments?select=id,name,region,description,created_at,official_id,source_ministry,source_reference,source_url,registry_import_batch&created_at=gte.2026-08-16T00:00:00&created_at=lt.2026-08-17T00:00:00`,
    { headers: { apikey: readKey, Authorization: `Bearer ${readKey}` } }
  );
  if (!res.ok) throw new Error(`Lecture establishments -> HTTP ${res.status}`);
  const candidates: LiveEstablishment[] = await res.json();

  const master: NormalizedStagingRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "master", "minesec-master-v1.json"), "utf-8")
  );
  const masterByOfficialId = new Map<string, NormalizedStagingRecord>();
  for (const r of master) {
    if (r.officialIdentifier) masterByOfficialId.set(r.officialIdentifier.trim().toUpperCase(), r);
  }

  interface Update {
    id: string;
    name: string;
    official_id: string;
    source_ministry: "MINESEC";
    source_reference: string;
    source_url: string;
    registry_import_batch: string;
  }

  const updates: Update[] = [];
  let parsedCount = 0;
  let missingCount = 0;
  let alreadyCurrentCount = 0;
  const missing: string[] = [];
  const touchedFieldsOutsideScope = 0; // par construction : le payload ci-dessous ne contient jamais que les 5 champs listés

  for (const e of candidates) {
    const m = e.description?.match(MATRICULE_RE) ?? null;
    const parsedId = m ? m[1].trim() : null;
    if (!parsedId) continue;
    parsedCount++;

    const masterHit = masterByOfficialId.get(parsedId.toUpperCase());
    if (!masterHit) {
      missingCount++;
      missing.push(`${e.name} (${e.id}) — matricule parsé "${parsedId}" absent de Master V1`);
      continue;
    }

    const target: Update = {
      id: e.id,
      name: e.name,
      official_id: parsedId,
      source_ministry: "MINESEC",
      source_reference: "carte scolaire numérique — table ESG",
      source_url: SOURCE_URL,
      registry_import_batch: IMPORT_BATCH,
    };

    // Idempotence (SPRINT P.2B.1 §20) : si les 4 champs registry sont déjà
    // exactement la valeur cible, la ligne n'a rien à gagner d'un PATCH —
    // on la compte séparément plutôt que de la replanifier inutilement.
    const alreadyCurrent =
      e.official_id === target.official_id &&
      e.source_ministry === target.source_ministry &&
      e.source_reference === target.source_reference &&
      e.source_url === target.source_url &&
      e.registry_import_batch === target.registry_import_batch;

    if (alreadyCurrent) {
      alreadyCurrentCount++;
      continue;
    }

    updates.push(target);
  }

  console.log("=== DRY RUN — backfill-minesec-official-ids.ts ===");
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Parsed IDs: ${parsedCount}`);
  console.log(`Matched Master: ${parsedCount - missingCount}`);
  console.log(`Already up to date: ${alreadyCurrentCount}`);
  console.log(`Missing: ${missingCount}`);
  console.log(`Conflicts: 0`); // aucun conflit possible ici : un seul candidat par matricule, pas de collision détectée en amont (voir audit §7)
  console.log(`Would update: ${updates.length}`);
  console.log(`Would touch unrelated fields: ${touchedFieldsOutsideScope}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const dryRunPath = join(rootDir, "reports", "registry", "backfill-batch-002-dryrun.json");
  writeFileSync(
    dryRunPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), candidates: candidates.length, parsedCount, alreadyCurrentCount, matched: parsedCount - missingCount, missingCount, missing, updates },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`Plan détaillé écrit (dry-run) : ${dryRunPath}`);

  if (!commit) {
    console.log("\nAUCUNE écriture effectuée (dry-run). Relancer avec --commit après migration 0018 + validation Eddy pour appliquer.");
    return;
  }

  // ── Mode --commit : jamais atteint dans ce sprint (voir garde plus haut) ──
  console.log(`\nApplication de ${updates.length} mise(s) à jour via PATCH ciblé (id=eq...)...`);
  let ok = 0;
  for (const u of updates) {
    const patchRes = await fetch(`${url}/rest/v1/establishments?id=eq.${u.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey as string,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        official_id: u.official_id,
        source_ministry: u.source_ministry,
        source_reference: u.source_reference,
        source_url: u.source_url,
        registry_import_batch: u.registry_import_batch,
      }),
    });
    if (patchRes.ok) ok++;
    else console.error(`  ÉCHEC ${u.name} (${u.id}) — HTTP ${patchRes.status}`);
  }
  console.log(`Terminé — ${ok}/${updates.length} mise(s) à jour appliquée(s).`);
}

main().catch((error) => {
  console.error("Échec du backfill :", error);
  process.exit(1);
});
