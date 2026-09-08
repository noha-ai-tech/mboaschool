"use client";

import { useState } from "react";
import Image from "next/image";
import { MiniSiteResultsPreview } from "@/components/school/MiniSiteResultsPreview";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { classifySchoolGalleryImage } from "@/lib/school/galleryGroups";
import { ViewBanner } from "@/components/school/views/ViewBanner";
import { ViewShell, EmptyViewNote } from "@/components/school/views/ViewShell";

// GUYSKULL-05 §7 / GUYSKULL-06C §24 — dedicated "Vie & Résultats" view.
// Results/ranking render ONLY when real data exists (MiniSiteResultsPreview's
// own gating, unchanged) — never an empty placeholder card. When a school
// has no verified academic results (Guyskull today), the page leans on
// events + a school-life image strip instead of leaving empty space —
// generic, caption-classified, same mechanism as the grouped gallery.
export function VieResultatsView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, ranking, results, images } = data;
  const flags = computeMiniSiteFlags(data);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const showNews = flags.showNewsSection && (newsCount === null || newsCount > 0);

  const lifeImages = images.filter((img) => ["pedagogy", "play", "courtyard"].includes(classifySchoolGalleryImage(img))).slice(0, 3);

  return (
    <>
      <ViewBanner
        eyebrow={school.name}
        title="Vie & Résultats"
        subtitle="Résultats, classement, événements et vie scolaire."
        images={images}
        preferredGroups={["pedagogy", "play", "courtyard"]}
      />
      <ViewShell>
        <div className="flex-1 w-full space-y-6 min-w-0">
          <h1 className="sr-only">{school.name} — Vie &amp; Résultats</h1>
          <MiniSiteResultsPreview category={school.main_category} results={results} ranking={ranking} />
          {showNews ? (
            <div>
              <h2 className="font-bold text-sm mb-3 px-1">Actualités &amp; événements</h2>
              <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
            </div>
          ) : (
            results.length === 0 && !ranking && lifeImages.length === 0 && <EmptyViewNote />
          )}

          {lifeImages.length > 0 && (
            <div>
              <h2 className="font-bold text-sm mb-3 px-1">Vie scolaire</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {lifeImages.map((img) => (
                  <div key={img.id} className="group relative aspect-[4/3] overflow-hidden rounded-card bg-muted">
                    <Image
                      src={img.url}
                      alt={img.caption ?? ""}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ViewShell>
    </>
  );
}
