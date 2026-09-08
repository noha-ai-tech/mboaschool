"use client";

import { EtablissementView } from "@/components/school/views/EtablissementView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

// RELEASE-CONSOLIDATION-07 — split out of page.tsx verbatim so page.tsx
// can become a Server Component exporting generateMetadata(); this
// component's own client-side render logic is unchanged.
export function EtablissementPageClient() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <EtablissementView data={data} />;
}
