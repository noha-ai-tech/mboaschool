"use client";

import { useState } from "react";
import Image from "next/image";
import { Info } from "lucide-react";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { MiniSiteOfficialLinks } from "@/components/school/MiniSiteOfficialLinks";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { classifySchoolGalleryImage } from "@/lib/school/galleryGroups";
import { ViewBanner } from "@/components/school/views/ViewBanner";
import { ViewShell, ViewContextMenu } from "@/components/school/views/ViewShell";

// GUYSKULL-06 §12/§15 — dedicated "Galerie & Infos" view: a featured
// campus photo, one discreet contextual notice (never a caption stamped
// on every single image — the mission's own "elegant contextual notice"
// direction), the existing grouped gallery, Actualités, Documents,
// Ressources utiles.
export function GalerieInfosView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, images, docsList } = data;
  const flags = computeMiniSiteFlags(data);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const showNews = flags.showNewsSection && (newsCount === null || newsCount > 0);

  const featured = images.find((img) => classifySchoolGalleryImage(img) === "campus") ?? images[0] ?? null;
  // GUYSKULL-06 §15 — only shown when the establishment's own gallery
  // captions actually flag demo/concept content (generic pattern, not
  // Guyskull-specific) — a school with real verified photos gets no
  // disclaimer at all.
  const hasDemoImagery = images.some((img) => /concept|démonstration|à confirmer|non confirmé/i.test(img.caption ?? ""));

  return (
    <>
      <ViewBanner
        eyebrow={school.name}
        title="Galerie & Infos"
        subtitle="Photos, actualités, documents et ressources utiles."
        images={images}
        preferredGroups={["courtyard", "campus"]}
      />
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
            <div id="galerie" className="scroll-mt-20 space-y-4">
              {featured && (
                <div className="relative w-full aspect-[21/9] rounded-card overflow-hidden bg-muted">
                  <Image src={featured.url} alt={featured.caption ?? ""} fill sizes="(max-width: 1024px) 100vw, 1280px" className="object-cover" priority={false} />
                </div>
              )}
              <div className="flex items-center justify-between px-1">
                <h2 className="font-bold text-sm">Galerie ({images.length})</h2>
                {hasDemoImagery && (
                  <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                    <Info size={12} />
                    Visuels de présentation — à confirmer par l&apos;établissement
                  </span>
                )}
              </div>
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
    </>
  );
}
