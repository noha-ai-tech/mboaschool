"use client";

import { VieResultatsView } from "@/components/school/views/VieResultatsView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function SchoolVieResultatsPage() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <VieResultatsView data={data} />;
}
