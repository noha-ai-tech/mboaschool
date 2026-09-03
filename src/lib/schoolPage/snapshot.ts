import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeroMode } from "@/lib/school/heroMode";
import { CANONICAL_SECTION_KEYS } from "@/lib/schoolPage/sections";
import { FEE_KEYS, type SchoolAdditionalFee, type SchoolFeeSchedule, type SchoolPagePricing } from "@/lib/schoolPage/pricing";
import { INFRASTRUCTURE_KEYS as INFRA_KEYS } from "@/lib/schoolPage/infrastructure";
import type { SchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";

type FeeScheduleRow = Omit<SchoolFeeSchedule, "installments"> & {
  id: string;
  school_fee_installments: SchoolFeeSchedule["installments"] | null;
};

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
  const [establishmentRes, feesRes, infraRes, admissionsRes, sectionsRes, rankingRes, schedulesRes, additionalFeesRes] = await Promise.all([
    supabase
      .from("establishments")
      .select("description, motto, history, mission, vision, phone, email, website, address, city, hero_mode, founding_year, student_count, teacher_count")
      .eq("id", establishmentId)
      .single(),
    supabase.from("fees").select([...FEE_KEYS, "currency", "is_qualified"].join(", ")).eq("establishment_id", establishmentId).maybeSingle(),
    supabase.from("infrastructures").select(INFRA_KEYS.join(", ")).eq("establishment_id", establishmentId).maybeSingle(),
    supabase
      .from("admissions_config")
      .select("levels, conditions, required_documents, period_start, period_end, additional_info")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    supabase.from("school_page_sections").select("section_key, position, is_visible").eq("establishment_id", establishmentId),
    // PUBLIC-SITE-02 — migration 0035, not yet executed: this select will
    // 500 (relation does not exist) until it is. Same discipline as every
    // other domain here — no silent fallback that would hide a genuinely
    // missing migration.
    supabase
      .from("school_official_ranking")
      .select("year, rank, scope, source, source_url")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    supabase
      .from("school_fee_schedules")
      .select("id, academic_year, cycle, level_label, registration_fee, tuition_fee, currency, notes, position, school_fee_installments(label, position, amount, due_date, notes)")
      .eq("establishment_id", establishmentId)
      .order("position"),
    supabase
      .from("school_additional_fees")
      .select("academic_year, category, label, amount, status, frequency, notes, position")
      .eq("establishment_id", establishmentId)
      .order("position"),
  ]);

  if (establishmentRes.error) {
    throw new Error(`Lecture establishments impossible : ${establishmentRes.error.message}`);
  }
  if (feesRes.error) throw new Error(`Lecture fees impossible : ${feesRes.error.message}`);
  if (schedulesRes.error) throw new Error(`Lecture school_fee_schedules impossible : ${schedulesRes.error.message}`);
  if (additionalFeesRes.error) throw new Error(`Lecture school_additional_fees impossible : ${additionalFeesRes.error.message}`);

  const establishment = establishmentRes.data as {
    description: string | null;
    motto: string | null;
    history: string | null;
    mission: string | null;
    vision: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    hero_mode: string | null;
    founding_year: number | null;
    student_count: number | null;
    teacher_count: number | null;
  };
  const ranking = (rankingRes.data ?? null) as {
    year: number;
    rank: string;
    scope: string;
    source: string;
    source_url: string | null;
  } | null;
  const fees = (feesRes.data ?? null) as unknown as (Record<string, number | null> & { currency?: string | null; is_qualified?: boolean }) | null;
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

  const pricing = {} as SchoolPagePricing;
  for (const key of FEE_KEYS) pricing[key] = fees ? fees[key] ?? null : null;
  pricing.currency = fees?.currency ?? "FCFA";
  pricing.legacy_amounts_qualified = fees?.is_qualified ?? false;
  pricing.schedules = ((schedulesRes.data ?? []) as unknown as FeeScheduleRow[]).map((schedule) => ({
    academic_year: schedule.academic_year,
    cycle: schedule.cycle ?? null,
    level_label: schedule.level_label,
    registration_fee: schedule.registration_fee,
    tuition_fee: schedule.tuition_fee,
    currency: schedule.currency,
    notes: schedule.notes,
    position: schedule.position,
    installments: [...(schedule.school_fee_installments ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ label, position, amount, due_date, notes }) => ({ label, position, amount, due_date, notes })),
  }));
  pricing.additional_fees = (additionalFeesRes.data ?? []) as unknown as SchoolAdditionalFee[];

  const infrastructure: Record<string, boolean> = {};
  for (const key of INFRA_KEYS) infrastructure[key] = infra ? Boolean(infra[key]) : false;

  const sections = CANONICAL_SECTION_KEYS.map((key, i) => {
    const row = sectionRowByKey.get(key);
    return { section_key: key, position: row?.position ?? i, is_visible: row?.is_visible ?? true };
  });

  return {
    presentation: {
      description: establishment.description ?? "",
      motto: establishment.motto ?? null,
      history: establishment.history ?? null,
      mission: establishment.mission ?? null,
      vision: establishment.vision ?? null,
    },
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
    key_numbers: {
      founding_year: establishment.founding_year ?? null,
      student_count: establishment.student_count ?? null,
      teacher_count: establishment.teacher_count ?? null,
    },
    ranking: ranking
      ? { year: ranking.year, rank: ranking.rank, scope: ranking.scope, source: ranking.source, source_url: ranking.source_url ?? null }
      : null,
    results: { remove_ids: [] },
  };
}
