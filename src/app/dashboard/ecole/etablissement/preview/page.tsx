"use client";

import { AccueilView } from "@/components/school/views/AccueilView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function PreviewAccueilPage() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <AccueilView data={data} baseHref={baseHref} />;
}
