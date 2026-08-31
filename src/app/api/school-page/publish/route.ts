// POST /api/school-page/publish — CMS-F.5C PUBLISH API, CMS-F.6 GALLERY
// DRAFT LIFECYCLE (Storage cleanup extension).
//
// Fine couche applicative au-dessus de public.publish_school_page(uuid,
// timestamptz). N'implémente AUCUNE logique métier propre pour les
// domaines GLOBAL DRAFT scalaires : résout l'établissement actif
// exactement comme toute autre route CMS (authorizeSchoolMutation(),
// jamais un id lu depuis le corps de la requête), valide
// expected_updated_at, appelle le RPC, puis retranscrit son résultat
// structuré {ok, error_code, error} en une réponse HTTP.
//
// Le navigateur ne peut JAMAIS fournir establishment_id, le payload du
// brouillon, ni aucune valeur live — seul expected_updated_at est accepté,
// exactement le jeton de concurrence optimiste déjà utilisé par
// /api/school-page/draft, jamais généré côté serveur ni substitué
// silencieusement par une valeur plus récente.
//
// CMS-F.6 — responsabilité supplémentaire propre à cette route (jamais au
// RPC : Postgres ne doit pas orchestrer Supabase Storage dans la même
// transaction relationnelle) : le RPC supprime les lignes school_images
// live retenues dans gallery.remove_ids, mais jamais leur objet Storage.
// Cette route lit donc, AVANT d'appeler le RPC, les storage_path des
// images concernées — depuis la base, scopées à l'établissement actif,
// JAMAIS depuis un champ envoyé par le navigateur — puis, UNIQUEMENT après
// un ok=true confirmé, tente de les supprimer de Storage en best-effort.
// Un échec de ce nettoyage ne fait jamais échouer la publication déjà
// commitée : c'est un orphelin Storage temporaire acceptable, jamais une
// incohérence de données (voir le rapport CMS-F.6, section STORAGE
// CLEANUP).

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";
import { normalizeSchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";

const BUCKET = "school-images";

// Correspondance code métier -> statut HTTP.
const ERROR_STATUS: Record<string, number> = {
  NOT_AUTHORIZED: 403,
  NO_DRAFT: 400,
  NO_CHANGES: 400,
  DRAFT_CONFLICT: 409,
  INVALID_DRAFT: 422,
  GALLERY_INVALID: 422,
  PUBLISH_FAILED: 500,
};

const GENERIC_PUBLISH_FAILED = "La publication a échoué. Aucune modification n'a été appliquée.";

type PublishRpcResult = {
  ok: boolean;
  error_code: string | null;
  error: string | null;
  published_at?: string;
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

  // CMS-F.6 — résout les storage_path des images sur le point d'être
  // supprimées AVANT d'appeler le RPC, uniquement depuis la base (jamais
  // depuis le corps de la requête). Best-effort de lecture : si cette
  // étape échoue, la publication continue quand même (elle ne dépend pas
  // du nettoyage Storage) — seul le nettoyage post-commit sera simplement
  // sauté, jamais bloquant.
  let storagePathsToClean: string[] = [];
  try {
    const { data: draftRow } = await context.supabase
      .from("school_page_drafts")
      .select("payload")
      .eq("establishment_id", context.establishmentId)
      .maybeSingle();
    const normalized = draftRow ? normalizeSchoolPageDraftPayload(draftRow.payload) : null;
    if (normalized && "error" in normalized) {
      return NextResponse.json(
        { error: `Brouillon persisté invalide : ${normalized.error}`, error_code: "INVALID_DRAFT" },
        { status: 422 }
      );
    }
    const removeIds = normalized?.ok ? normalized.payload.gallery.remove_ids : [];
    if (removeIds.length > 0) {
      const { data: images } = await context.supabase
        .from("school_images")
        .select("storage_path")
        .in("id", removeIds as string[])
        .eq("establishment_id", context.establishmentId)
        .eq("status", "live");
      storagePathsToClean = (images ?? []).map((img) => img.storage_path as string);
    }
  } catch (e) {
    console.error("publish: failed to pre-read storage_path for remove_ids (non-blocking):", e);
  }

  const { data, error } = await context.supabase.rpc("publish_school_page", {
    p_establishment_id: context.establishmentId,
    p_expected_draft_updated_at: expectedUpdatedAt,
  });

  if (error) {
    // Échec de transport (réseau, RPC inaccessible, etc.) — jamais l'erreur
    // Supabase brute au client, seulement en log serveur.
    console.error("publish_school_page transport error:", error);
    return NextResponse.json({ error: GENERIC_PUBLISH_FAILED, error_code: "PUBLISH_FAILED" }, { status: 500 });
  }

  const result = data as PublishRpcResult | null;
  if (!result || typeof result.ok !== "boolean") {
    console.error("publish_school_page returned an unexpected shape:", result);
    return NextResponse.json({ error: GENERIC_PUBLISH_FAILED, error_code: "PUBLISH_FAILED" }, { status: 500 });
  }

  if (!result.ok) {
    const errorCode = result.error_code ?? "PUBLISH_FAILED";
    const status = ERROR_STATUS[errorCode] ?? 500;
    return NextResponse.json({ error: result.error ?? GENERIC_PUBLISH_FAILED, error_code: errorCode }, { status });
  }

  // CMS-F.6 — la publication a réussi et a commité en base (les lignes
  // school_images correspondantes sont déjà supprimées côté DB par le
  // RPC). Nettoyage Storage best-effort UNIQUEMENT maintenant, jamais
  // avant : un échec ici ne doit jamais annuler ni masquer le succès déjà
  // acquis de la publication.
  let cleanupWarning = false;
  if (storagePathsToClean.length > 0) {
    const { error: storageError } = await context.supabase.storage.from(BUCKET).remove(storagePathsToClean);
    if (storageError) {
      cleanupWarning = true;
      console.error(
        `publish: Storage cleanup failed for establishment ${context.establishmentId} (${storagePathsToClean.length} object(s) may remain orphaned):`,
        storageError
      );
    }
  }

  return NextResponse.json({
    ok: true,
    published_at: result.published_at,
    ...(cleanupWarning ? { cleanup_warning: true } : {}),
  });
}
