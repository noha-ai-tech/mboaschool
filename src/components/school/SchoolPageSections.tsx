import type { ReactNode } from "react";
import { Phone, Mail, Globe, MapPin } from "lucide-react";
import { GeneralTab, FEE_COLS, INFRA_LABELS } from "@/components/school/GeneralTab";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab, type AdmissionsConfig } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";
import { computeAllHeroSlides, resolveHeroSlides, type HeroMode } from "@/lib/school/heroMode";
import type { SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";
import type { SchoolPageSectionKey } from "@/lib/schoolPage/sections";

// CMS-F.4 — couche de rendu PARTAGÉE entre la fiche publique
// (src/app/ecole/[id]/page.tsx) et l'Aperçu du brouillon
// (src/app/dashboard/ecole/etablissement/preview/page.tsx). Extrait tel
// quel (comportement inchangé) de la fiche publique — un seul endroit qui
// décide de l'ordre des sections, des règles "section vide" et du contenu
// de chaque bloc. Les deux pages ne diffèrent QUE par la source des
// données (LIVE pour le public, DRAFT + domaines immediate-live pour
// l'Aperçu) — jamais par la logique de rendu elle-même (mission §16).
//
// News et Documents restent strictement immediate-live dans les deux cas :
// AnnouncementsTab s'auto-alimente depuis school_announcements (jamais
// depuis le brouillon), et `docsList` est toujours passé par l'appelant
// depuis school_documents live — jamais dupliqué ici.

export type SchoolPageViewModel = {
  id: string;
  name: string;
  main_category: string | null;
  city: string | null;
  neighborhood: string | null;
  is_verified: boolean;
  subscription_plan: string | null;
  cover_image_url: string | null;
  hero_mode: HeroMode | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const SECTION_DOM_ID: Record<SchoolPageSectionKey, string> = {
  presentation: "presentation", admissions: "admissions", pricing: "tarifs",
  infrastructure: "infrastructures", gallery: "galerie", news: "actualites",
  documents: "documents", contact: "contact",
};
export const SECTION_LABEL: Record<SchoolPageSectionKey, string> = {
  presentation: "Présentation", admissions: "Admissions", pricing: "Tarifs",
  infrastructure: "Infrastructures", gallery: "Galerie", news: "Actualités",
  documents: "Documents", contact: "Contact",
};

export function buildSchoolPageSections(params: {
  school: SchoolPageViewModel;
  fees: Record<string, number | string | null> | null;
  infra: Record<string, boolean> | null;
  images: { id: string; url: string; caption?: string | null }[];
  docsList: any[];
  admissionsConfig: AdmissionsConfig | null;
  sectionConfig: { key: SchoolPageSectionKey; is_visible: boolean }[];
  newsCount: number | null;
  onNewsCountChange: (n: number) => void;
}): {
  visibleSections: { key: SchoolPageSectionKey; node: ReactNode }[];
  sectionNav: { id: string; label: string }[];
  heroSlides: SchoolHeroSlide[];
} {
  const { school, fees, infra, images, docsList, admissionsConfig, sectionConfig, newsCount, onNewsCountChange } = params;

  const allHeroSlides = computeAllHeroSlides(images.map((img) => ({ id: img.id, url: img.url })), school.cover_image_url);
  const heroSlides = resolveHeroSlides(allHeroSlides, school.hero_mode ?? "carousel");

  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const mapsHref = school.latitude && school.longitude
    ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}`
    : null;

  const feeRows = fees ? FEE_COLS.filter((f) => fees[f.key] && Number(fees[f.key]) > 0) : [];
  const infraItems = infra ? Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true) : [];

  // §13/§17 — une section sans contenu utile ne doit pas créer un bloc
  // vide, avec les MÊMES règles quelle que soit la source des données
  // (live ou brouillon) : c'est exactement pourquoi cette fonction est
  // partagée plutôt que dupliquée.
  function isEmptySection(key: SchoolPageSectionKey): boolean {
    switch (key) {
      case "gallery": return images.length === 0;
      case "documents": return docsList.length === 0;
      case "pricing": return feeRows.length === 0;
      case "infrastructure": return infraItems.length === 0;
      case "news": return newsCount === 0;
      default: return false;
    }
  }

  const sectionBlocks: Record<SchoolPageSectionKey, ReactNode> = {
    presentation: (
      <GeneralTab school={school} fees={fees} infra={infra} sections={{ tarifs: false, infrastructures: false }} />
    ),
    admissions: <ParentTab schoolId={school.id} admissionsConfig={admissionsConfig} />,
    pricing: (
      <GeneralTab school={school} fees={fees} infra={infra} sections={{ presentation: false, infrastructures: false }} />
    ),
    infrastructure: (
      <GeneralTab school={school} fees={fees} infra={infra} sections={{ presentation: false, tarifs: false }} />
    ),
    gallery: (
      <div id="galerie" className="scroll-mt-20">
        <h2 className="font-bold text-sm mb-3 px-1">Galerie{images.length > 0 ? ` (${images.length})` : ""}</h2>
        <SchoolGallery images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))} />
      </div>
    ),
    news: (
      <div id="actualites" className="scroll-mt-20">
        <h2 className="font-bold text-sm mb-3 px-1">Actualités</h2>
        <AnnouncementsTab schoolId={school.id} onCountChange={onNewsCountChange} />
      </div>
    ),
    documents: (
      <div id="documents" className="scroll-mt-20">
        <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
        <DocumentsTab docs={docsList} />
      </div>
    ),
    contact: (
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
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
          >
            <MapPin size={14} /> Voir sur la carte
          </a>
        )}
      </div>
    ),
  };

  const visibleSectionConfig = sectionConfig.filter((c) => c.is_visible && !isEmptySection(c.key));
  const visibleSections = visibleSectionConfig.map((c) => ({ key: c.key, node: sectionBlocks[c.key] }));
  const sectionNav = visibleSectionConfig.map((c) => ({ id: SECTION_DOM_ID[c.key], label: SECTION_LABEL[c.key] }));

  return { visibleSections, sectionNav, heroSlides };
}
