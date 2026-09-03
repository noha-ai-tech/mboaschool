"use client";

import { AccueilView } from "@/components/school/views/AccueilView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

// GUYSKULL-05 — Accueil is the root of the 5-view mini-site. Data comes
// from the shared layout (preview/layout.tsx) via context — this page
// owns no fetch of its own.
//
// RELEASE-CONSOLIDATION-02 §5B — acc7175 (feat(school-admin): unify
// management interface) restyled the old monolithic single-page preview
// (SchoolHeroCarousel + buildSchoolPageSections), an architecture this
// five-view route tree has already fully replaced. Its "Aperçu du
// brouillon" private-preview banner is not lost: preview/layout.tsx
// already carries an equivalent sticky banner around all five views.
export default function PreviewAccueilPage() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <AccueilView data={data} baseHref={baseHref} />;
}
