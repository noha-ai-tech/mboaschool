import {
  fetchPublicSchoolMetaSource,
  buildSchoolOrganizationJsonLd,
  buildSchoolBreadcrumbJsonLd,
} from "@/lib/schoolPage/publicSchoolMeta";
import { SchoolMiniSiteLayoutClient } from "./SchoolMiniSiteLayoutClient";

// RELEASE-CONSOLIDATION-07 — Server Component wrapper around the existing
// client mini-site shell (SchoolMiniSiteLayoutClient, verbatim former
// contents of this file). The per-school JSON-LD below is rendered as a
// SIBLING of the client tree, not passed into it as {children} — content
// passed as {children} into a Client Component crosses an async boundary
// that Next.js streams in via client-side hydration rather than the initial
// HTML response, which would make this JSON-LD invisible to non-JS
// consumers (raw curl, most SEO tooling). Sibling placement, matching how
// the root layout's own Organization/WebSite JSON-LD renders, keeps it in
// the synchronously-flushed HTML — verified via curl against this exact
// route during this mission.
export default async function SchoolMiniSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const school = await fetchPublicSchoolMetaSource(id);
  const organizationJsonLd = buildSchoolOrganizationJsonLd(school, id);
  const breadcrumbJsonLd = buildSchoolBreadcrumbJsonLd(school, id);

  return (
    <>
      {organizationJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      )}
      {breadcrumbJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      )}
      <SchoolMiniSiteLayoutClient>{children}</SchoolMiniSiteLayoutClient>
    </>
  );
}
