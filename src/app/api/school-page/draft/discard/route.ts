// POST /api/school-page/draft/discard — CMS-F.7 DISCARD DRAFT / RESET TO
// LIVE.
//
// "Abandonner les modifications" : remet le brouillon à l'identique de
// LIVE (les 8 domaines GLOBAL DRAFT) et abandonne toute photo en attente
// d'ajout (draft_pending_add). N'écrit JAMAIS dans une table live — voir
// public.discard_school_page_draft() (migration 0031, PRÉPARÉE NON
// EXÉCUTÉE) pour le détail. Aucune image live n'est jamais supprimée ni
// modifiée : annuler une suppression planifiée se fait simplement en
// réinitialisant gallery.remove_ids à [] (déjà garanti par
// buildLiveSnapshot(), jamais une logique séparée ici).
//
// N'accepte que expected_updated_at — jamais establishment_id, jamais un id
// d'image, jamais un storage_path : le navigateur ne fournit aucune de ces
// valeurs (authorizeSchoolMutation() résout l'établissement actif côté
// serveur, exactement comme /api/school-page/publish).
//
// Réutilise buildLiveSnapshot() (src/lib/schoolPage/snapshot.ts) — LA seule
// source de vérité pour la correspondance live -> brouillon, déjà utilisée
// par GET /api/school-page/draft (seeding) et par Preview. Aucune deuxième
// implémentation de ce mapping, ni ici ni dans le RPC (voir 0031, section
// TRADE-OFF ARCHITECTURAL).
//
// Storage : même frontière qu'à la publication (CMS-F.6) — Postgres ne doit
// pas orchestrer Supabase Storage dans la transaction relationnelle. Les
// storage_path des photos draft_pending_add sont lus AVANT l'appel RPC,
// scopés à l'établissement actif, jamais depuis le corps de la requête ;
// leur suppression Storage est un best-effort APRÈS un ok=true confirmé —
// un échec ne fait jamais échouer l'abandon déjà commité en base (orphelin
// Storage temporaire acceptable, jamais une incohérence de données).

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";
import { buildLiveSnapshot } from "@/lib/schoolPage/snapshot";

const BUCKET = "school-images";

const ERROR_STATUS: Record<string, number> = {
  NOT_AUTHORIZED: 403,
  NO_DRAFT: 400,
  NO_CHANGES: 400,
  DRAFT_CONFLICT: 409,
  INVALID_DRAFT: 422,
  DISCARD_FAILED: 500,
};

const GENERIC_DISCARD_FAILED = "L'abandon des modifications a échoué. Aucune modification n'a été appliquée.";

type DiscardRpcResult = {
  ok: boolean;
  error_code: string | null;
  error: string | null;
  discarded_at?: string;
  establishment_id?: string;
};

export async function POST(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { context } = auth;

  const body = await req.json().catch(() => null);
  const expectedUpdatedAt = (body as { expected_updated_at?: unknown } | null)?.expected_updated_at;
  if (
    typeof expectedUpdatedAt !== "string" ||
    expectedUpdatedAt.trim() === "" ||
    Number.isNaN(new Date(expectedUpdatedAt).getTime())
  ) {
    return NextResponse.json(
      { error: "expected_updated_at invalide (chaîne de date requise)", error_code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // Storage — lit les storage_path des photos draft_pending_add de
  // l'établissement actif AVANT l'appel RPC (best-effort de lecture : si
  // cette étape échoue, l'abandon continue quand même, seul le nettoyage
  // post-commit sera simplement sauté).
  let storagePathsToClean: string[] = [];
  try {
    const { data: pendingImages } = await context.supabase
      .from("school_images")
      .select("storage_path")
      .eq("establishment_id", context.establishmentId)
      .eq("status", "draft_pending_add");
    storagePathsToClean = (pendingImages ?? []).map((img) => img.storage_path as string);
  } catch (e) {
    console.error("discard: failed to pre-read storage_path for draft_pending_add (non-blocking):", e);
  }

  let livePayload;
  try {
    livePayload = await buildLiveSnapshot(context.supabase, context.establishmentId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: `Échec de construction du snapshot live : ${message}` }, { status: 500 });
  }

  const { data, error } = await context.supabase.rpc("discard_school_page_draft", {
    p_establishment_id: context.establishmentId,
    p_expected_draft_updated_at: expectedUpdatedAt,
    p_live_payload: livePayload,
  });

  if (error) {
    console.error("discard_school_page_draft transport error:", error);
    return NextResponse.json({ error: GENERIC_DISCARD_FAILED, error_code: "DISCARD_FAILED" }, { status: 500 });
  }

  const result = data as DiscardRpcResult | null;
  if (!result || typeof result.ok !== "boolean") {
    console.error("discard_school_page_draft returned an unexpected shape:", result);
    return NextResponse.json({ error: GENERIC_DISCARD_FAILED, error_code: "DISCARD_FAILED" }, { status: 500 });
  }

  if (!result.ok) {
    const errorCode = result.error_code ?? "DISCARD_FAILED";
    const status = ERROR_STATUS[errorCode] ?? 500;
    return NextResponse.json({ error: result.error ?? GENERIC_DISCARD_FAILED, error_code: errorCode }, { status });
  }

  let cleanupWarning = false;
  if (storagePathsToClean.length > 0) {
    const { error: storageError } = await context.supabase.storage.from(BUCKET).remove(storagePathsToClean);
    if (storageError) {
      cleanupWarning = true;
      console.error(
        `discard: Storage cleanup failed for establishment ${context.establishmentId} (${storagePathsToClean.length} object(s) may remain orphaned):`,
        storageError
      );
    }
  }

  return NextResponse.json({
    ok: true,
    discarded_at: result.discarded_at,
    ...(cleanupWarning ? { cleanup_warning: true } : {}),
  });
}
