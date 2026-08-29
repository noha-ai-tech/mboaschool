"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { School, ClipboardList, Phone, Mail, MapPin, Globe } from "lucide-react";
import { SchoolSiteHeader, type MiniSiteTabKey } from "@/components/school/SchoolSiteHeader";
import { SchoolSiteFooter } from "@/components/school/SchoolSiteFooter";
import { MiniSiteHero } from "@/components/school/MiniSiteHero";
import { MiniSiteKeyNumbers } from "@/components/school/MiniSiteKeyNumbers";
import { MiniSiteAboutPreview } from "@/components/school/MiniSiteAboutPreview";
import { MiniSiteResultsPreview } from "@/components/school/MiniSiteResultsPreview";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { MiniSiteGalleryPreview } from "@/components/school/MiniSiteGalleryPreview";
import { GeneralTab, FEE_COLS, INFRA_LABELS } from "@/components/school/GeneralTab";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab, type AdmissionsConfig } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { computeAllHeroSlides, resolveHeroSlides } from "@/lib/school/heroMode";
import { resolveSectionConfig } from "@/lib/schoolPage/sections";
import { categories } from "@/lib/categories";

// PUBLIC-SITE-01 — the public school page becomes a school-specific
// mini-site (§2): the Écoles237 SiteHeader/SiteFooter/directory chrome are
// gone from this route, replaced by SchoolSiteHeader/SchoolSiteFooter, and
// content is organized into 5 tabs (§3) instead of one long scroll. This is
// an EXTENSION of the existing rendering, not a CMS rewrite (§10) — the
// underlying data fetch (live tables only, never school_page_drafts) and
// the section-visibility rules from school_page_sections are unchanged;
// only the shell and information architecture are new. The Draft/Preview/
// Publish/Discard editor and src/app/dashboard/ecole/etablissement/preview
// still use the previous single-page SchoolPageSections renderer,
// deliberately untouched (§10/§16 — do not rebuild the CMS).

