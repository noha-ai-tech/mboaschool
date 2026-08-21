import { createHash } from "node:crypto";
import type { PresenceConfidence, IdentityConfidence, OfficialVerification, PublicationReadiness } from "./transportTier3TrustModel";

/**
 * SPRINT TRANSPORT-A.2-T3-WRITE §7-8-10-12 — construction PURE (sans I/O
 * réseau) de la ligne `establishment_import_staging` pour un candidat
 * Transport Tier-3, et simulation d'idempotence sans écriture.
 *
 * Toute la logique testable sans mock réseau vit ici, séparée du script qui
 * fait les fetch() (transport-a2-t3-write-preflight.ts /
 * transport-a2-t3-import.ts) et du module d'écriture strictement limité
 * (transportA2StagingWriter.ts).
 */

export interface CandidateSource {
  source_id: string;
  domain: string;
  tier3_class: string;
  verified_this_sprint: boolean;
  note?: string;
}

export interface StagingPayloadInput {
  candidate_id: string;
  name: string;
  normalized_name: string;
  entity_family: string;
  entity_family_note?: string | null;
  city: string | null;
  region: string | null;
  sources: CandidateSource[];
  source_count: number;
  independent_source_count: number;
  source_independence: string;
  tier3_confidence: string;
  tier3_confidence_note?: string | null;
  matching_decision: string; // fresh, live+staging combined
  matching_reason_live: string;
  matching_reason_staging: string;
  cross_ministry_decision: string;
  cross_ministry_note?: string | null;
  activity_status: string;
  official_corroboration_status: string;
  staging_classification: string;
  classification_reason: string;
  taxonomy: { main_category: string | null; sub_category: string | null; education_family: string | null; education_family_uncertain: boolean };
  provenance: { source_url_present: boolean; source_url: string | null; sha256_present: boolean; sha256: string | null; provenance_complete: boolean; provenance_note: string };
  presence_confidence: PresenceConfidence;
  identity_confidence: IdentityConfidence;
  official_verification: OfficialVerification;
  publication_readiness: PublicationReadiness;
  /**
   * Preuve de chevauchement inter-ministériel à conserver EN MÉTADONNÉE
   * SEULEMENT — brief §10, cas Fleet Management Academy. Ne devient JAMAIS
   * un official_identifier ni un establishment_registry_identifiers pour
   * MINTRANSPORT, quelle que soit l'autorité d'origine.
   */
  cross_ministry_evidence: { authority: string; identifier_type: string; identifier_value: string; identifier_authority: string; note: string }[];
  batch_checksum: string;
  approval_checksum: string;
}

export interface StagingInsertRow {
  /**
   * FK obligatoire (establishment_import_staging.data_source_id NOT NULL,
   * migration 0006). Rempli à null par buildStagingInsertPayload() (fonction
   * pure, ne crée aucune ligne DB) — l'appelant côté écriture
   * (transportA2StagingWriter.ts / transport-a2-t3-import.ts) DOIT créer une
   * ligne establishment_data_sources et injecter son id ici avant tout POST.
   */
  data_source_id: string | null;
  fingerprint: string;
  name_raw: string;
  name_normalized: string;
  source_ministry: "MINTRANSPORT";
  source_url: string; // NOT NULL en base — jamais construit si absent, voir §7 candidats "held back"
  source_year: number;
  official_identifier: null; // §8/§13 — TOUJOURS null, jamais dérivé de Tier-3
  education_family: string | null;
  /** Jamais deviné : registry_ownership n'a pas de valeur 'unknown', donc null si non prouvé (jamais 'private' par défaut sans preuve). */
  ownership: null;
  subsystem: "unknown";
  region: string | null;
  city: string | null;
  locality: null;
  status: "ready" | "duplicate_review";
  raw_data: { transport_tier3: Record<string, unknown> };
}

/** Clé d'identité déterministe (brief §12) — candidate_id-based, jamais floue, stable entre exécutions. */
export function fingerprintFor(candidateId: string): string {
  return `transport-tier3:v1:${candidateId}`;
}

/** SHA256 de la clé pour usage interne si un espace de fingerprint hashé est requis ailleurs (non utilisé pour la colonne fingerprint elle-même, qui reste lisible pour l'audit — cf. import-major-cities-to-staging.ts qui hash, ce pipeline garde le préfixe lisible en clair comme transport-a2-t3-import.ts l'annonçait déjà). */
export function fingerprintHashFor(candidateId: string): string {
  return createHash("sha256").update(fingerprintFor(candidateId)).digest("hex");
}

/**
 * Construit la ligne d'insertion EXACTE (brief §8 : contrat de payload
 * complet). N'écrit rien — fonction pure, testable sans réseau/DB.
 *
 * official_identifier est TOUJOURS null (§13) : aucune preuve Tier-3, seule
 * ou multiple, ne peut jamais produire un identifiant officiel MINTRANSPORT.
 * Le cas Fleet Management Academy (identifiant MINEFOP réel N°000471) est
 * conservé UNIQUEMENT dans raw_data.transport_tier3.cross_ministry_evidence
 * — jamais recopié comme official_identifier, jamais associé à
 * source_ministry='MINTRANSPORT' comme preuve d'agrément.
 */
