"use client";

import { EtablissementView } from "@/components/school/views/EtablissementView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function SchoolEtablissementPage() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <EtablissementView data={data} />;
}
