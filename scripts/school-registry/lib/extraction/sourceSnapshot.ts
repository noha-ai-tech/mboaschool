import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "./hashing";
import type { SourceType } from "./types";

/**
 * SPRINT R.2-SAFETY §8-9 — Préserve le contenu brut AVANT toute
 * normalisation, avec ses métadonnées de provenance. §81 : minimisation des
 * données — ce module ne stocke que le contenu de la source elle-même
 * (établissements), jamais de donnée personnelle (élèves/parents/enseignants
 * individuels), hors périmètre de ce sprint de toute façon.
 */
export interface SourceSnapshotMetadata {
  source_url: string;
  source_type: SourceType;
  fetched_at: string;
  content_sha256: string;
  parser_version: string;
  operator: string;
}

/**
 * Écrit le contenu brut + son metadata JSON sous data/registry/raw/<batchId>/.
 * Retourne le hash — l'appelant doit le reporter dans ExtractionResult.contentSha256
 * (§10 : un seul calcul de hash, jamais recalculé différemment ailleurs).
 */
export function writeSourceSnapshot({
  rootDir,
  batchId,
  fileName,
  rawContent,
  sourceUrl,
  sourceType,
  parserVersion,
  operator,
}: {
  rootDir: string;
  batchId: string;
  fileName: string;
  rawContent: string;
  sourceUrl: string;
  sourceType: SourceType;
  parserVersion: string;
  operator: string;
}): SourceSnapshotMetadata {
  const dir = join(rootDir, "data", "registry", "raw", batchId);
  mkdirSync(dir, { recursive: true });

  const contentPath = join(dir, fileName);
  writeFileSync(contentPath, rawContent, "utf-8");

  const metadata: SourceSnapshotMetadata = {
    source_url: sourceUrl,
    source_type: sourceType,
    fetched_at: new Date().toISOString(),
    content_sha256: sha256(rawContent),
    parser_version: parserVersion,
    operator,
  };

  const metadataPath = join(dir, `${fileName}.meta.json`);
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

  return metadata;
}
