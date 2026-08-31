"use client";

import Link from "next/link";
import { useState } from "react";
import { Phone, Mail, MapPin, Globe, ClipboardList } from "lucide-react";
import { SchoolSiteHeader, type MiniSiteTabKey } from "@/components/school/SchoolSiteHeader";
import { SchoolSiteFooter } from "@/components/school/SchoolSiteFooter";
import { MiniSiteHero } from "@/components/school/MiniSiteHero";
import { MiniSiteKeyNumbers } from "@/components/school/MiniSiteKeyNumbers";
import { MiniSiteAboutPreview } from "@/components/school/MiniSiteAboutPreview";
import { MiniSiteResultsPreview, type ExamResult, type OfficialRanking } from "@/components/school/MiniSiteResultsPreview";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { MiniSiteGalleryPreview } from "@/components/school/MiniSiteGalleryPreview";
import { GeneralTab, INFRA_LABELS } from "@/components/school/GeneralTab";
import { StructuredPricing, hasDisplayablePricing } from "@/components/school/StructuredPricing";
import { DocumentDownloadCtas } from "@/components/school/DocumentDownloadCtas";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab, type AdmissionsConfig } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { computeAllHeroSlides, resolveHeroSlides } from "@/lib/school/heroMode";
import { categories } from "@/lib/categories";
import type { SchoolPageSectionKey } from "@/lib/schoolPage/sections";
import type { SchoolPagePricing } from "@/lib/schoolPage/pricing";
import type { SchoolDocument } from "@/lib/schoolPage/documents";

// PUBLIC-SITE-02 §7 — CRITICAL PREVIEW PARITY. The public route
// (src/app/ecole/[id]/page.tsx) renders PUBLISHED data through this
// component; the CMS Preview (src/app/dashboard/ecole/etablissement/
// preview/page.tsx) renders DRAFT data (with live-only fallbacks —
// News/Documents/admissions.is_open) through the exact same component.
// One visual language, one implementation — never a second renderer.
//
// This is a straight extraction of PUBLIC-SITE-01's ecole/[id]/page.tsx
// body, parameterized on `data` instead of doing its own fetch, plus the
// PUBLIC-SITE-02 identity/key-numbers/results/ranking wiring.

export type MiniSiteEstablishment = {
  id: string;
  name: string;
  description: string | null;
  main_category: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  subscription_plan: string | null;
  hero_mode: string | null;
  motto: string | null;
  history: string | null;
  mission: string | null;
  vision: string | null;
  founding_year: number | null;
  student_count: number | null;
  teacher_count: number | null;
  is_verified: boolean;
  owner_id: string | null;
  is_claimed: boolean;
  verification_status: string | null;
  official_id: string | null;
  source_ministry: string | null;
};

export type MiniSiteRendererData = {
  establishment: MiniSiteEstablishment;
  fees: SchoolPagePricing | null;
  infra: Record<string, boolean | null> | null;
  images: { id: string; url: string; caption?: string | null }[];
  docsList: SchoolDocument[];
  sectionConfig: { key: SchoolPageSectionKey; is_visible: boolean }[];
  admissionsConfig: AdmissionsConfig | null;
  ranking: OfficialRanking | null;
  results: ExamResult[];
  preinscriptionHref: string;
  /** "public" = real preinscription CTA; "preview" = disabled ("#"), the caller already passes preinscriptionHref="#" in that case — this flag only toggles cosmetic differences if any are ever needed. */
  mode: "public" | "preview";
};

