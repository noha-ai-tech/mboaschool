import type { Metadata } from "next";
import { fetchPublicSchoolMetaSource, buildSchoolViewMetadata } from "@/lib/schoolPage/publicSchoolMeta";
import { AccueilPageClient } from "./AccueilPageClient";

type RouteParams = { params: Promise<{ id: string }> };

// RELEASE-CONSOLIDATION-07 — Server Component wrapper: owns generateMetadata()
// only. Per-school JSON-LD is emitted once from the shared layout.tsx (see
// its own comment for why). The actual mini-site render is unchanged and
// lives in AccueilPageClient (verbatim former contents of this file), fed
// by the existing client-side layout fetch — this file never touches that path.
export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const school = await fetchPublicSchoolMetaSource(id);
  return buildSchoolViewMetadata("accueil", school, id);
}

export default function SchoolAccueilPage() {
  return <AccueilPageClient />;
}
