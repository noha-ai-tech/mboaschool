"use client";

import { useState } from "react";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ViewShell, ViewContextMenu } from "@/components/school/views/ViewShell";

// GUYSKULL-05 §8 — dedicated "Galerie & Infos" view: Galerie, Actualités,
// Documents, Ressources utiles. This is where the school's photo
// collection belongs in full (grouped, GUYSKULL-05E) — never dumped onto
// Accueil.
export function GalerieInfosView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, images, docsList } = data;
  const flags = computeMiniSiteFlags(data);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const showNews = flags.showNewsSection && (newsCount === null || newsCount > 0);

  return (
    <ViewShell>
      <ViewContextMenu
        items={[
          flags.showGallery ? { id: "galerie", label: "Galerie" } : null,
          showNews ? { id: "actualites", label: "Actualités" } : null,
          flags.showDocuments ? { id: "documents", label: "Documents" } : null,
          { id: "ressources", label: "Ressources utiles" },
        ]}
      />
      <div className="flex-1 w-full space-y-5 min-w-0">
        <h1 className="sr-only">{school.name} — Galerie &amp; Infos</h1>
        {flags.showGallery && (
          <div id="galerie" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Galerie ({images.length})</h2>
            <SchoolGallery images={images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))} />
          </div>
        )}
        {showNews && (
          <div id="actualites" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Actualités</h2>
            <AnnouncementsTab schoolId={school.id} onCountChange={setNewsCount} />
          </div>
        )}
        {flags.showDocuments && (
          <div id="documents" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
            <DocumentsTab docs={docsList} />
          </div>
        )}
        <div id="ressources" className="scroll-mt-20">
          <MiniSiteOfficialLinks category={school.main_category} website={school.website} />
        </div>
      </div>
    </ViewShell>
  );
}
