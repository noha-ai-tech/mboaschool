"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { SchoolSiteHeader } from "@/components/school/SchoolSiteHeader";
import { SchoolSiteFooter } from "@/components/school/SchoolSiteFooter";
import type { MiniSiteViewKey } from "@/lib/schoolPage/miniSiteViews";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ensureReadableColor } from "@/lib/schoolColor";

// GUYSKULL-05 — the shared chrome (header/nav/footer/mobile CTA bar) around
// whichever one of the 5 independent views is the current route's content.
// Generic for every school — nothing here reads any Guyskull-specific
// value; all content comes from `data`, sourced by the caller (public
// route tree = published tables, CMS Preview route tree = draft payload).
export function MiniSiteShell({
  data,
  baseHref,
  activeView,
  children,
}: {
  data: MiniSiteRendererData;
  baseHref: string;
  activeView: MiniSiteViewKey;
  children: React.ReactNode;
}) {
  const { establishment: school } = data;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");

  // GUYSKULL-06 §3 — the mini-site's own token layer, scoped to this
  // subtree only via CSS custom properties on the root — never the
  // platform-wide Tailwind `primary`/`accent` tokens (shared by the whole
  // app). MODIFICATION 5/7 — `--school-primary`/`--school-primary-dark` now
  // come from the school's own CMS colors (`establishments.couleur_primaire`
  // / `couleur_secondaire`, same pair already used for the directory card
  // gradient fallback on /recherche and the homepage) when the school has
  // set them; the Écoles237 default premium palette below is only a
  // fallback for schools that haven't configured their own colors yet.
  const schoolThemeStyle = {
    "--school-primary": ensureReadableColor(school.couleur_primaire, "#0F2A4A"),
    "--school-primary-dark": ensureReadableColor(school.couleur_secondaire, "#081A30"),
    "--school-accent-gold": "#C9A24B",
    "--school-surface": "#FFFFFF",
    "--school-muted": "#F4F3EF",
    "--school-border": "#E8E6E1",
  } as React.CSSProperties;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F4F4F2]" style={schoolThemeStyle}>
      <SchoolSiteHeader
        logoUrl={school.logo_url}
        name={school.name}
        motto={school.motto}
        baseHref={baseHref}
        activeView={activeView}
        phone={school.phone}
        sticky={data.mode === "public"}
      />

      <main>{children}</main>

      <div className="print:hidden">
        <SchoolSiteFooter
          name={school.name}
          motto={school.motto}
          description={school.description}
          category={school.main_category}
          baseHref={baseHref}
          address={address || null}
          phone={school.phone}
          whatsapp={school.whatsapp}
          email={school.email}
          website={school.website}
        />
      </div>

      {data.mode === "public" && (
        <>
          <div className="lg:hidden print:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Link
              href={data.preinscriptionHref}
              className="block w-full text-center bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-card text-sm font-bold"
            >
              <ClipboardList size={15} className="inline mr-2 -mt-0.5" />
              Préinscrire mon enfant
            </Link>
          </div>
          <div className="lg:hidden h-20" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
