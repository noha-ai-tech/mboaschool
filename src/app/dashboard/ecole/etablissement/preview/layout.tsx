"use client";

// CMS-F.4 — Aperçu privé et authentifié du brouillon (school_page_drafts).
//
// GUYSKULL-05 §11 — PREVIEW PARITY, CRITICAL. Same 5-view architecture as
// the public route tree (src/app/ecole/[id]/layout.tsx), same shared
// MiniSiteShell + view components — only the SOURCE of the data changes:
// draft domains (presentation/contact/hero_mode/pricing/infrastructure/
// admissions-config/sections/key_numbers/ranking) come from
// school_page_drafts.payload; News/Documents/admissions.is_open stay
// IMMEDIATE LIVE (never part of the draft, by design — CMS-F.0/F.1); the
// Gallery/Results lists are the EFFECTIVE lists already computed
// server-side by /api/school-page/preview (live minus remove_ids plus
// draft_pending_add).
//
// The establishment previewed is always the one resolved server-side by
// /api/school-page/preview (authorizeSchoolMutation() → getActiveEstablishment())
// — this layout sends and reads no establishment id from the URL, so
// baseHref is a fixed route, not `/preview/<id>`.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSchool } from "@/lib/useSchool";
import { MiniSiteShell } from "@/components/school/MiniSiteShell";
import { MiniSiteDataProvider } from "@/lib/schoolPage/miniSiteContext";
import { resolveMiniSiteView } from "@/lib/schoolPage/miniSiteViews";
import type { AdmissionsConfig } from "@/components/school/ParentTab";
import type { ExamResult, OfficialRanking } from "@/components/school/MiniSiteResultsPreview";
import { resolveSectionConfig } from "@/lib/schoolPage/sections";
import type { SchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { getSchoolVisualPack } from "@/lib/schoolPage/visualPacks";

const PREVIEW_BASE_HREF = "/dashboard/ecole/etablissement/preview";

type PreviewApiData = {
  establishment: {
    id: string;
    name: string;
    main_category: string | null;
    city: string | null;
    neighborhood: string | null;
    is_verified: boolean;
    owner_id: string | null;
    is_claimed: boolean;
    verification_status: string | null;
    official_id: string | null;
    source_ministry: string | null;
    subscription_plan: string | null;
    cover_image_url: string | null;
    latitude: number | null;
    longitude: number | null;
    logo_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    motto: string | null;
    founding_year: number | null;
    student_count: number | null;
    teacher_count: number | null;
  };
  images: { id: string; url: string; caption: string | null }[];
  documents: any[];
  admissionsIsOpen: boolean;
  results: { id: string; exam: string; academic_year: number; candidates_count: number | null; admitted_count: number | null; success_rate_percent: number | null }[];
  draft: SchoolPageDraftPayload;
};

export default function PreviewDraftLayout({ children }: { children: React.ReactNode }) {
  const { school: activeSchool, user, loading: schoolLoading } = useSchool();
  const pathname = usePathname();
  const [data, setData] = useState<MiniSiteRendererData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localVisualPackName, setLocalVisualPackName] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    async function load() {
      const requestId = ++loadRequestIdRef.current;

      if (schoolLoading) return;
      if (!user || !activeSchool) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setData(null);
      setLocalVisualPackName(null);

      try {
        const res = await fetch("/api/school-page/preview");
        const json = await res.json().catch(() => ({}));
        if (loadRequestIdRef.current !== requestId) return; // école déjà changée depuis
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);

        const api = json as PreviewApiData;
        const { establishment, images, documents, admissionsIsOpen, results, draft } = api;
        const requestedVisualPack = new URL(window.location.href).searchParams.get("visualPack");
        const localVisualPack = requestedVisualPack
          ? getSchoolVisualPack(establishment.id, requestedVisualPack)
          : null;
        const previewImages = localVisualPack
          ? localVisualPack.assets.map((asset) => ({
              id: `local-${asset.id}`,
              url: asset.src,
              caption: asset.caption,
            }))
          : images;
        setLocalVisualPackName(localVisualPack?.name ?? null);

        // CMS-F.4 §11 — is_open vient LIVE, tout le reste du modèle
        // Admissions vient du brouillon.
        const admissionsConfig: AdmissionsConfig = {
          is_open: admissionsIsOpen,
          levels: draft.admissions.levels,
          conditions: draft.admissions.conditions,
          required_documents: draft.admissions.required_documents,
          period_start: draft.admissions.period_start,
          period_end: draft.admissions.period_end,
          additional_info: draft.admissions.additional_info,
        };

        const sectionConfig = resolveSectionConfig(draft.sections);

        const ranking: OfficialRanking | null = draft.ranking
          ? { source: draft.ranking.source, year: draft.ranking.year, rank: draft.ranking.rank, scope: draft.ranking.scope }
          : null;
        const examResults: ExamResult[] = results.map((r) => ({
          examLabel: r.exam,
          year: r.academic_year,
          successRatePercent: r.success_rate_percent ?? 0,
          admittedCount: r.admitted_count ?? undefined,
          totalCount: r.candidates_count ?? undefined,
        }));

        setData({
          establishment: {
            id: establishment.id,
            name: establishment.name,
            description: draft.presentation.description,
            main_category: establishment.main_category,
            city: draft.contact.city,
            neighborhood: establishment.neighborhood,
            address: draft.contact.address,
            latitude: establishment.latitude,
            longitude: establishment.longitude,
            phone: draft.contact.phone,
            whatsapp: establishment.whatsapp,
            email: draft.contact.email,
            website: draft.contact.website,
            logo_url: establishment.logo_url,
            cover_image_url: establishment.cover_image_url,
            subscription_plan: establishment.subscription_plan,
            hero_mode: draft.hero_mode,
            motto: draft.presentation.motto,
            history: draft.presentation.history,
            mission: draft.presentation.mission,
            vision: draft.presentation.vision,
            founding_year: draft.key_numbers.founding_year,
            student_count: draft.key_numbers.student_count,
            teacher_count: draft.key_numbers.teacher_count,
            is_verified: establishment.is_verified,
            owner_id: establishment.owner_id,
            is_claimed: establishment.is_claimed,
            verification_status: establishment.verification_status,
            official_id: establishment.official_id,
            source_ministry: establishment.source_ministry,
          },
          fees: draft.pricing,
          infra: draft.infrastructure,
          images: previewImages,
          docsList: documents,
          sectionConfig,
          admissionsConfig,
          ranking,
          results: examResults,
          preinscriptionHref: "#",
          mode: "preview",
        });
      } catch (e) {
        if (loadRequestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "Échec du chargement de l'aperçu");
      } finally {
        if (loadRequestIdRef.current === requestId) setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchool, user, schoolLoading]);

  if (schoolLoading || loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-xl w-1/3" />
        <div className="h-64 bg-white border border-border rounded-card" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Connexion requise</p>
        <p className="text-sm text-text-secondary mb-4">Connectez-vous pour prévisualiser la page de votre établissement.</p>
        <Link href="/auth/connexion" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Se connecter
        </Link>
      </div>
    );
  }

  if (!activeSchool) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Aucun établissement lié à votre compte</p>
        <Link href="/dashboard/ecole/onboarding" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Lier mon établissement
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2 text-danger">Aperçu indisponible</p>
        <p className="text-sm text-text-secondary mb-4">{error ?? "Erreur inconnue"}</p>
        <Link href="/dashboard/ecole/etablissement" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          ← Retour à l&apos;éditeur
        </Link>
      </div>
    );
  }

  const activeView = resolveMiniSiteView(pathname, PREVIEW_BASE_HREF);

  return (
    <div className="-m-6 lg:-m-8 min-h-screen bg-[#F4F4F2]">
      {/* Bandeau privé — jamais confondre avec la page publique réelle */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A] text-white">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 h-11 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-bold tracking-widest uppercase text-primary-light">Aperçu du brouillon</span>
            <span className="text-white/50 text-xs hidden sm:inline truncate">Cette version n&apos;est pas encore publique.</span>
            {localVisualPackName && (
              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                {localVisualPackName} — concepts locaux
              </span>
            )}
          </div>
          <Link
            href="/dashboard/ecole/etablissement"
            className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors duration-fast shrink-0"
          >
            <ArrowLeft size={13} />
            Retour à l&apos;éditeur
          </Link>
        </div>
      </div>

      <MiniSiteDataProvider value={{ data, loading: false, error: null, baseHref: PREVIEW_BASE_HREF }}>
        <MiniSiteShell data={data} baseHref={PREVIEW_BASE_HREF} activeView={activeView}>
          {children}
        </MiniSiteShell>
      </MiniSiteDataProvider>
    </div>
  );
}
