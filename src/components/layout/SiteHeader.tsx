"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Menu, X, ChevronRight } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { categories } from "@/lib/categories";

// Header public — même grammaire visuelle exacte que le Header de la
// Landing (pilule flottante translucide, logo réel, nav, recherche,
// Connexion/Inscrire mon école). Instance autonome (pas d'état partagé
// avec la Landing) pour ne jamais risquer de régresser le comportement de
// la page d'accueil elle-même : la recherche ici navigue vers l'accueil
// plutôt que de filtrer en place.
export function SiteHeader() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const headerSearchRef = useRef<HTMLDivElement | null>(null);

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

  function submitSearch() {
    router.push(query.trim() ? `/recherche?q=${encodeURIComponent(query.trim())}` : "/recherche");
    setHeaderSearchOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white border-b border-border">
      <div className="max-w-[1520px] mx-auto px-4 sm:px-6">
        <div
          className={`relative flex items-center gap-8 transition-all duration-300 ease-out ${
            headerScrolled ? "h-14" : "h-[72px]"
          }`}
        >
          <Link href="/" className="shrink-0 flex flex-col justify-center">
            <Logo size={headerScrolled ? "sm" : "header"} priority />
            {!headerScrolled && (
              <span className="hidden sm:block text-[10px] leading-tight text-text-secondary mt-1 whitespace-nowrap">
                L&apos;éducation du Cameroun en un clic
              </span>
            )}
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <Link href="/" className="group relative px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary transition-colors duration-base">
              Toutes les écoles
              <span className="absolute left-3 right-3 -bottom-0.5 h-[2px] bg-primary origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-base" />
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.key}
                href={`/categorie/${cat.key}`}
                className="group relative px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary transition-colors duration-base"
              >
                {cat.label}
                <span className="absolute left-3 right-3 -bottom-0.5 h-[2px] bg-primary origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-base" />
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2 ml-auto">
            <div ref={headerSearchRef} className="relative">
              <button
                aria-label="Rechercher"
                aria-expanded={headerSearchOpen}
                onClick={() => setHeaderSearchOpen((v) => !v)}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-base ${
                  headerSearchOpen ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-primary hover:bg-primary/5"
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

            <Link href="/auth/connexion" className="px-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base">
              Connexion
            </Link>
            <Link
              href="/auth/inscription"
              className="inline-flex items-center h-10 px-5 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-semibold shadow-elevation-1 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
            >
              Inscrire mon école
            </Link>
          </div>

          <button aria-label="Menu" className="lg:hidden ml-auto p-2 text-text-primary" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 rounded-[18px] border border-black/[0.06] bg-white/95 backdrop-blur-[20px] shadow-elevation-2 px-5 py-4 space-y-1">
            {categories.map((cat) => (
              <Link
                key={cat.key}
                href={`/categorie/${cat.key}`}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-muted flex items-center justify-between"
              >
                {cat.label}
                <ChevronRight size={14} className="text-text-secondary" />
              </Link>
            ))}
            <div className="pt-3 border-t border-border flex flex-col gap-2 mt-2">
              <Link href="/auth/connexion" className="px-3 py-2.5 text-sm font-semibold">Connexion</Link>
              <Link href="/auth/inscription" className="bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2.5 rounded-card text-sm font-semibold text-center">Inscrire mon école</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// Compensation de hauteur pour le header fixed (barre pleine largeur, 72px).
export function SiteHeaderSpacer() {
  return <div aria-hidden="true" className="h-[72px]" />;
}
