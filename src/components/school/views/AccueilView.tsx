"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Trophy } from "lucide-react";
import { MiniSiteHero } from "@/components/school/MiniSiteHero";
import { MiniSiteKeyNumbers } from "@/components/school/MiniSiteKeyNumbers";
import { MiniSiteAboutPreview } from "@/components/school/MiniSiteAboutPreview";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { MiniSiteEnvironmentShowcase } from "@/components/school/MiniSiteEnvironmentShowcase";
import { DocumentDownloadCtas } from "@/components/school/DocumentDownloadCtas";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { computeAllHeroSlides, resolveHeroSlides } from "@/lib/school/heroMode";
import { categories } from "@/lib/categories";
import { classifySchoolGalleryImage } from "@/lib/school/galleryGroups";
import { buildMiniSiteViewHref } from "@/lib/schoolPage/miniSiteViews";
import { admissionYearLabelFrom, computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

// GUYSKULL-06 §7 / GUYSKULL-06C §12 — homepage content grid: [À propos]
// [Admissions ou Résultats] [Prochains événements] as one compact row on
// desktop, one column on mobile. Generic — the middle cell shows
// Résultats/Classement whenever real data exists, Admissions otherwise;
// never an empty placeholder card. Cards follow their content's natural
// height — no forced stretch, no fixed minimum.
function GridCard({
  eyebrow,
  icon: Icon,
  title,
  children,
  href,
  ctaLabel,
}: {
  eyebrow: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex flex-col bg-white border border-border rounded-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--school-muted, #F4F3EF)", color: "var(--school-primary, #0F2A4A)" }}>
          <Icon size={15} />
        </div>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>{eyebrow}</p>
      </div>
      <p className="font-bold text-sm text-text-primary mb-2">{title}</p>
      <div className="text-sm text-text-secondary leading-relaxed mb-3">{children}</div>
      <Link href={href} className="mt-auto text-sm font-bold hover:opacity-80 transition-opacity duration-base" style={{ color: "var(--school-primary, #0F2A4A)" }}>
        {ctaLabel} →
      </Link>
    </div>
  );
}

export function AccueilView({ data, baseHref }: { data: MiniSiteRendererData; baseHref: string }) {
  const { establishment: school, images, docsList, admissionsConfig, ranking, results } = data;
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
  const hasResultsOrRanking = flags.showAdmissions && (results.length > 0 || !!ranking);

  // GUYSKULL-06 §14 — a representative "campus" photo for the About card,
  // generic (caption-classified, same mechanism as the grouped gallery),
  // falling back to the establishment's own cover image, never invented.
  const aboutImage =
    images.find((img) => classifySchoolGalleryImage(img) === "campus")?.url ?? school.cover_image_url ?? null;

  return (
    <>
      <MiniSiteHero
        slides={heroSlides}
        name={school.name}
        motto={school.motto}
        description={school.description}
        phone={school.phone}
        whatsapp={school.whatsapp}
        mapsHref={mapsHref}
        website={school.website}
        discoverHref={etablissementHref}
        admissionsHref={admissionsHref}
        showAdmissionsCta={flags.showAdmissions}
        trustBadge={trustBadge}
        premium={isPremium}
      />

      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 lg:pt-10 pb-12 space-y-10">
        <div className="space-y-6">
          <MiniSiteKeyNumbers
            studentsCount={school.student_count}
            teachersCount={school.teacher_count}
            successRatePercent={latestResult?.successRatePercent ?? null}
            officialRanking={ranking?.rank ?? null}
            foundingYear={school.founding_year}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <MiniSiteAboutPreview
              description={school.description}
              categoryLabel={categoryLabel}
              city={school.city}
              neighborhood={school.neighborhood}
              imageUrl={aboutImage}
              foundingYear={school.founding_year}
              studentCount={school.student_count}
              readMoreHref={etablissementHref}
            />

            {hasResultsOrRanking ? (
              <GridCard eyebrow="Résultats" icon={Trophy} title={ranking ? `Classement ${ranking.scope}` : "Résultats aux examens"} href={vieHref} ctaLabel="Voir les résultats">
                {ranking ? (
                  <p>{ranking.rank} — {ranking.source} ({ranking.year})</p>
                ) : latestResult ? (
                  <p>{latestResult.examLabel} {latestResult.year} — {latestResult.successRatePercent}% de réussite</p>
                ) : null}
              </GridCard>
            ) : flags.showAdmissions ? (
              <GridCard eyebrow="Admissions" icon={GraduationCap} title="Formations & admissions" href={admissionsHref} ctaLabel="Voir les admissions">
                {admissionsConfig?.levels?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {admissionsConfig.levels.slice(0, 4).map((level) => (
                      <span key={level} className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
                        {level}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>Formations, tarifs et pièces à fournir{admissionYearLabel ? ` — ${admissionYearLabel}` : ""}.</p>
                )}
              </GridCard>
            ) : null}

            {newsVisible && (
              <div className="flex flex-col bg-white border border-border rounded-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>Prochains événements</p>
                  <Link href={vieHref} className="text-xs font-bold hover:opacity-80 transition-opacity duration-base shrink-0" style={{ color: "var(--school-primary, #0F2A4A)" }}>
                    Tout voir →
                  </Link>
                </div>
                <AnnouncementsTab schoolId={school.id} variant="full" limit={2} onCountChange={setNewsCount} />
              </div>
            )}
          </div>
        </div>

        <MiniSiteEnvironmentShowcase
          images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))}
          seeAllHref={galerieHref}
        />

        {docsList.length > 0 && <DocumentDownloadCtas documents={docsList} />}

        <MiniSiteOfficialLinks category={school.main_category} website={school.website} />
      </div>
    </>
  );
}
