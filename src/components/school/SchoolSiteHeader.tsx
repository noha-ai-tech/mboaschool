"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X, PhoneCall } from "lucide-react";

// PUBLIC-SITE-01 §3 — school-specific header. Deliberately NOT the
// Écoles237 SiteHeader (§2 — the mini-site must feel like the school's own
// website, not the directory). Reused nowhere else; scoped to
// src/app/ecole/[id]/page.tsx only.
export type MiniSiteTabKey = "accueil" | "etablissement" | "admissions" | "vie" | "galerie";

export const MINISITE_TABS: { key: MiniSiteTabKey; label: string }[] = [
  { key: "accueil", label: "Accueil" },
  { key: "etablissement", label: "L'établissement" },
  { key: "admissions", label: "Formations & Admissions" },
  { key: "vie", label: "Vie & Résultats" },
  { key: "galerie", label: "Galerie & Infos" },
];

export function SchoolSiteHeader({
  logoUrl,
  name,
  motto,
  activeTab,
  onTabChange,
  phone,
}: {
  logoUrl: string | null;
  name: string;
  motto?: string | null;
  activeTab: MiniSiteTabKey;
  onTabChange: (tab: MiniSiteTabKey) => void;
  phone: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function selectTab(tab: MiniSiteTabKey) {
    onTabChange(tab);
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border">
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

        <nav className="hidden lg:flex items-center gap-1">
          {MINISITE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-base ${
                activeTab === tab.key
                  ? "bg-primary-light text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
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
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-primary"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="lg:hidden border-t border-border px-4 py-2 flex flex-col">
          {MINISITE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              className={`text-left px-2 py-2.5 rounded-lg text-sm font-semibold ${
                activeTab === tab.key ? "text-primary" : "text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
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
