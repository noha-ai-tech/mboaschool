"use client";

import { AccueilView } from "@/components/school/views/AccueilView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

// GUYSKULL-05 — Accueil is the root of the 5-view mini-site. Data comes
// from the shared layout (src/app/ecole/[id]/layout.tsx) via context —
// this page owns no fetch of its own.
export default function SchoolAccueilPage() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <AccueilView data={data} baseHref={baseHref} />;
}
