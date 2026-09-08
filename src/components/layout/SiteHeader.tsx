"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { categories } from "@/lib/categories";
import { supabase } from "@/lib/supabase";

// Header public — même grammaire visuelle exacte que le header de la
// Landing (barre vert profond de marque pleine largeur, logo épingle-é,
// nav simplifiée à 3 entrées, menu déroulant catégories, Connexion/Inscrire
// mon école). Aligné sur src/app/page.tsx §HEADER — auparavant cette
// instance partagée était restée sur une ancienne palette hors-charte
// (fond noir, tokens Tailwind génériques "primary", libellé "Qui sommes-
// nous") pendant que la Landing avait déjà migré vers la marque ; les deux
// doivent rester identiques. Instance autonome (pas d'état partagé avec la
// Landing) pour ne jamais risquer de régresser le comportement de la page
// d'accueil elle-même : la recherche ici navigue vers /recherche plutôt que
// de filtrer en place.
export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  // Surbrillance de l'entrée de nav correspondant à la page courante — même
  // logique que l'"Accueil" toujours actif du header inline de la Landing
  // (src/app/page.tsx), généralisée ici puisque cette instance est partagée
  // par plusieurs pages. "Toutes les écoles" reste actif aussi bien sur
  // /recherche que sur n'importe quelle page catégorie, puisque les deux
  // pointent vers le même item de nav.
  const isHome = pathname === "/";
  const isDirectory = pathname === "/recherche" || pathname?.startsWith("/categorie/");
  const isAbout = pathname === "/qui-sommes-nous";
  const isContact = pathname === "/contact";
  // AMÉLIORATION 2 — navbar conditionnelle selon l'état de connexion Supabase
  // déjà en place ailleurs dans l'app (mêmes appels que
  // src/lib/school/SchoolContext.tsx : supabase.auth.getSession()/signOut()).
  // Aucune nouvelle logique d'auth : on lit juste la session existante et on
  // réagit à ses changements pour que la navbar ne nécessite pas un rechargement
  // complet de la page après connexion/déconnexion.
  const [authUserId, setAuthUserId] = useState<string | null>(null);
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
    supabase.auth.getSession().then(({ data }) => {
      setAuthUserId(data.session?.user.id ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

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
    <header className="fixed inset-x-0 top-0 z-50 bg-[#0B3B2E] border-b border-white/10">
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
            <Link
              href="/"
              aria-current={isHome ? "page" : undefined}
              className={`px-3 py-2 rounded-lg text-base transition-colors duration-base ${
                isHome ? "bg-white/10 text-white font-semibold" : "font-medium text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              Accueil
            </Link>
            <div ref={categoriesMenuRef} className="relative">
              <button
                onClick={() => setCategoriesMenuOpen((v) => !v)}
                aria-expanded={categoriesMenuOpen}
                aria-current={isDirectory ? "page" : undefined}
                className={`group relative flex items-center gap-1 px-3 py-2 rounded-lg text-base font-medium transition-colors duration-base ${
                  categoriesMenuOpen || isDirectory ? "bg-white/10 text-white font-semibold" : "text-white/80 hover:text-white"
                }`}
              >
                Toutes les écoles
                <ChevronDown size={15} className={`transition-transform duration-base ${categoriesMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {categoriesMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+10px)] w-64 bg-white rounded-[16px] border border-[#E7E0D7] shadow-[0_16px_48px_rgba(11,59,46,0.18)] p-2">
                  <Link
                    href="/recherche"
                    onClick={() => setCategoriesMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-[#132019] rounded-lg hover:bg-[#F4F3EF] transition-colors duration-base"
                  >
                    Toutes les écoles
                  </Link>
                  <div className="my-1 border-t border-[#E7E0D7]" />
                  {categories.map((cat) => (
                    <Link
                      key={cat.key}
                      href={`/categorie/${cat.key}`}
                      onClick={() => setCategoriesMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[#5A695F] rounded-lg hover:bg-[#F4F3EF] hover:text-[#132019] transition-colors duration-base"
                    >
                      {cat.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/qui-sommes-nous"
              aria-current={isAbout ? "page" : undefined}
              className={`relative px-3 py-2 rounded-lg text-base transition-colors duration-base ${
                isAbout ? "bg-white/10 text-white font-semibold" : "font-medium text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              À propos
            </Link>
            <Link
              href="/contact"
              aria-current={isContact ? "page" : undefined}
              className={`relative px-3 py-2 rounded-lg text-base transition-colors duration-base ${
                isContact ? "bg-white/10 text-white font-semibold" : "font-medium text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
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
                <div className="absolute right-0 top-[calc(100%+12px)] w-80 bg-white rounded-[18px] border border-[#E7E0D7] shadow-[0_16px_48px_rgba(11,59,46,0.18)] p-4">
                  <p className="text-xs font-semibold text-[#5A695F] uppercase tracking-wider mb-3">Recherche rapide</p>
                  <div className="flex items-center gap-2 bg-[#F4F3EF] border border-[#E7E0D7] rounded-[10px] px-3 h-11 focus-within:border-[#1F8A5D] transition-colors duration-base">
                    <Search size={16} className="text-[#5A695F] shrink-0" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                      placeholder="Nom, ville, niveau…"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-[#5A695F]"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label="Effacer" className="text-[#5A695F] hover:text-[#132019] shrink-0">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={submitSearch}
                    className="mt-3 w-full h-10 rounded-xl bg-[#F2AE1F] text-[#0B3B2E] text-sm font-bold hover:bg-[#D6941A] transition-colors duration-base"
                  >
                    Rechercher
                  </button>
                </div>
              )}
            </div>

            {authUserId ? (
              <>
                <Link href="/dashboard" className="px-2 text-sm font-semibold text-white/80 hover:text-white transition-colors duration-base">
                  Mon espace
                </Link>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center h-10 px-5 rounded-xl border border-white/25 text-white text-sm font-bold hover:bg-white/10 transition-colors duration-base"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/connexion" className="px-2 text-sm font-semibold text-white/80 hover:text-white transition-colors duration-base">
                  Connexion
                </Link>
                <Link
                  href="/auth/inscription"
                  className="inline-flex items-center h-10 px-5 rounded-xl bg-[#F2AE1F] text-[#0B3B2E] text-sm font-bold shadow-[0_4px_14px_-4px_rgba(242,174,31,0.55)] hover:bg-[#D6941A] hover:-translate-y-0.5 transition-all duration-base"
                >
                  Inscrire mon école
                </Link>
              </>
            )}
          </div>

          <button aria-label="Menu" className="lg:hidden ml-auto p-2 text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 rounded-[18px] border border-white/10 bg-[#0B3B2E] shadow-[0_16px_48px_rgba(0,0,0,0.25)] px-5 py-4 space-y-1">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              aria-current={isHome ? "page" : undefined}
              className={`block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10 ${isHome ? "bg-white/10" : ""}`}
            >
              Accueil
            </Link>
            <Link
              href="/recherche"
              onClick={() => setMobileMenuOpen(false)}
              aria-current={isDirectory ? "page" : undefined}
              className={`w-full text-left px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10 flex items-center justify-between ${isDirectory ? "bg-white/10" : ""}`}
            >
              Toutes les écoles
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.key}
                href={`/categorie/${cat.key}`}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-left px-3 py-2.5 pl-6 text-sm font-medium text-white/70 rounded-lg hover:bg-white/10 hover:text-white flex items-center justify-between"
              >
                {cat.label}
                <ChevronRight size={14} className="text-white/40" />
              </Link>
            ))}
            <div className="pt-1 border-t border-white/10 mt-1">
              <Link
                href="/qui-sommes-nous"
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isAbout ? "page" : undefined}
                className={`block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10 ${isAbout ? "bg-white/10" : ""}`}
              >
                À propos
              </Link>
              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isContact ? "page" : undefined}
                className={`block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10 ${isContact ? "bg-white/10" : ""}`}
              >
                Contact
              </Link>
            </div>
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2 mt-2">
              {authUserId ? (
                <>
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 text-sm font-semibold text-white">Mon espace</Link>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
                    className="border border-white/25 text-white px-4 py-2.5 rounded-xl text-sm font-bold text-center"
                  >
                    Déconnexion
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth/connexion" className="px-3 py-2.5 text-sm font-semibold text-white">Connexion</Link>
                  <Link href="/auth/inscription" className="bg-[#F2AE1F] text-[#0B3B2E] px-4 py-2.5 rounded-xl text-sm font-bold text-center">Inscrire mon école</Link>
                </>
              )}
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
