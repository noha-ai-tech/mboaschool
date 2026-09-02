"use client";

import { useState } from "react";
import { MiniSiteResultsPreview } from "@/components/school/MiniSiteResultsPreview";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ViewBanner } from "@/components/school/views/ViewBanner";
import { ViewShell, EmptyViewNote } from "@/components/school/views/ViewShell";

// GUYSKULL-05 §7 — dedicated "Vie & Résultats" view. Results/ranking render
// ONLY when real data exists (MiniSiteResultsPreview's own gating,
// unchanged) — never an empty placeholder card. Events stay immediate-live
// (school_announcements), each carrying its own demo/official labeling in
// its own content — no separate mechanism invented here.
export function VieResultatsView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, ranking, results, images } = data;
  const flags = computeMiniSiteFlags(data);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const showNews = flags.showNewsSection && (newsCount === null || newsCount > 0);

  return (
    <>
      <ViewBanner
        title="Vie & Résultats"
        subtitle="Résultats, classement, événements et vie scolaire."
        images={images}
        preferredGroups={["pedagogy", "play", "courtyard"]}
      />
      <ViewShell>
        <div className="flex-1 w-full space-y-5 min-w-0">
          <h1 className="sr-only">{school.name} — Vie &amp; Résultats</h1>
          <MiniSiteResultsPreview category={school.main_category} results={results} ranking={ranking} />
          {showNews ? (
            <div>
              <h2 className="font-bold text-sm mb-3 px-1">Actualités &amp; événements</h2>
              <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
            </div>
          ) : (
            results.length === 0 && !ranking && <EmptyViewNote />
          )}
        </div>
      </ViewShell>
    </>
  );
}
