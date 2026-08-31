import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeroMode } from "@/lib/school/heroMode";
import { CANONICAL_SECTION_KEYS } from "@/lib/schoolPage/sections";
import { FEE_KEYS } from "@/lib/schoolPage/pricing";
import { INFRASTRUCTURE_KEYS as INFRA_KEYS } from "@/lib/schoolPage/infrastructure";
import type { SchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";

// CMS-F.2 — extrait tel quel (comportement inchangé) depuis
// /api/school-page/draft — c'était la seule implémentation avant CMS-F.4.
// Server-only (utilise un SupabaseClient authentifié côté serveur) —
// jamais importé par un composant client.
//
// Snapshot live → payload brouillon. Reflète exactement ce qui est
// actuellement public, avec les mêmes replis que le rendu public / les
// routes PATCH live respectives quand aucune ligne n'existe encore
// (fees/infrastructures/admissions_config/school_page_sections sont
// toutes "une ligne par établissement, créée à la première sauvegarde" —
// absence de ligne = valeurs par défaut, jamais une erreur).
//
// CMS-F.4 — réutilisé tel quel par /api/school-page/preview pour le cas
// "aucun brouillon encore créé" (mission §5 : ne jamais dupliquer une
// deuxième implémentation de snapshot). Purement en lecture ici : ni cette
// fonction ni ses appelants n'insèrent de ligne dans school_page_drafts —
// seule /api/school-page/draft (GET) sème réellement un brouillon.
export async function buildLiveSnapshot(
  supabase: SupabaseClient,
  establishmentId: string
): Promise<SchoolPageDraftPayload> {
  const [establishmentRes, feesRes, infraRes, admissionsRes, sectionsRes] = await Promise.all([
    supabase
      .from("establishments")
      .select("description, phone, email, website, address, city, hero_mode")
      .eq("id", establishmentId)
      .single(),
    supabase.from("fees").select(FEE_KEYS.join(", ")).eq("establishment_id", establishmentId).maybeSingle(),
    supabase.from("infrastructures").select(INFRA_KEYS.join(", ")).eq("establishment_id", establishmentId).maybeSingle(),
    supabase
      .from("admissions_config")
      .select("levels, conditions, required_documents, period_start, period_end, additional_info")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    supabase.from("school_page_sections").select("section_key, position, is_visible").eq("establishment_id", establishmentId),
  ]);

  if (establishmentRes.error) {
    throw new Error(`Lecture establishments impossible : ${establishmentRes.error.message}`);
  }

  const establishment = establishmentRes.data as {
    description: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    hero_mode: string | null;
  };
  const fees = (feesRes.data ?? null) as unknown as Record<string, number | null> | null;
  const infra = (infraRes.data ?? null) as unknown as Record<string, boolean> | null;
  const admissions = (admissionsRes.data ?? null) as {
    levels: string[] | null;
    conditions: string | null;
    required_documents: string[] | null;
    period_start: string | null;
    period_end: string | null;
    additional_info: string | null;
  } | null;
  const sectionRows = (sectionsRes.data ?? []) as { section_key: string; position: number; is_visible: boolean }[];
  const sectionRowByKey = new Map(sectionRows.map((r) => [r.section_key, r]));

  const pricing: Record<string, number | null> = {};
  for (const key of FEE_KEYS) pricing[key] = fees ? fees[key] ?? null : null;

  const infrastructure: Record<string, boolean> = {};
  for (const key of INFRA_KEYS) infrastructure[key] = infra ? Boolean(infra[key]) : false;

  const sections = CANONICAL_SECTION_KEYS.map((key, i) => {
    const row = sectionRowByKey.get(key);
    return { section_key: key, position: row?.position ?? i, is_visible: row?.is_visible ?? true };
  });

  return {
    presentation: { description: establishment.description ?? "" },
    contact: {
      phone: establishment.phone ?? null,
      email: establishment.email ?? null,
      website: establishment.website ?? null,
      address: establishment.address ?? null,
      city: establishment.city ?? null,
    },
    hero_mode: (establishment.hero_mode as HeroMode | null) ?? "carousel",
    pricing,
    infrastructure,
    admissions: {
      levels: admissions?.levels ?? [],
      conditions: admissions?.conditions ?? null,
      required_documents: admissions?.required_documents ?? [],
      period_start: admissions?.period_start ?? null,
      period_end: admissions?.period_end ?? null,
      additional_info: admissions?.additional_info ?? null,
    },
    sections,
    gallery: { remove_ids: [] },
  };
}
