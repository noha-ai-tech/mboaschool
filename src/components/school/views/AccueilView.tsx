"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { MiniSiteHero } from "@/components/school/MiniSiteHero";
import { MiniSiteKeyNumbers } from "@/components/school/MiniSiteKeyNumbers";
import { MiniSiteAboutPreview } from "@/components/school/MiniSiteAboutPreview";
import { MiniSiteResultsPreview } from "@/components/school/MiniSiteResultsPreview";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { MiniSiteGalleryPreview } from "@/components/school/MiniSiteGalleryPreview";
import { DocumentDownloadCtas } from "@/components/school/DocumentDownloadCtas";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { computeAllHeroSlides, resolveHeroSlides } from "@/lib/school/heroMode";
import { categories } from "@/lib/categories";
import { buildMiniSiteViewHref } from "@/lib/schoolPage/miniSiteViews";
import { admissionYearLabelFrom, computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

// GUYSKULL-05 §4 — Accueil is a compact, dashboard-like school homepage,
// not a dump of every other view's full content. Each preview block links
// to its own dedicated, independently-routed view for the full content.
export function AccueilView({ data, baseHref }: { data: MiniSiteRendererData; baseHref: string }) {
  const { establishment: school, images, docsList, admissionsConfig, ranking, results, preinscriptionHref } = data;
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const flags = computeMiniSiteFlags(data);

  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
  const categoryLabel = categories.find((c) => c.key === school.main_category)?.label ?? null;
  const isPremium = school.subscription_plan === "premium";
  const trustState = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school));
  const trustBadge = getPrimaryPublicBadge(trustState);

  const allHeroSlides = computeAllHeroSlides(images.map((img) => ({ id: img.id, url: img.url })), school.cover_image_url);
  const heroSlides = resolveHeroSlides(allHeroSlides, (school.hero_mode as any) ?? "carousel");
  const admissionYearLabel = admissionYearLabelFrom(admissionsConfig?.period_start, admissionsConfig?.period_end);

  const etablissementHref = buildMiniSiteViewHref(baseHref, "etablissement");
  const admissionsHref = buildMiniSiteViewHref(baseHref, "admissions");
  const vieHref = buildMiniSiteViewHref(baseHref, "vie");
  const galerieHref = buildMiniSiteViewHref(baseHref, "galerie");

  const latestResult = results[0] ?? null;
  const newsVisible = flags.showNewsSection && (newsCount === null || newsCount > 0);

  return (
    <>
      <MiniSiteHero
        slides={heroSlides}
        name={school.name}
        motto={school.motto}
        description={school.description}
        admissionsOpen={flags.showAdmissions && flags.admissionsOpen}
        admissionYearLabel={admissionYearLabel}
        preinscriptionHref={preinscriptionHref}
        phone={school.phone}
        whatsapp={school.whatsapp}
        mapsHref={mapsHref}
        website={school.website}
        discoverHref={etablissementHref}
        trustBadge={trustBadge}
        premium={isPremium}
      />

      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 space-y-6">
        <MiniSiteKeyNumbers
          studentsCount={school.student_count}
          teachersCount={school.teacher_count}
          successRatePercent={latestResult?.successRatePercent ?? null}
          officialRanking={ranking?.rank ?? null}
          foundingYear={school.founding_year}
        />

        <MiniSiteAboutPreview
          description={school.description}
          categoryLabel={categoryLabel}
          city={school.city}
          neighborhood={school.neighborhood}
          imageUrl={school.cover_image_url}
          foundingYear={school.founding_year}
          studentCount={school.student_count}
          readMoreHref={etablissementHref}
        />

        {flags.showAdmissions && (
          <div className="bg-white border border-border rounded-card p-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                <GraduationCap size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-text-primary">
                  {flags.admissionsOpen ? "Admissions ouvertes" : "Informations sur les admissions"}
                  {admissionYearLabel ? ` — ${admissionYearLabel}` : ""}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  {admissionsConfig?.levels?.length ? admissionsConfig.levels.slice(0, 3).join(", ") : "Formations, tarifs et pièces à fournir"}
                </p>
              </div>
            </div>
            <Link href={admissionsHref} className="shrink-0 text-sm font-bold text-primary hover:opacity-80 transition-opacity duration-base">
              Voir les admissions →
            </Link>
          </div>
        )}

        {docsList.length > 0 && <DocumentDownloadCtas documents={docsList} />}

        {flags.showAdmissions && (results.length > 0 || ranking) && (
          <MiniSiteResultsPreview category={school.main_category} results={results} ranking={ranking} />
        )}

        {newsVisible && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm">Événements à venir</h2>
              <Link href={vieHref} className="text-xs font-bold text-primary hover:opacity-80 transition-opacity duration-base">
                Tout voir →
              </Link>
            </div>
            <AnnouncementsTab schoolId={school.id} variant="compact" limit={3} onCountChange={setNewsCount} />
          </div>
        )}

        <MiniSiteOfficialLinks category={school.main_category} website={school.website} />

        {images.length > 0 && (
          <MiniSiteGalleryPreview
            images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))}
            seeAllHref={galerieHref}
          />
        )}
      </div>
    </>
  );
}
