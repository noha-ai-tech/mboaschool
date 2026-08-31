"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { School } from "lucide-react";
import Link from "next/link";
import { MiniSiteRenderer, type MiniSiteRendererData } from "@/components/school/MiniSiteRenderer";
import type { AdmissionsConfig } from "@/components/school/ParentTab";
import type { ExamResult, OfficialRanking } from "@/components/school/MiniSiteResultsPreview";
import { resolveSectionConfig } from "@/lib/schoolPage/sections";
import { FEE_KEYS, type SchoolPagePricing } from "@/lib/schoolPage/pricing";

// PUBLIC-SITE-01 — the public school page is a school-specific mini-site
// (§2): the Écoles237 SiteHeader/SiteFooter/directory chrome are gone from
// this route.
//
// PUBLIC-SITE-02 §7 — PREVIEW PARITY. All rendering now lives in
// <MiniSiteRenderer> (src/components/school/MiniSiteRenderer.tsx), shared
// verbatim with the CMS draft Preview
// (src/app/dashboard/ecole/etablissement/preview/page.tsx). This page's
// only job is to fetch PUBLISHED/LIVE data and hand it to the renderer —
// never school_page_drafts.

const ESTABLISHMENT_COLUMNS =
  "id, name, description, main_category, city, neighborhood, address, latitude, longitude, phone, whatsapp, email, website, logo_url, cover_image_url, subscription_plan, hero_mode, motto, history, mission, vision, founding_year, student_count, teacher_count, is_verified, owner_id, is_claimed, verification_status, official_id, source_ministry";

export default function SchoolPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<MiniSiteRendererData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const [
        { data: schoolData },
        { data: feesData },
        { data: infraData },
        { data: imagesData },
        { data: docsData },
        { data: sectionsData },
        { data: admissionsData },
        rankingRes,
        resultsRes,
        schedulesRes,
        additionalFeesRes,
      ] = await Promise.all([
        supabase.from("establishments").select(ESTABLISHMENT_COLUMNS).eq("id", id).single(),
        supabase.from("fees").select("*").eq("establishment_id", id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", id).maybeSingle(),
        // CMS-F.6 — filtre status='live' explicite, défense en profondeur
        // avec la RLS publique (migration 0032).
        supabase.from("school_images").select("*").eq("establishment_id", id).eq("status", "live").order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", id).eq("status", "live").eq("is_public", true).order("created_at", { ascending: false }),
        supabase.from("school_page_sections").select("section_key, position, is_visible").eq("establishment_id", id),
        supabase.from("admissions_config").select("is_open, levels, conditions, required_documents, period_start, period_end, additional_info").eq("establishment_id", id).maybeSingle(),
        // PUBLIC-SITE-02 — migration 0035, not yet executed: resolves to
        // an error (relation does not exist), tolerated as "no ranking"
        // rather than crashing the whole page — the ranking/results
        // domains are additive, the rest of the mini-site must keep
        // working exactly as before the migration.
        supabase.from("school_official_ranking").select("year, rank, scope, source, source_url").eq("establishment_id", id).maybeSingle(),
        supabase.from("school_exam_results").select("id, exam, academic_year, candidates_count, admitted_count, success_rate_percent").eq("establishment_id", id).eq("status", "live").order("academic_year", { ascending: false }),
        supabase.from("school_fee_schedules").select("academic_year, level_label, registration_fee, tuition_fee, currency, notes, position, school_fee_installments(label, position, amount, due_date, notes)").eq("establishment_id", id).order("position"),
        supabase.from("school_additional_fees").select("academic_year, category, label, amount, mandatory, frequency, notes, position").eq("establishment_id", id).order("position"),
      ]);

      if (!schoolData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const sectionConfig = resolveSectionConfig(sectionsData ?? []);
      const ranking: OfficialRanking | null = rankingRes.data
        ? { source: rankingRes.data.source, year: rankingRes.data.year, rank: rankingRes.data.rank, scope: rankingRes.data.scope }
        : null;
      const results: ExamResult[] = (resultsRes.data ?? []).map((r: any) => ({
        examLabel: r.exam,
        year: r.academic_year,
        successRatePercent: r.success_rate_percent ?? 0,
        admittedCount: r.admitted_count ?? undefined,
        totalCount: r.candidates_count ?? undefined,
      }));
      const pricing = Object.fromEntries(FEE_KEYS.map((key) => [key, feesData?.[key] ?? null])) as unknown as SchoolPagePricing;
      pricing.currency = feesData?.currency ?? "FCFA";
      pricing.legacy_amounts_qualified = feesData?.is_qualified ?? false;
      pricing.schedules = (schedulesRes.data ?? []).map((schedule: any) => ({
        ...schedule,
        installments: [...(schedule.school_fee_installments ?? [])].sort((a: any, b: any) => a.position - b.position),
        school_fee_installments: undefined,
      }));
      pricing.additional_fees = (additionalFeesRes.data ?? []) as any;

      setData({
        establishment: schoolData as any,
        fees: pricing,
        infra: infraData ?? null,
        images: imagesData ?? [],
        docsList: docsData ?? [],
        sectionConfig,
        admissionsConfig: (admissionsData as AdmissionsConfig) ?? null,
        ranking,
        results,
        preinscriptionHref: `/preinscription?ecole=${id}`,
        mode: "public",
      });
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F4F2]">
        <div className="h-16 bg-white border-b border-border" />
        <div className="h-[440px] bg-accent animate-pulse" />
        <div className="max-w-[1280px] mx-auto px-4 py-10 space-y-4">
          <div className="h-10 w-48 bg-white rounded" />
          <div className="h-40 bg-white border border-border rounded-card" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-[#F4F4F2] flex items-center justify-center">
        <div className="text-center">
          <School size={40} className="mx-auto text-text-secondary/30 mb-4" />
          <p className="text-text-secondary font-semibold">Établissement introuvable.</p>
          <Link href="/" className="text-sm text-primary font-semibold mt-3 block">← Retour à l&apos;annuaire</Link>
        </div>
      </div>
    );
  }

  return <MiniSiteRenderer data={data} />;
}
