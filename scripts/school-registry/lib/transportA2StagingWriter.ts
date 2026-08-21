import type { StagingInsertRow } from "./transportA2StagingPayload";

/**
 * SPRINT TRANSPORT-A.2-T3-WRITE §9 — ABSOLUTE WRITE RESTRICTIONS.
 *
 * Ce module est le SEUL endroit de tout le pipeline Transport Tier-3 qui a
 * la capacité technique d'écrire dans Supabase. Il n'exporte QUE DEUX
 * fonctions d'écriture, toutes deux à cible fixe codée en dur :
 *  - createTransportDataSourceRow() -> establishment_data_sources UNIQUEMENT
 *    (prérequis FK obligatoire de la table de staging, migration 0006 —
 *    `establishment_import_staging.data_source_id` est NOT NULL).
 *  - insertStagingRowsOnly() -> establishment_import_staging UNIQUEMENT.
 *
 * Ni l'une ni l'autre ne peut JAMAIS cibler `establishments` ni
 * `establishment_registry_identifiers`.
 *
 * Garantie structurelle (pas seulement une intention documentée) :
 *  - ce fichier ne contient nulle part la route REST brute des
 *    établissements, ni celle des identifiants de registre — recherchez,
 *    elles n'existent pas (voir le test de ce module pour la vérification
 *    automatisée exacte des chaînes interdites).
 *  - `scripts/school-registry/lib/__tests__/transportA2StagingWriter.test.ts`
 *    fait une analyse statique du texte source de CE fichier (pas juste un
 *    test de comportement) et échoue si l'une de ces deux chaînes apparaît
 *    un jour ici, ou si un troisième export de fonction est ajouté.
 *  - il n'y a pas de paramètre "table" générique passé à un client REST
 *    générique : chaque URL est codée en dur dans le corps de sa fonction.
 *
 * Un futur script de PROMOTION (staging -> establishments) devra être un
 * module ENTIÈREMENT SÉPARÉ, avec son propre garde-fou distinct (voir note
 * dans transportA2ImportGuard.ts) — jamais ajouté ici.
 */

export interface DataSourceRowResult {
  id: string;
}

/**
 * Crée EXACTEMENT une ligne `establishment_data_sources` par exécution
 * --commit (même convention que import-major-cities-to-staging.ts). Cible
 * fixe, aucun paramètre de table.
 */
export async function createTransportDataSourceRow(supabaseUrl: string, serviceKey: string, recordsFetched: number, batchChecksum: string): Promise<DataSourceRowResult> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const res = await fetch(`${supabaseUrl}/rest/v1/establishment_data_sources`, {
    method: "POST",
    headers,
    body: JSON.stringify([
      {
        ministry: "OTHER", // registry_source_ministry (migration 0006) has no MINTRANSPORT value; establishment_data_sources.ministry is a distinct, older enum from the staging row's own source_ministry column — never blocks the MINTRANSPORT staging write itself.
        source_name: "transport-tier3-v1 — TRANSPORT-A.2-T3-WRITE controlled Tier-3 staging import",
        source_url: "see raw_data.transport_tier3.provenance.source_url per row (multiple distinct Tier-3 sources, no single batch URL)",
        source_year: 2026,
        records_fetched: recordsFetched,
        notes: `SPRINT TRANSPORT-A.2-T3-WRITE. Tier-3 sources only — discovery/presence signal, never sufficient alone for promotion or official verification. batch_checksum=${batchChecksum}. See docs/03_DATA_REGISTRY/TRANSPORT_IMPORT_CONTRACT.md.`,
      },
    ]),
  });
  if (!res.ok) throw new Error(`POST establishment_data_sources -> HTTP ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as { id: string }[];
  return { id: row.id };
}

export interface StagingWriteResult {
  inserted: number;
  insertedFingerprints: string[];
}

/**
 * L'UNIQUE fonction d'écriture VERS LA TABLE DE STAGING de ce module.
 * Insère EXCLUSIVEMENT dans `establishment_import_staging`, par lots, et
 * seulement les lignes fournies (l'appelant est responsable d'avoir déjà
 * retiré, via planStagingInsert(), toute ligne dont le fingerprint existe
 * déjà — ce module ne revérifie pas l'idempotence lui-même, il ne fait
 * qu'écrire exactement ce qu'on lui donne, avec le data_source_id fourni).
 */
export async function insertStagingRowsOnly(supabaseUrl: string, serviceKey: string, dataSourceId: string, rows: StagingInsertRow[]): Promise<StagingWriteResult> {
  if (rows.length === 0) return { inserted: 0, insertedFingerprints: [] };

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const CHUNK = 200;
  let inserted = 0;
  const insertedFingerprints: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, data_source_id: dataSourceId }));
    // eslint-disable-next-line no-restricted-syntax -- intentional: the ONLY POST target this function is allowed to hit.
    const res = await fetch(`${supabaseUrl}/rest/v1/establishment_import_staging`, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`POST establishment_import_staging -> HTTP ${res.status}: ${await res.text()}`);
    }
    inserted += chunk.length;
    insertedFingerprints.push(...chunk.map((r) => r.fingerprint));
  }
  return { inserted, insertedFingerprints };
}
