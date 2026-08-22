/**
 * SPRINT REGISTRY-NATIONAL-A §20 — dry-run de slugs, fonctions pures.
 * Aucune écriture. slugify() reprise à l'identique de la convention déjà
 * utilisée par minesup-d-promote.ts / minsante-h-promote.ts.
 */

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SlugCheckResult {
  candidateId: string;
  proposedSlug: string;
  existingCollision: boolean;
  batchCollisionWith: string[]; // autres national_candidate_id du même lot avec le même slug proposé
  valid: boolean;
}

export function slugDryRun(candidates: { candidateId: string; name: string }[], existingLiveSlugs: Set<string>): SlugCheckResult[] {
  const bySlug = new Map<string, string[]>();
  for (const c of candidates) {
    const slug = slugify(c.name);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(c.candidateId);
  }

  return candidates.map((c) => {
    const proposedSlug = slugify(c.name);
    const existingCollision = existingLiveSlugs.has(proposedSlug);
    const batchSiblings = (bySlug.get(proposedSlug) ?? []).filter((id) => id !== c.candidateId);
    return {
      candidateId: c.candidateId,
      proposedSlug,
      existingCollision,
      batchCollisionWith: batchSiblings,
      valid: !existingCollision && batchSiblings.length === 0,
    };
  });
}
