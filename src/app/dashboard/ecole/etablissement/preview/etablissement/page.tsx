"use client";

import { EtablissementView } from "@/components/school/views/EtablissementView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function PreviewEtablissementPage() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <EtablissementView data={data} />;
}
