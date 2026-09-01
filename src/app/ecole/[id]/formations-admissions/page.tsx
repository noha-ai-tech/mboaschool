"use client";

import { FormationsAdmissionsView } from "@/components/school/views/FormationsAdmissionsView";
import { useMiniSiteContext } from "@/lib/schoolPage/miniSiteContext";

export default function SchoolFormationsAdmissionsPage() {
  const { data } = useMiniSiteContext();
  if (!data) return null;
  return <FormationsAdmissionsView data={data} />;
}
