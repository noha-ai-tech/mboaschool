"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, PhoneCall } from "lucide-react";
import { MINISITE_VIEWS, buildMiniSiteViewHref, type MiniSiteViewKey } from "@/lib/schoolPage/miniSiteViews";

// PUBLIC-SITE-01 §3 — school-specific header. Deliberately NOT the
// Écoles237 SiteHeader (§2 — the mini-site must feel like the school's own
// website, not the directory). Reused nowhere else; scoped to the public
// mini-site route tree and its CMS Preview mirror.
//
// GUYSKULL-05 — the 5 tabs are now real routed links (buildMiniSiteViewHref),
// not a client-state toggle: refresh/back-forward/deep-links all work, and
// `aria-current="page"` marks the active one for assistive tech.
export type { MiniSiteViewKey } from "@/lib/schoolPage/miniSiteViews";
/** @deprecated kept for any lingering import — use MiniSiteViewKey. */
export type MiniSiteTabKey = MiniSiteViewKey;

export function SchoolSiteHeader({
  logoUrl,
  name,
  motto,
  baseHref,
  activeView,
  phone,
  sticky = true,
}: {
  logoUrl: string | null;
  name: string;
  motto?: string | null;
  /** Root URL for this school's mini-site — `/ecole/<id>` in public, `/dashboard/ecole/etablissement/preview` in CMS Preview. */
  baseHref: string;
  activeView: MiniSiteViewKey;
  phone: string | null;
  /** PUBLIC-SITE-02 §7 — the CMS Preview stacks its own sticky "draft" banner
   * above this header; a second `sticky top-0` here would overlap it
   * instead of stacking. Preview passes `sticky={false}`. */
  sticky?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={`${sticky ? "sticky top-0" : ""} z-40 bg-white border-b border-border`}>
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-muted">
              <Image src={logoUrl} alt="" fill sizes="36px" className="object-cover" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg shrink-0 bg-accent text-white flex items-center justify-center font-black text-sm">
              {name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-sm text-text-primary truncate leading-tight">{name}</p>
            {motto && <p className="text-[11px] text-text-secondary truncate leading-tight italic">{motto}</p>}
          </div>
        </div>

        <nav aria-label="Navigation de l'établissement" className="hidden lg:flex items-center gap-1">
          {MINISITE_VIEWS.map((view) => (
            <Link
              key={view.key}
              href={buildMiniSiteViewHref(baseHref, view.key)}
              aria-current={activeView === view.key ? "page" : undefined}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                activeView === view.key
                  ? "bg-primary-light text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-muted"
              }`}
            >
              {view.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-card bg-accent text-white text-sm font-bold hover:opacity-90 transition-opacity duration-base"
            >
              <PhoneCall size={13} />
              Nous contacter
            </a>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Navigation de l'établissement (mobile)" className="lg:hidden border-t border-border px-4 py-2 flex flex-col">
          {MINISITE_VIEWS.map((view) => (
            <Link
              key={view.key}
              href={buildMiniSiteViewHref(baseHref, view.key)}
              aria-current={activeView === view.key ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={`text-left px-2 py-2.5 rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                activeView === view.key ? "text-primary" : "text-text-secondary"
              }`}
            >
              {view.label}
            </Link>
          ))}
          {phone && (
            <a href={`tel:${phone}`} className="mt-1 mb-2 text-center bg-accent text-white text-sm font-bold py-2.5 rounded-card">
              Nous contacter
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
