import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { MINISITE_VIEWS, type MiniSiteViewKey } from "./miniSiteViews";

// RELEASE-CONSOLIDATION-07 §3/§4/§5 — server-rendered metadata/structured
// data for the five public school-minisite views. Deliberately a SEPARATE,
// minimal, read-only fetch from the client-side one in layout.tsx: this
// runs in generateMetadata() (a Server Component API, unavailable to the
// "use client" layout/pages that own the real page data), and only needs
// the handful of fields a title/description/JSON-LD actually uses — never
// invents facts the fetch doesn't return.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type PublicSchoolMetaSource = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
} | null;

// cache() dedupes this across generateMetadata() and the layout/page render
// within a single request — the layout and each page independently need
// this same row, but it's fetched from the database at most once per request.
export const fetchPublicSchoolMetaSource = cache(async (id: string): Promise<PublicSchoolMetaSource> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("establishments")
    .select("id, name, description, city, neighborhood, address, logo_url, cover_image_url, phone")
    .eq("id", id)
    .maybeSingle();
  return (data as PublicSchoolMetaSource) ?? null;
});

function locationText(school: NonNullable<PublicSchoolMetaSource>): string | null {
  if (school.neighborhood && school.city) return `${school.neighborhood}, ${school.city}`;
  return school.city ?? school.neighborhood ?? null;
}

function viewPath(id: string, view: MiniSiteViewKey): string {
  const slug = MINISITE_VIEWS.find((v) => v.key === view)?.slug ?? "";
  return slug ? `/ecole/${id}/${slug}` : `/ecole/${id}`;
}

/** Builds the exact server-rendered <title>/<meta description>/canonical/
 * OpenGraph/Twitter metadata for one school view. Never fabricates
 * success rates, student counts, accreditation, ranking, programs, fees,
 * or quality claims — only reflects what fetchPublicSchoolMetaSource()
 * actually returned. */
export function buildSchoolViewMetadata(view: MiniSiteViewKey, school: PublicSchoolMetaSource, id: string): Metadata {
  const path = viewPath(id, view);

  if (!school) {
    return {
      title: { absolute: "Établissement introuvable | Écoles237" },
      description: "Cette fiche établissement n'est pas disponible sur Écoles237.",
      alternates: { canonical: path },
      robots: { index: false, follow: true },
    };
  }

  const viewDef = MINISITE_VIEWS.find((v) => v.key === view)!;
  const fullTitle = view === "accueil"
    ? `${school.name} — Écoles237`
    : `${school.name} — ${viewDef.label} | Écoles237`;

  const location = locationText(school);
  const rawDescription = school.description?.trim().replace(/\s+/g, " ");
  const description = rawDescription
    ? (rawDescription.length > 155 ? `${rawDescription.slice(0, 154).trimEnd()}…` : rawDescription)
    : `Découvrez les informations disponibles sur ${school.name}${location ? `, établissement situé à ${location}` : ""}, sur Écoles237.`;

  const image = school.cover_image_url || school.logo_url || undefined;

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: "Écoles237",
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/** Schema.org EducationalOrganization — only fields backed by real stored
 * data. Never emits rating/aggregateRating/review/priceRange/foundingDate/
 * numberOfStudents/accreditation, per RELEASE-CONSOLIDATION-07 §4. */
export function buildSchoolOrganizationJsonLd(school: PublicSchoolMetaSource, id: string) {
  if (!school) return null;
  const url = `${SITE_URL}/ecole/${id}`;
  const hasAddressData = Boolean(school.address || school.neighborhood || school.city);

  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: school.name,
    url,
    ...(school.phone ? { telephone: school.phone } : {}),
    ...(hasAddressData
      ? {
          address: {
            "@type": "PostalAddress",
            ...(school.address ? { streetAddress: school.address } : {}),
            ...(school.neighborhood ? { addressLocality: school.neighborhood } : school.city ? { addressLocality: school.city } : {}),
            addressCountry: "CM",
          },
        }
      : {}),
    ...(school.logo_url || school.cover_image_url ? { image: school.logo_url || school.cover_image_url } : {}),
  };
}

/** BreadcrumbList — Accueil > Écoles > {School Name}. Emitted once from the
 * shared /ecole/[id] layout (valid identically on all 5 views of one
 * school), rather than per-page, so it renders in the layout's own
 * synchronous output instead of the page segment's streamed/deferred one. */
export function buildSchoolBreadcrumbJsonLd(school: PublicSchoolMetaSource, id: string) {
  if (!school) return null;
  const items: { name: string; url: string }[] = [
    { name: "Accueil", url: SITE_URL },
    { name: "Écoles", url: `${SITE_URL}/recherche` },
    { name: school.name, url: `${SITE_URL}${viewPath(id, "accueil")}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