export default function SchoolPage() {
  const params = useParams();
  const id = params.id as string;

  const [school, setSchool]     = useState<any>(null);
  const [fees, setFees]         = useState<any | null>(null);
  const [infra, setInfra]       = useState<any | null>(null);
  const [images, setImages]     = useState<any[]>([]);
  const [docsList, setDocsList] = useState<any[]>([]);
  const [sectionRows, setSectionRows] = useState<{ section_key: string; position: number; is_visible: boolean }[]>([]);
  const [admissionsConfig, setAdmissionsConfig] = useState<AdmissionsConfig | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<MiniSiteTabKey>("accueil");

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
      ] = await Promise.all([
        supabase.from("establishments").select("*").eq("id", id).single(),
        supabase.from("fees").select("*").eq("establishment_id", id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", id).maybeSingle(),
        // CMS-F.6 — filtre status='live' explicite, en défense en profondeur
        // avec la policy RLS publique (migration 0032) : jamais une photo
        // draft_pending_add exposée publiquement (PUBLIC-SITE-01 §14).
        supabase.from("school_images").select("*").eq("establishment_id", id).eq("status", "live").order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", id).order("created_at", { ascending: false }),
        supabase.from("school_page_sections").select("section_key, position, is_visible").eq("establishment_id", id),
        supabase.from("admissions_config").select("is_open, levels, conditions, required_documents, period_start, period_end, additional_info").eq("establishment_id", id).maybeSingle(),
      ]);

      if (schoolData) setSchool(schoolData);
      if (feesData)   setFees(feesData);
      if (infraData)  setInfra(infraData);
      if (imagesData) setImages(imagesData);
      if (docsData)   setDocsList(docsData);
      if (sectionsData) setSectionRows(sectionsData);
      if (admissionsData) setAdmissionsConfig(admissionsData as AdmissionsConfig);
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

  if (!school) {
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

  const sectionConfig = resolveSectionConfig(sectionRows);
  const isVisible = (key: string) => sectionConfig.find((c) => c.key === key)?.is_visible ?? true;

  const preinscriptionHref = `/preinscription?ecole=${school.id}`;
  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const categoryLabel = categories.find((c) => c.key === school.main_category)?.label ?? null;
  const isPremium = school.subscription_plan === "premium";
  // SPRINT REGISTRY-NATIONAL-A.1 — même résolveur central que l'ancienne
  // fiche (src/lib/trust) ; PUBLIC-SITE-01 ne retire jamais un signal de
  // confiance déjà affiché, seulement le contexte visuel autour.
  const trustState = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school));
  const trustBadge = getPrimaryPublicBadge(trustState);

  const allHeroSlides = computeAllHeroSlides(images.map((img) => ({ id: img.id, url: img.url })), school.cover_image_url);
  const heroSlides = resolveHeroSlides(allHeroSlides, school.hero_mode ?? "carousel");

  const admissionsOpen = admissionsConfig?.is_open ?? true;
  const admissionYearLabel = admissionYearLabelFrom(admissionsConfig?.period_start, admissionsConfig?.period_end);

  const feeRows = fees ? FEE_COLS.filter((f) => fees[f.key] && Number(fees[f.key]) > 0) : [];
  const infraItems = infra ? Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true) : [];

  const showPresentation = isVisible("presentation");
  const showInfrastructure = isVisible("infrastructure") && infraItems.length > 0;
  const showContact = isVisible("contact");
  const showPricing = isVisible("pricing") && feeRows.length > 0;
  const showDocuments = isVisible("documents") && docsList.length > 0;
  const showGallery = isVisible("gallery") && images.length > 0;
  const showNews = isVisible("news") && (newsCount === null || newsCount > 0);
  const showAdmissions = isVisible("admissions");

  return (
    <div className="min-h-screen bg-[#F4F4F2]">
      <SchoolSiteHeader
        logoUrl={school.logo_url}
        name={school.name}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        phone={school.phone}
      />

      {activeTab === "accueil" && (
        <>
          <MiniSiteHero
            slides={heroSlides}
            name={school.name}
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
            <MiniSiteKeyNumbers />

            <MiniSiteAboutPreview
              description={school.description}
              categoryLabel={categoryLabel}
              city={school.city}
              neighborhood={school.neighborhood}
              imageUrl={school.cover_image_url}
              onReadMore={() => setActiveTab("etablissement")}
            />

            {showAdmissions && (
              <MiniSiteResultsPreview category={school.main_category} results={[]} ranking={null} />
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
              showInfrastructure ? { id: "infrastructures", label: "Infrastructures" } : null,
              showContact ? { id: "contact", label: "Contact" } : null,
            ]}
          />
          <div className="flex-1 space-y-5 min-w-0">
            {(showPresentation || showInfrastructure) && (
              <GeneralTab
                school={school}
                fees={fees}
                infra={infra}
                sections={{ presentation: showPresentation, tarifs: false, infrastructures: showInfrastructure }}
              />
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
                {!school.owner_id && (
                  <p className="text-xs text-text-secondary/70 mt-4 pt-4 border-t border-border">
                    Vous représentez cet établissement ?{" "}
                    <Link href={`/revendiquer/${school.id}`} className="font-semibold text-text-secondary hover:text-primary underline">
                      Revendiquez cette fiche
                    </Link>
                  </p>
                )}
              </div>
            )}
            {!showPresentation && !showInfrastructure && !showContact && <EmptyTabNote />}
          </div>
        </TabShell>
      )}

      {activeTab === "admissions" && (
        <TabShell>
          <ContextMenu
            items={[
              showAdmissions ? { id: "admissions", label: "Admissions" } : null,
              showPricing ? { id: "tarifs", label: "Tarifs" } : null,
              showDocuments ? { id: "documents-admissions", label: "Documents" } : null,
            ]}
          />
          <div className="flex-1 space-y-5 min-w-0">
            {showAdmissions && <ParentTab schoolId={school.id} admissionsConfig={admissionsConfig} />}
            {showPricing && (
              <GeneralTab school={school} fees={fees} infra={infra} sections={{ presentation: false, tarifs: true, infrastructures: false }} />
            )}
            {showDocuments && (
              <div id="documents-admissions" className="scroll-mt-20">
                <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
                <DocumentsTab docs={docsList} />
              </div>
            )}
            {!showAdmissions && !showPricing && !showDocuments && <EmptyTabNote />}
          </div>
        </TabShell>
      )}

      {activeTab === "vie" && (
        <TabShell>
          <div className="flex-1 space-y-5 min-w-0">
            <MiniSiteResultsPreview category={school.main_category} results={[]} ranking={null} />
            {showNews ? (
              <div>
                <h2 className="font-bold text-sm mb-3 px-1">Actualités & événements</h2>
                <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
              </div>
            ) : (
              <EmptyTabNote />
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
          <div className="flex-1 space-y-5 min-w-0">
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
        description={school.description}
        address={address || null}
        phone={school.phone}
        whatsapp={school.whatsapp}
        email={school.email}
        website={school.website}
      />

      {/* CTA sticky mobile — équivalent du bandeau existant, conservé (§4A CTA toujours atteignable) */}
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
      {/* Desktop — mini-menu contextuel à gauche (§5) */}
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
      {/* Mobile — puces horizontales (§5) */}
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

// PUBLIC-SITE-01 §4A — jamais d'année académique fabriquée : dérivée
// uniquement de admissions_config.period_start/period_end quand
// configurés ; sinon le CTA hero reste sans année ("Admissions ouvertes").
function admissionYearLabelFrom(periodStart: string | null | undefined, periodEnd: string | null | undefined): string | null {
  const startYear = periodStart ? new Date(periodStart).getFullYear() : null;
  const endYear = periodEnd ? new Date(periodEnd).getFullYear() : null;
  if (startYear && endYear && startYear !== endYear) return `${startYear}–${endYear}`;
  if (startYear) return String(startYear);
  if (endYear) return String(endYear);
  return null;
}
