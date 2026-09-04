"use client";

import { AccueilView } from "@/components/school/views/AccueilView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

// GUYSKULL-05 — Accueil is the root of the 5-view mini-site. Data comes
// from the shared layout (src/app/ecole/[id]/layout.tsx) via context —
// this component owns no fetch of its own.
//
// RELEASE-CONSOLIDATION-07 — split out of page.tsx verbatim so page.tsx
// can become a Server Component exporting generateMetadata(); this
// component's own client-side render logic is unchanged.
export function AccueilPageClient() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <AccueilView data={data} baseHref={baseHref} />;
}
