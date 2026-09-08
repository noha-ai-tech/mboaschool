import type { SchoolPageSectionKey } from "@/lib/schoolPage/sections";
import type { SchoolPagePricing } from "@/lib/schoolPage/pricing";
import type { SchoolDocument } from "@/lib/schoolPage/documents";
import type { AdmissionsConfig } from "@/components/school/ParentTab";
import type { ExamResult, OfficialRanking } from "@/components/school/MiniSiteResultsPreview";
import { INFRA_LABELS } from "@/components/school/GeneralTab";
import { hasDisplayablePricing } from "@/components/school/StructuredPricing";

// GUYSKULL-05 — moved out of the old single-component MiniSiteRenderer so
// every one of the 5 independent view components (src/components/school/
// views/*) and both route trees (public + CMS Preview) can share one
// definition without importing a component file for a type. Behavior is
// unchanged from PUBLIC-SITE-02 §7 / GUYSKULL-04B — only the location moved.
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

/** Same visibility/gating logic every view previously computed inline inside MiniSiteRenderer — centralized so the 5 views (and the shell) can never compute it differently from one another. */
export function computeMiniSiteFlags(data: MiniSiteRendererData) {
  const { establishment: school, fees, infra, images, docsList, sectionConfig, admissionsConfig } = data;
  const isVisible = (key: string) => sectionConfig.find((c) => c.key === key)?.is_visible ?? true;

  const infraItems = infra ? Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true) : [];
  const admissionsOpen = admissionsConfig?.is_open ?? true;

  const showPresentation = isVisible("presentation");
  const showInfrastructure = isVisible("infrastructure") && infraItems.length > 0;
  const showContact = isVisible("contact");
  const showPricing = isVisible("pricing") && hasDisplayablePricing(fees);
  const showDocuments = isVisible("documents") && docsList.length > 0;
  const showGallery = isVisible("gallery") && images.length > 0;
  const showAdmissions = isVisible("admissions");
  /** CMS section-visibility toggle only — still needs combining with a live newsCount check (announcements are fetched separately by each view). */
  const showNewsSection = isVisible("news");
  const hasIdentityText = !!(school.history || school.mission || school.vision);

  return { showPresentation, showInfrastructure, showContact, showPricing, showDocuments, showGallery, showAdmissions, showNewsSection, admissionsOpen, hasIdentityText, infraItems };
}

export function admissionYearLabelFrom(periodStart: string | null | undefined, periodEnd: string | null | undefined): string | null {
  const startYear = periodStart ? new Date(periodStart).getFullYear() : null;
  const endYear = periodEnd ? new Date(periodEnd).getFullYear() : null;
  if (startYear && endYear && startYear !== endYear) return `${startYear}–${endYear}`;
  if (startYear) return String(startYear);
  if (endYear) return String(endYear);
  return null;
}
