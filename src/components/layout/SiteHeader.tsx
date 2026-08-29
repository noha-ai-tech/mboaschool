"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { categories } from "@/lib/categories";

// Header public — même grammaire visuelle exacte que le Header de la
// Landing (barre noire pleine largeur, logo épingle + texte seul — plus de
// favicon carré redondant à côté, cf. src/app/page.tsx —, nav simplifiée à
// 3 entrées, menu déroulant catégories, Connexion/Inscrire mon
// école). Instance autonome (pas d'état partagé avec la Landing) pour ne
// jamais risquer de régresser le comportement de la page d'accueil
// elle-même : la recherche ici navigue vers /recherche plutôt que de
// filtrer en place.
export function SiteHeader() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const headerSearchRef = useRef<HTMLDivElement | null>(null);
  const categoriesMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!headerSearchOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerSearchRef.current && !headerSearchRef.current.contains(e.target as Node)) {
        setHeaderSearchOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHeaderSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [headerSearchOpen]);

  useEffect(() => {
    if (!categoriesMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (categoriesMenuRef.current && !categoriesMenuRef.current.contains(e.target as Node)) {
        setCategoriesMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCategoriesMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [categoriesMenuOpen]);

  function submitSearch() {
    router.push(query.trim() ? `/recherche?q=${encodeURIComponent(query.trim())}` : "/recherche");
    setHeaderSearchOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[#0A0A0A]">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6">
        <div
          className={`relative flex items-center gap-8 transition-all duration-300 ease-out ${
            headerScrolled ? "h-14" : "h-[76px]"
          }`}
        >
          <Link href="/" className="shrink-0 flex items-center gap-3">
            <Logo variant="dark" size={headerScrolled ? "md" : "xl"} priority />
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <div ref={categoriesMenuRef} className="relative">
              <button
                onClick={() => setCategoriesMenuOpen((v) => !v)}
                aria-expanded={categoriesMenuOpen}
                className="group relative flex items-center gap-1 px-3 py-2 text-base font-medium text-white/80 hover:text-white transition-colors duration-base"
              >
                Toutes les écoles
                <ChevronDown size={15} className={`transition-transform duration-base ${categoriesMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {categoriesMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+10px)] w-64 bg-white rounded-[16px] border border-border shadow-elevation-3 p-2">
                  <Link
                    href="/recherche"
                    onClick={() => setCategoriesMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-text-primary rounded-lg hover:bg-muted transition-colors duration-base"
                  >
                    Toutes les écoles
                  </Link>
                  <div className="my-1 border-t border-border" />
                  {categories.map((cat) => (
                    <Link
                      key={cat.key}
                      href={`/categorie/${cat.key}`}
                      onClick={() => setCategoriesMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-text-secondary rounded-lg hover:bg-muted hover:text-text-primary transition-colors duration-base"
                    >
                      {cat.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link href="/qui-sommes-nous" className="group relative px-3 py-2 text-base font-medium text-white/80 hover:text-white transition-colors duration-base">
              Qui sommes-nous
            </Link>
            <Link href="/contact" className="group relative px-3 py-2 text-base font-medium text-white/80 hover:text-white transition-colors duration-base">
              Contact
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-2 ml-auto">
            <div ref={headerSearchRef} className="relative">
              <button
                aria-label="Rechercher"
                aria-expanded={headerSearchOpen}
                onClick={() => setHeaderSearchOpen((v) => !v)}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-base ${
                  headerSearchOpen ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <Search size={18} />
              </button>

              {headerSearchOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] w-80 bg-white rounded-[18px] border border-border shadow-elevation-3 p-4">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Recherche rapide</p>
                  <div className="flex items-center gap-2 bg-muted border border-border rounded-[10px] px-3 h-11 focus-within:border-primary transition-colors duration-base">
                    <Search size={16} className="text-text-secondary shrink-0" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                      placeholder="Nom, ville, niveau…"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-text-secondary"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label="Effacer" className="text-text-secondary hover:text-text-primary shrink-0">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={submitSearch}
                    className="mt-3 w-full h-10 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-semibold hover:shadow-elevation-1 transition-all duration-base"
                  >
                    Rechercher
                  </button>
                </div>
              )}
            </div>

            <Link href="/auth/connexion" className="px-2 text-sm font-semibold text-white/80 hover:text-white transition-colors duration-base">
              Connexion
            </Link>
            <Link
              href="/auth/inscription"
              className="inline-flex items-center h-10 px-5 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-semibold shadow-elevation-1 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
            >
              Inscrire mon école
            </Link>
          </div>

          <button aria-label="Menu" className="lg:hidden ml-auto p-2 text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 rounded-[18px] border border-white/10 bg-[#111]/98 backdrop-blur-[20px] shadow-elevation-2 px-5 py-4 space-y-1">
            <Link href="/recherche" onClick={() => setMobileMenuOpen(false)} className="w-full text-left px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/5 flex items-center justify-between">
              Toutes les écoles
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.key}
                href={`/categorie/${cat.key}`}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-left px-3 py-2.5 pl-6 text-sm font-medium text-white/70 rounded-lg hover:bg-white/5 hover:text-white flex items-center justify-between"
              >
                {cat.label}
                <ChevronRight size={14} className="text-white/40" />
              </Link>
            ))}
            <div className="pt-1 border-t border-white/10 mt-1">
              <Link href="/qui-sommes-nous" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/5">Qui sommes-nous</Link>
              <Link href="/contact" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/5">Contact</Link>
            </div>
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2 mt-2">
              <Link href="/auth/connexion" className="px-3 py-2.5 text-sm font-semibold text-white">Connexion</Link>
              <Link href="/auth/inscription" className="bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2.5 rounded-card text-sm font-semibold text-center">Inscrire mon école</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// Compensation de hauteur pour le header fixed (barre pleine largeur, 76px).
export function SiteHeaderSpacer() {
  return <div aria-hidden="true" className="h-[76px]" />;
}
