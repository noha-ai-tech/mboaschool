"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, PhoneCall, Search, UserRound } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { MINISITE_VIEWS, buildMiniSiteViewHref, type MiniSiteViewKey } from "@/lib/schoolPage/miniSiteViews";
import { schoolMonogram } from "@/lib/school/schoolMonogram";

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
  const isGuyskullShowcase = baseHref.includes("a4cc4966-0d85-4c63-9c24-0538b8d5133b");

  if (isGuyskullShowcase) {
    return (
      <header className={`${sticky ? "sticky top-0" : ""} z-40 border-b border-slate-200 bg-white print:hidden`}>
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-5 px-4 lg:px-7">
          <Link href="/" aria-label="Accueil Écoles237" className="shrink-0"><Logo size="header" priority /></Link>
          <form action="/recherche" className="relative hidden min-w-0 max-w-[470px] flex-1 md:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input name="q" aria-label="Rechercher une école" placeholder="Rechercher une école, une ville, une catégorie…" className="h-11 w-full rounded-xl bg-slate-50 pl-11 pr-4 text-sm outline-none ring-1 ring-slate-100 focus:ring-2 focus:ring-blue-500" />
          </form>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold text-slate-700 lg:flex" aria-label="Navigation Écoles237">
            <Link href="/">Accueil</Link><Link href="/recherche">Annuaire</Link><Link href="/recherche">Catégories</Link><Link href="/qui-sommes-nous">À propos</Link><Link href="/contact">Contact</Link>
          </nav>
          <Link href="/auth/connexion" aria-label="Mon compte" className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 lg:ml-0"><UserRound size={19} /></Link>
        </div>
      </header>
    );
  }

  return (
    <header className={`${sticky ? "sticky top-0" : ""} z-40 bg-white border-b border-border`}>
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 h-[72px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted ring-1 ring-black/5">
              <Image src={logoUrl} alt="" fill sizes="40px" className="object-cover" />
            </div>
          ) : (
            <div
              className="relative w-10 h-10 rounded-full shrink-0 text-white flex items-center justify-center font-black text-[15px] tracking-tight ring-1 ring-black/5"
              style={{ backgroundColor: "var(--school-primary, #0F2A4A)", fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {schoolMonogram(name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black text-[15px] text-text-primary truncate leading-tight tracking-tight">{name}</p>
            {motto && <p className="text-[11px] text-text-secondary/80 truncate leading-tight italic mt-0.5">{motto}</p>}
          </div>
        </div>

        <nav aria-label="Navigation de l'établissement" className="hidden lg:flex items-center gap-1 print:hidden">
          {MINISITE_VIEWS.map((view) => (
            <Link
              key={view.key}
              href={buildMiniSiteViewHref(baseHref, view.key)}
              aria-current={activeView === view.key ? "page" : undefined}
              className={`relative px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                activeView === view.key ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <span
                className="absolute left-4 right-4 -bottom-px h-[2px] rounded-full transition-opacity duration-base"
                style={{ backgroundColor: "var(--school-accent-gold, #C9A24B)", opacity: activeView === view.key ? 1 : 0 }}
                aria-hidden="true"
              />
              {view.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="hidden sm:inline-flex print:hidden items-center gap-1.5 h-9 px-4 rounded-card text-white text-sm font-bold hover:opacity-90 transition-opacity duration-base"
              style={{ backgroundColor: "var(--school-primary, #0F2A4A)" }}
            >
              <PhoneCall size={13} />
              Nous contacter
            </a>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            className="lg:hidden print:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              className="text-left px-2 py-2.5 rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-text-secondary"
              style={activeView === view.key ? { color: "var(--school-primary, #0F2A4A)" } : undefined}
            >
              {view.label}
            </Link>
          ))}
          {phone && (
            <a href={`tel:${phone}`} className="mt-1 mb-2 text-center text-white text-sm font-bold py-2.5 rounded-card" style={{ backgroundColor: "var(--school-primary, #0F2A4A)" }}>
              Nous contacter
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
