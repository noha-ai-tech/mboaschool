import type { Metadata } from "next";
import { fetchPublicSchoolMetaSource, buildSchoolViewMetadata } from "@/lib/schoolPage/publicSchoolMeta";
import { FormationsAdmissionsPageClient } from "./FormationsAdmissionsPageClient";

type RouteParams = { params: Promise<{ id: string }> };

// RELEASE-CONSOLIDATION-07 — Server Component wrapper: see accueil page.tsx
// for the split rationale. Render logic is unchanged, in FormationsAdmissionsPageClient.
export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const school = await fetchPublicSchoolMetaSource(id);
  return buildSchoolViewMetadata("admissions", school, id);
}

export default function SchoolFormationsAdmissionsPage() {
  return <FormationsAdmissionsPageClient />;
}
