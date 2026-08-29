// GET /api/school-page/preview — CMS-F.4 AUTHENTICATED DRAFT PREVIEW,
// CMS-F.6 GALLERY DRAFT LIFECYCLE.
//
// Lecture seule. Résout l'établissement ACTIF exactement comme toute autre
// route CMS (authorizeSchoolMutation() → getActiveEstablishment(), jamais
// un id lu depuis l'URL/la query — aucun paramètre n'est accepté par cette
// route). Combine :
//   - domaines GLOBAL DRAFT : lus depuis school_page_drafts.payload s'il
//     existe, sinon un snapshot live construit à la volée (buildLiveSnapshot,
//     CMS-F.2/F.4 — jamais une deuxième implémentation de snapshot, et
//     jamais d'insertion : cette route ne crée aucune ligne, contrairement
//     à GET /api/school-page/draft) ;
//   - domaines IMMEDIATE LIVE (admissions_config.is_open, News, Documents) :
//     toujours lus depuis les tables live, jamais depuis le brouillon.
// N'écrit jamais dans aucune table.
//
// CMS-F.6 — Galerie effective (remplace l'ignorance délibérée de F.4) :
//   images live MOINS gallery.remove_ids PLUS images draft_pending_add,
// exactement la formule spécifiée (mission §9). Cette liste alimente aussi
// le Hero de l'Aperçu (SchoolPageSections dérive heroSlides de `images`
// directement) — aucun changement séparé nécessaire pour le Hero.

import { NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";
import { buildLiveSnapshot } from "@/lib/schoolPage/snapshot";
import type { SchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";

export async function GET() {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { context } = auth;

  const [establishmentRes, imagesRes, docsRes, admissionsRes, draftRes, resultsRes] = await Promise.all([
    context.supabase
      .from("establishments")
      .select("id, name, main_category, city, neighborhood, is_verified, owner_id, is_claimed, verification_status, official_id, source_ministry, subscription_plan, cover_image_url, latitude, longitude, logo_url, phone, whatsapp, address, motto, founding_year, student_count, teacher_count")
      .eq("id", context.establishmentId)
      .single(),
    // CMS-F.6 — les DEUX statuts sont intentionnellement récupérés ici
    // (jamais un helper de requête "public" qui filtrerait déjà sur
    // status='live') : la formule de Galerie effective ci-dessous a besoin
    // de connaître à la fois les images live et draft_pending_add.
    context.supabase
      .from("school_images")
      .select("id, url, caption, status")
      .eq("establishment_id", context.establishmentId)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("school_documents")
      .select("*")
      .eq("establishment_id", context.establishmentId)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("admissions_config")
      .select("is_open")
      .eq("establishment_id", context.establishmentId)
      .maybeSingle(),
    context.supabase
      .from("school_page_drafts")
      .select("payload")
      .eq("establishment_id", context.establishmentId)
      .maybeSingle(),
    // PUBLIC-SITE-02 — même discipline que school_images : les deux
    // statuts sont récupérés ici, la formule "effective" ci-dessous décide.
    // 500 (relation does not exist) tant que la migration 0035 n'est pas
    // exécutée — comportement attendu, jamais masqué.
    context.supabase
      .from("school_exam_results")
      .select("id, exam, academic_year, candidates_count, admitted_count, success_rate_percent, status")
      .eq("establishment_id", context.establishmentId)
      .order("academic_year", { ascending: false }),
  ]);

  if (establishmentRes.error) {
    return NextResponse.json({ error: `Échec de lecture de l'établissement : ${establishmentRes.error.message}` }, { status: 500 });
  }

  let payload: SchoolPageDraftPayload;
  if (draftRes.data) {
    payload = draftRes.data.payload as SchoolPageDraftPayload;
  } else {
    try {
      payload = await buildLiveSnapshot(context.supabase, context.establishmentId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      return NextResponse.json({ error: `Échec de construction du snapshot live : ${message}` }, { status: 500 });
    }
  }

  // CMS-F.6 §9 — Galerie effective : live MOINS remove_ids PLUS
  // draft_pending_add. Toute ligne d'un statut inconnu (ne devrait jamais
  // arriver, contrainte CHECK en base) est exclue par défaut plutôt que
  // risquée publiquement.
  const removeIds = new Set(payload.gallery?.remove_ids ?? []);
  const effectiveImages = (imagesRes.data ?? [])
    .filter((img) => (img.status === "live" ? !removeIds.has(img.id) : img.status === "draft_pending_add"))
    .map(({ id, url, caption }) => ({ id, url, caption }));

  // PUBLIC-SITE-02 — Résultats effectifs, EXACT même formule que la
  // Galerie : live MOINS results.remove_ids PLUS draft_pending_add.
  const resultRemoveIds = new Set(payload.results?.remove_ids ?? []);
  const effectiveResults = (resultsRes.data ?? [])
    .filter((r) => (r.status === "live" ? !resultRemoveIds.has(r.id) : r.status === "draft_pending_add"))
    .map(({ id, exam, academic_year, candidates_count, admitted_count, success_rate_percent }) => ({
      id, exam, academic_year, candidates_count, admitted_count, success_rate_percent,
    }));

  return NextResponse.json({
    ok: true,
    establishment: establishmentRes.data,
    images: effectiveImages,
    documents: docsRes.data ?? [],
    admissionsIsOpen: admissionsRes.data?.is_open ?? true,
    results: effectiveResults,
    draft: payload,
  });
}
