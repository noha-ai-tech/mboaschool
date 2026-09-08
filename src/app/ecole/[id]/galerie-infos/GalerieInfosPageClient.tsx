"use client";

import { GalerieInfosView } from "@/components/school/views/GalerieInfosView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

// RELEASE-CONSOLIDATION-07 — split out of page.tsx verbatim so page.tsx
// can become a Server Component exporting generateMetadata(); this
// component's own client-side render logic is unchanged.
export function GalerieInfosPageClient() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <GalerieInfosView data={data} />;
}
