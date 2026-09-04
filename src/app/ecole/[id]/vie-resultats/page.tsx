import type { Metadata } from "next";
import { fetchPublicSchoolMetaSource, buildSchoolViewMetadata } from "@/lib/schoolPage/publicSchoolMeta";
import { VieResultatsPageClient } from "./VieResultatsPageClient";

type RouteParams = { params: Promise<{ id: string }> };

// RELEASE-CONSOLIDATION-07 — Server Component wrapper: see accueil page.tsx
// for the split rationale. Render logic is unchanged, in VieResultatsPageClient.
export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const school = await fetchPublicSchoolMetaSource(id);
  return buildSchoolViewMetadata("vie", school, id);
}

export default function SchoolVieResultatsPage() {
  return <VieResultatsPageClient />;
}