export function buildStagingInsertPayload(input: StagingPayloadInput): StagingInsertRow {
  // §10 hard safety: reject at construction time if a caller ever tries to
  // smuggle a cross-ministry identifier into the MINTRANSPORT-facing fields.
  for (const ev of input.cross_ministry_evidence) {
    if (ev.identifier_authority === "MINTRANSPORT" || ev.identifier_authority === "MINT") {
      throw new Error(
        `SAFETY: cross_ministry_evidence for ${input.candidate_id} claims identifier_authority="${ev.identifier_authority}" — a cross-ministry identifier can never be attributed to MINTRANSPORT/MINT. This is a bug in the caller, not a valid payload.`
      );
    }
  }
  // §7 hard schema constraint: establishment_import_staging.source_url is
  // NOT NULL (migration 0006). Never fabricate one — the caller is
  // responsible for excluding candidates without a locatable source_url
  // BEFORE calling this function (see transport-a2-t3-write-preflight.ts
  // "held_back_missing_source_url"). Fail closed rather than silently
  // insert an empty/placeholder URL.
  if (!input.provenance.source_url) {
    throw new Error(`SAFETY: candidate ${input.candidate_id} has no source_url — cannot build an insertable row (NOT NULL constraint). Caller must exclude this candidate before calling buildStagingInsertPayload().`);
  }

  return {
    data_source_id: null, // filled in by the write path just before POST, after creating the establishment_data_sources row
    fingerprint: fingerprintFor(input.candidate_id),
    name_raw: input.name,
    name_normalized: input.normalized_name,
    source_ministry: "MINTRANSPORT",
    source_url: input.provenance.source_url,
    source_year: 2026,
    official_identifier: null,
    education_family: input.taxonomy.education_family,
    ownership: null,
    subsystem: "unknown",
    region: input.region,
    city: input.city,
    locality: null,
    status: input.staging_classification === "DUPLICATE_REVIEW" ? "duplicate_review" : "ready",
    raw_data: {
      transport_tier3: {
        pipeline_version: "transport-tier3-v1",
        write_pipeline_version: "transport-a2-t3-write-v1",
        candidate_id: input.candidate_id,
        entity_family: input.entity_family,
        entity_family_note: input.entity_family_note ?? null,
        name: input.name,
        normalized_name: input.normalized_name,
        source_ministry: "MINTRANSPORT",
        sources: input.sources,
        source_count: input.source_count,
        independent_source_count: input.independent_source_count,
        source_independence: input.source_independence,
        tier3_confidence: input.tier3_confidence,
        tier3_confidence_note: input.tier3_confidence_note ?? null,
        matching_decision: input.matching_decision,
        matching_reason_live: input.matching_reason_live,
        matching_reason_staging: input.matching_reason_staging,
        cross_ministry_decision: input.cross_ministry_decision,
        cross_ministry_note: input.cross_ministry_note ?? null,
        cross_ministry_evidence: input.cross_ministry_evidence,
        activity_status: input.activity_status,
        official_corroboration_status: input.official_corroboration_status,
        staging_classification: input.staging_classification,
        classification_reason: input.classification_reason,
        taxonomy: input.taxonomy,
        provenance: input.provenance,
        // ---- trust model, three distinct dimensions (brief §5) ----
        presence_confidence: input.presence_confidence,
        identity_confidence: input.identity_confidence,
        official_verification: input.official_verification,
        // ---- informative only (brief §6) ----
        publication_readiness: input.publication_readiness,
        // ---- batch / provenance references (brief §8) ----
        batch_checksum: input.batch_checksum,
        approval_checksum: input.approval_checksum,
        import_provenance: {
          sprint: "TRANSPORT-A.2-T3-WRITE",
          fingerprint: fingerprintFor(input.candidate_id),
        },
      },
    },
  };
}

export interface IdempotencePlan {
  toInsert: StagingInsertRow[];
  skippedAlreadyStaging: { fingerprint: string; candidate_id: string }[];
}

/**
 * Simulation pure d'idempotence (brief §12) : étant donné les lignes
 * candidates et l'ensemble des fingerprints DÉJÀ présents en staging
 * (obtenu par un GET en amont, jamais deviné), retourne ce qui SERAIT
 * inséré. Ne touche à aucune DB. Un second appel avec
 * existingFingerprints = (fingerprints déjà insérés au premier passage)
 * doit toujours produire toInsert.length === 0.
 */
export function planStagingInsert(rows: StagingInsertRow[], existingFingerprints: ReadonlySet<string>): IdempotencePlan {
  const toInsert: StagingInsertRow[] = [];
  const skippedAlreadyStaging: { fingerprint: string; candidate_id: string }[] = [];
  for (const row of rows) {
    if (existingFingerprints.has(row.fingerprint)) {
      const candidateId = (row.raw_data.transport_tier3 as { candidate_id: string }).candidate_id;
      skippedAlreadyStaging.push({ fingerprint: row.fingerprint, candidate_id: candidateId });
    } else {
      toInsert.push(row);
    }
  }
  return { toInsert, skippedAlreadyStaging };
}
