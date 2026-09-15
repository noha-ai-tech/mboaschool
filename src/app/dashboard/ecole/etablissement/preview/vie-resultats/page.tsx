"use client";

import { VieResultatsView } from "@/components/school/views/VieResultatsView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function PreviewVieResultatsPage() {
  const { data, baseHref } = useMiniSiteContext();
  if (!data) return null;
  return <VieResultatsView data={data} baseHref={baseHref} />;
}