export function MiniSiteRenderer({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, fees, infra, images, docsList, sectionConfig, admissionsConfig, ranking, results, preinscriptionHref } = data;
  const [activeTab, setActiveTab] = useState<MiniSiteTabKey>("accueil");
  const [newsCount, setNewsCount] = useState<number | null>(null);

  const isVisible = (key: string) => sectionConfig.find((c) => c.key === key)?.is_visible ?? true;

  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const categoryLabel = categories.find((c) => c.key === school.main_category)?.label ?? null;
  const isPremium = school.subscription_plan === "premium";
  const trustState = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school));
  const trustBadge = getPrimaryPublicBadge(trustState);

  const allHeroSlides = computeAllHeroSlides(images.map((img) => ({ id: img.id, url: img.url })), school.cover_image_url);
  const heroSlides = resolveHeroSlides(allHeroSlides, (school.hero_mode as any) ?? "carousel");

  const admissionsOpen = admissionsConfig?.is_open ?? true;
  const admissionYearLabel = admissionYearLabelFrom(admissionsConfig?.period_start, admissionsConfig?.period_end);

  const infraItems = infra ? Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true) : [];

  const showPresentation = isVisible("presentation");
  const showInfrastructure = isVisible("infrastructure") && infraItems.length > 0;
  const showContact = isVisible("contact");
  const showPricing = isVisible("pricing") && hasDisplayablePricing(fees);
  const showDocuments = isVisible("documents") && docsList.length > 0;
  const showGallery = isVisible("gallery") && images.length > 0;
  const showNews = isVisible("news") && (newsCount === null || newsCount > 0);
  const showAdmissions = isVisible("admissions");
  const hasIdentityText = !!(school.history || school.mission || school.vision);

  return (
    <div className="min-h-screen bg-[#F4F4F2]">
      <SchoolSiteHeader
        logoUrl={school.logo_url}
        name={school.name}
        motto={school.motto}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        phone={school.phone}
        sticky={data.mode === "public"}
      />

      {activeTab === "accueil" && (
        <>
          <MiniSiteHero
            slides={heroSlides}
            name={school.name}
            motto={school.motto}
            description={school.description}
            admissionsOpen={showAdmissions && admissionsOpen}
            admissionYearLabel={admissionYearLabel}
            preinscriptionHref={preinscriptionHref}
            phone={school.phone}
            whatsapp={school.whatsapp}
            mapsHref={mapsHref}
            website={school.website}
            onDiscoverClick={() => setActiveTab("etablissement")}
            trustBadge={trustBadge}
            premium={isPremium}
          />

          <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 space-y-6">
            <MiniSiteKeyNumbers
              studentsCount={school.student_count}
              teachersCount={school.teacher_count}
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
              onReadMore={() => setActiveTab("etablissement")}
            />

            {showDocuments && <DocumentDownloadCtas documents={docsList} />}

            {showAdmissions && (results.length > 0 || ranking) && (
              <MiniSiteResultsPreview category={school.main_category} results={results} ranking={ranking} />
            )}

            {showNews && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-sm">Événements à venir</h2>
                  <button onClick={() => setActiveTab("vie")} className="text-xs font-bold text-primary hover:opacity-80 transition-opacity duration-base">
                    Tout voir →
                  </button>
                </div>
                <AnnouncementsTab schoolId={school.id} variant="compact" limit={3} onCountChange={setNewsCount} />
              </div>
            )}

            <MiniSiteOfficialLinks category={school.main_category} website={school.website} />

            {showGallery && (
              <MiniSiteGalleryPreview
                images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))}
                onSeeAllClick={() => setActiveTab("galerie")}
              />
            )}
          </div>
        </>
      )}

      {activeTab === "etablissement" && (
        <TabShell>
          <ContextMenu
            items={[
              showPresentation ? { id: "presentation", label: "Présentation" } : null,
              school.history ? { id: "historique", label: "Historique" } : null,
              (school.mission || school.vision) ? { id: "mission-vision", label: "Mission & Vision" } : null,
              showInfrastructure ? { id: "infrastructures", label: "Infrastructures" } : null,
              showContact ? { id: "contact", label: "Contact" } : null,
            ]}
          />
          <div className="flex-1 w-full space-y-5 min-w-0">
            {(showPresentation || showInfrastructure) && (
              <GeneralTab
                school={school}
                fees={fees}
                infra={infra}
                sections={{ presentation: showPresentation, tarifs: false, infrastructures: showInfrastructure }}
              />
            )}
            {school.history && (
              <div id="historique" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
                <h2 className="font-bold text-sm mb-4">Historique</h2>
                <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.history}</p>
              </div>
            )}
            {(school.mission || school.vision) && (
              <div id="mission-vision" className="bg-white border border-border rounded-card p-6 scroll-mt-20 grid sm:grid-cols-2 gap-6">
                {school.mission && (
                  <div>
                    <h2 className="font-bold text-sm mb-2">Mission</h2>
                    <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.mission}</p>
                  </div>
                )}
                {school.vision && (
                  <div>
                    <h2 className="font-bold text-sm mb-2">Vision</h2>
                    <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.vision}</p>
                  </div>
                )}
              </div>
            )}
            {showContact && (
              <div id="contact" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
                <h2 className="font-bold text-sm mb-4">Contact</h2>
                {!school.phone && !school.email && !address ? (
                  <p className="text-sm text-text-secondary">Coordonnées non renseignées par l&apos;établissement.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {school.phone && <ContactRow icon={Phone} label="Téléphone" value={school.phone} href={`tel:${school.phone}`} />}
                    {school.email && <ContactRow icon={Mail} label="Email" value={school.email} href={`mailto:${school.email}`} />}
                    {address && <ContactRow icon={MapPin} label="Adresse" value={address} href={mapsHref ?? undefined} />}
                    {school.website && <ContactRow icon={Globe} label="Site web" value={school.website} href={school.website} />}
                  </div>
                )}
                {data.mode === "public" && !school.owner_id && (
                  <p className="text-xs text-text-secondary/70 mt-4 pt-4 border-t border-border">
                    Vous représentez cet établissement ?{" "}
                    <Link href={`/revendiquer/${school.id}`} className="font-semibold text-text-secondary hover:text-primary underline">
                      Revendiquez cette fiche
                    </Link>
                  </p>
                )}
              </div>
            )}
            {!showPresentation && !showInfrastructure && !showContact && !school.history && !hasIdentityText && <EmptyTabNote />}
          </div>
        </TabShell>
      )}

      {activeTab === "admissions" && (
        <TabShell>
          <ContextMenu
            items={[
              showAdmissions ? { id: "formations", label: "Formations" } : null,
              showAdmissions ? { id: "admissions", label: "Admissions" } : null,
              showPricing ? { id: "tarifs", label: "Tarifs" } : null,
              showAdmissions ? { id: "pieces-requises", label: "Pièces à fournir" } : null,
              showDocuments ? { id: "documents-admissions", label: "Documents" } : null,
            ]}
          />
          <div className="flex-1 w-full space-y-5 min-w-0">
            {showAdmissions && (
              <div id="formations" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
                <h2 className="font-bold text-sm mb-3">Formations</h2>
                {admissionsConfig?.levels.length ? <p className="text-sm text-text-secondary">{admissionsConfig.levels.join(", ")}</p> : <p className="text-sm text-text-secondary">Formations non renseignées par l&apos;établissement.</p>}
              </div>
            )}
            {showAdmissions && <ParentTab schoolId={school.id} admissionsConfig={admissionsConfig} showLevels={false} showRequiredDocuments={false} />}
            {showPricing && fees && <StructuredPricing pricing={fees} />}
            {showAdmissions && (
              <div id="pieces-requises" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
                <h2 className="font-bold text-sm mb-3">Pièces à fournir</h2>
                {admissionsConfig?.required_documents.length ? <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">{admissionsConfig.required_documents.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-text-secondary">Liste non renseignée par l&apos;établissement.</p>}
              </div>
            )}
            {showDocuments && (
              <div id="documents-admissions" className="scroll-mt-20">
                <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
                <DocumentDownloadCtas documents={docsList} compact />
                <DocumentsTab docs={docsList} />
              </div>
            )}
            {!showAdmissions && !showPricing && !showDocuments && <EmptyTabNote />}
          </div>
        </TabShell>
      )}

      {activeTab === "vie" && (
        <TabShell>
          <div className="flex-1 w-full space-y-5 min-w-0">
            <MiniSiteResultsPreview category={school.main_category} results={results} ranking={ranking} />
            {showNews ? (
              <div>
                <h2 className="font-bold text-sm mb-3 px-1">Actualités & événements</h2>
                <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
              </div>
            ) : (
              results.length === 0 && !ranking && <EmptyTabNote />
            )}
          </div>
        </TabShell>
      )}

      {activeTab === "galerie" && (
        <TabShell>
          <ContextMenu
            items={[
              showGallery ? { id: "galerie", label: "Galerie" } : null,
              showNews ? { id: "actualites", label: "Actualités" } : null,
              showDocuments ? { id: "documents", label: "Documents" } : null,
              { id: "ressources", label: "Ressources utiles" },
            ]}
          />
          <div className="flex-1 w-full space-y-5 min-w-0">
            {showGallery && (
              <div id="galerie" className="scroll-mt-20">
                <h2 className="font-bold text-sm mb-3 px-1">Galerie ({images.length})</h2>
                <SchoolGallery images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))} />
              </div>
            )}
            {showNews && (
              <div id="actualites" className="scroll-mt-20">
                <h2 className="font-bold text-sm mb-3 px-1">Actualités</h2>
                <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
              </div>
            )}
            {showDocuments && (
              <div id="documents" className="scroll-mt-20">
                <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
                <DocumentsTab docs={docsList} />
              </div>
            )}
            <div id="ressources" className="scroll-mt-20">
              <MiniSiteOfficialLinks category={school.main_category} website={school.website} />
            </div>
          </div>
        </TabShell>
      )}

      <SchoolSiteFooter
        name={school.name}
        motto={school.motto}
        description={school.description}
        address={address || null}
        phone={school.phone}
        whatsapp={school.whatsapp}
        email={school.email}
        website={school.website}
      />

      {data.mode === "public" && (
        <>
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Link
              href={preinscriptionHref}
              className="block w-full text-center bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-card text-sm font-bold"
            >
              <ClipboardList size={15} className="inline mr-2 -mt-0.5" />
              Préinscrire mon enfant
            </Link>
          </div>
          <div className="lg:hidden h-20" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function TabShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 flex flex-col lg:flex-row gap-8 items-start">
      {children}
    </div>
  );
}

function ContextMenu({ items }: { items: ({ id: string; label: string } | null)[] }) {
  const visible = items.filter(Boolean) as { id: string; label: string }[];
  if (visible.length === 0) return null;

  function scrollToId(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav className="hidden lg:block w-[200px] shrink-0 sticky top-[88px] space-y-1">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToId(item.id)}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-white transition-colors duration-base"
          >
            {item.label}
          </button>
        ))}
      </nav>
      <nav className="lg:hidden -mt-2 mb-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden w-full">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToId(item.id)}
            className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-border text-text-secondary"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}

function EmptyTabNote() {
  return (
    <div className="bg-white border border-border rounded-card py-14 text-center">
      <p className="text-sm text-text-secondary">Aucune information publiée dans cette section pour le moment.</p>
    </div>
  );
}

function admissionYearLabelFrom(periodStart: string | null | undefined, periodEnd: string | null | undefined): string | null {
  const startYear = periodStart ? new Date(periodStart).getFullYear() : null;
  const endYear = periodEnd ? new Date(periodEnd).getFullYear() : null;
  if (startYear && endYear && startYear !== endYear) return `${startYear}–${endYear}`;
  if (startYear) return String(startYear);
  if (endYear) return String(endYear);
  return null;
}
