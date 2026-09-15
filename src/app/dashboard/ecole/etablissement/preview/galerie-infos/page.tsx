"use client";

import { GalerieInfosView } from "@/components/school/views/GalerieInfosView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function PreviewGalerieInfosPage() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <GalerieInfosView data={data} baseHref={baseHref} />;
}
