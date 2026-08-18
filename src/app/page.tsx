"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  MapPin,
  Building2,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Map as MapIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/branding/Logo";
import { HeroSearch } from "@/components/hero/HeroSearch";
import { HeroPhotoCard, type HeroPhoto } from "@/components/hero/HeroPhotoCard";
import { AnnouncementTicker, type TickerItem } from "@/components/hero/AnnouncementTicker";
import { CategoryCard } from "@/components/categories/CategoryCard";
import { FeaturedSchoolsCarousel } from "@/components/schools/FeaturedSchoolsCarousel";
import { PromotionCard } from "@/components/promotion/PromotionCard";
import { PartnerAdCard, type PartnerAd } from "@/components/promotion/PartnerAdCard";
import { StatCard as LandingStatCard } from "@/components/landing/StatCard";
import { PartnerPlaceholder } from "@/components/landing/PartnerPlaceholder";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getCameroonRegion } from "@/lib/cameroonRegions";
import { categories } from "@/lib/categories";
import { normalizeForSearch, dedupeInsensitive } from "@/lib/textSearch";

// Photos réelles fournies pour le panneau Hero (déposées dans public/hero/).
const HERO_PHOTOS: HeroPhoto[] = [
  { id: "hero-1", url: "/hero/ecole%20vu%20de%20haut.png" },
  { id: "hero-2", url: "/hero/cours%20ecole.png" },
  { id: "hero-3", url: "/hero/lab.png" },
];

// ─── Data & Types ────────────────────────────────────────────────────────────

type School = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  city: string;
  quartier: string;
  phone: string;
  fees: number;
  registration: number;
  verified: boolean;
  isClaimed: boolean;
  onlinePayment: boolean;
  isFeatured: boolean;
  image: string | null;
  couleurPrimaire: string | null;
  couleurSecondaire: string | null;
  emojiLogo: string | null;
  infrastructure: string[];
  lat: number | null;
  lng: number | null;
};

const INFRA_LABELS: Record<string, string> = {
  library: "Bibliothèque",
  laboratory: "Laboratoire",
  computer_room: "Salle informatique",
  sports_field: "Terrain de sport",
  canteen: "Cantine",
  transport: "Transport",
  wifi: "Wi-Fi",
  boarding: "Internat",
  security: "Sécurité",
  infirmary: "Infirmerie",
};

function transformSchool(raw: any): School {
  const infra = raw.infrastructures?.[0] ?? {};
  const fee = raw.fees?.[0] ?? {};
  const infrastructure = Object.entries(infra as Record<string, unknown>)
    .filter(([key, val]) => val === true && key in INFRA_LABELS)
    .map(([key]) => INFRA_LABELS[key]);

  const firstSchoolImage: string | null = raw.school_images?.[0]?.url ?? null;
  const image: string | null = firstSchoolImage ?? raw.cover_image_url ?? null;

  return {
    id: raw.id,
    name: raw.name,
    category: raw.main_category ?? "",
    subcategory: raw.sub_category ?? "",
    city: raw.city ?? "",
    quartier: raw.quartier ?? raw.neighborhood ?? "",
    phone: raw.phone ?? "",
    fees: fee.tuition_fee ?? 0,
    registration: fee.registration_fee ?? 0,
    verified: raw.is_verified ?? false,
    isClaimed: raw.is_claimed ?? true,
    onlinePayment: raw.accepts_online_payment ?? false,
    isFeatured: raw.is_featured ?? false,
    image,
    couleurPrimaire: raw.couleur_primaire ?? null,
    couleurSecondaire: raw.couleur_secondaire ?? null,
    emojiLogo: raw.emoji_logo ?? null,
    infrastructure,
    lat: raw.latitude ?? null,
    lng: raw.longitude ?? null,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SecondaryCtaBanner({ photo }: { photo: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = photo && !imgFailed;

  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-primary to-primary-dark">
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo as string}
          alt=""
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/95 to-primary-dark/95" />
      <div className="relative max-w-[1500px] mx-auto px-[18px] py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <p className="text-white font-bold text-lg">Votre établissement mérite plus de visibilité.</p>
          <p className="text-white/75 text-sm mt-0.5">Rejoignez Écoles237 et développez votre communauté.</p>
        </div>
        <Link
          href="/auth/inscription"
          className="shrink-0 inline-flex items-center gap-2 bg-[#FCD116] text-[#0A0A0A] px-5 py-2.5 rounded-card text-sm font-bold hover:bg-[#FCD116]/90 transition-colors duration-base"
        >
          Commencer maintenant
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState("5");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement | null>(null);
  const categoriesMenuRef = useRef<HTMLDivElement | null>(null);

  // Header flottant Premium V2 — réduction de hauteur douce au scroll.
  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fermeture du panneau de recherche du header au clic extérieur / Échap.
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

  // Fermeture du menu déroulant "Toutes les écoles" au clic extérieur / Échap.
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("establishments")
        .select(`
          id, name, main_category, sub_category,
          city, quartier, neighborhood, phone,
          cover_image_url, is_verified, is_claimed,
          accepts_online_payment, is_featured,
          couleur_primaire, couleur_secondaire, emoji_logo,
          latitude, longitude,
          fees(registration_fee, tuition_fee),
          infrastructures(library, laboratory, computer_room, sports_field, canteen, transport, wifi, boarding, security, infirmary),
          school_images(url)
        `)
        .order("is_featured", { ascending: false });
      if (data) setSchools(data.map(transformSchool));
      setLoading(false);
    }
    load();
  }, []);

  function handleLocationToggle() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas disponible sur cet appareil. Vous pouvez rechercher par ville.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError("Position indisponible. Vous pouvez rechercher par ville ou consulter la carte manuellement.");
      }
    );
  }

  // La recherche du Hero ne filtre plus en place — elle navigue vers /recherche
  // (Sprint Landing V5) avec les filtres actuels encodés en query params, page
  // qui héberge désormais la liste/carte/comparaison réelle.
  function goToRecherche(overrides?: { q?: string }) {
    const params = new URLSearchParams();
    const q = overrides?.q ?? query;
    if (q.trim()) params.set("q", q.trim());
    if (activeCategory !== "all") params.set("categorie", activeCategory);
    if (city !== "all") params.set("ville", city);
    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
      params.set("rayon", radius);
    }
    const qs = params.toString();
    router.push(qs ? `/recherche?${qs}` : "/recherche");
  }

  // Dédoublonnage insensible à la casse/accents — "Douala", "douala",
  // "DOUALA" comptent comme une seule ville dans le filtre.
  const cities = useMemo(
    () => ["all", ...dedupeInsensitive(schools.map((s) => s.city))],
    [schools]
  );

  // Données réelles pour Catégories / À la une / Statistiques — aucune valeur inventée.
  const featuredSchools = useMemo(() => schools.filter((s) => s.isFeatured), [schools]);
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of categories) map[cat.key] = schools.filter((s) => s.category === cat.key).length;
    return map;
  }, [schools]);
  const statCities = Math.max(cities.length - 1, 0);
  const statVerified = schools.filter((s) => s.verified).length;
  // Régions réellement couvertes — dérivé des vraies villes en base via une
  // table de correspondance géographique factuelle (src/lib/cameroonRegions),
  // jamais un chiffre cible. "Préinscriptions envoyées" n'est pas affichable
  // ici : la table `applications` n'a pas de policy RLS de lecture pour le
  // rôle anonyme, et créer cette policy sortirait du périmètre Supabase de
  // ce sprint — remplacé par une 4e statistique honnête.
  const statRegions = useMemo(
    () => new Set(schools.map((s) => getCameroonRegion(s.city)).filter((r): r is string => r !== null)).size,
    [schools]
  );
  // Aucune donnée annonceur réelle n'existe encore — le panneau reste masqué.
  const partnerAds: PartnerAd[] = [];

  // Photos du panneau Hero — fournies par Eddy (public/hero/), affichées
  // sans nom/badge/CTA puisque ce panneau illustre la plateforme dans son
  // ensemble, pas un établissement précis. Pas de repli Supabase : ce sont
  // les photos explicitement choisies pour cet emplacement.
  const heroPhotos: HeroPhoto[] = HERO_PHOTOS;

  // Bande d'annonces — chaque entrée est un vrai lien vers une fonctionnalité
  // ou une page existante, jamais un message inventé.
  const tickerItems = useMemo<TickerItem[]>(() => {
    const items: TickerItem[] = [];
    if (!loading && schools.length > 0) {
      items.push({
        id: "count",
        label: `${schools.length} établissement${schools.length !== 1 ? "s" : ""} déjà référencé${schools.length !== 1 ? "s" : ""}`,
        href: "/recherche",
      });
    }
    items.push({ id: "preinscription", label: "Préinscription en ligne", href: "/preinscription" });
    items.push({ id: "inscription", label: "Inscrire mon établissement", href: "/auth/inscription" });
    if (featuredSchools[0]) {
      items.push({
        id: "featured",
        label: `École à la une : ${featuredSchools[0].name}`,
        href: featuredSchools[0].isClaimed ? `/ecole/${featuredSchools[0].id}` : `/auth/inscription?ecole=${featuredSchools[0].id}`,
      });
    }
    return items;
  }, [loading, schools.length, featuredSchools]);

  return (
    <div className="min-h-screen bg-[#4B5563] text-[#0a0a0a]">

      {/* ── HEADER ─────────────────────────────────────────────────────
          Barre pleine largeur, collée en haut, fond noir — icône (favicon)
          + logo, nav simplifiée à 3 entrées (Toutes les écoles avec menu
          déroulant des catégories réelles, Qui sommes-nous, Contact).
          Rétrécit doucement au scroll. */}
      <header className="fixed inset-x-0 top-0 z-50 bg-[#0A0A0A]">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6">
          <div
            className={`relative flex items-center gap-8 transition-all duration-300 ease-out ${
              headerScrolled ? "h-14" : "h-[76px]"
            }`}
          >
            <Link href="/" className="shrink-0 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/favicon.png"
                alt=""
                className="rounded-xl shrink-0"
                style={headerScrolled ? { height: 48, width: 48 } : { height: 64, width: 64 }}
              />
              <Logo variant="dark" size={headerScrolled ? "md" : "xl"} priority />
            </Link>

            {/* Navigation — hover : texte vert + barre animée 200ms */}
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
              <Link
                href="/qui-sommes-nous"
                className="group relative px-3 py-2 text-base font-medium text-white/80 hover:text-white transition-colors duration-base"
              >
                Qui sommes-nous
              </Link>
              <Link
                href="/contact"
                className="group relative px-3 py-2 text-base font-medium text-white/80 hover:text-white transition-colors duration-base"
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

                {/* Panneau de recherche moderne */}
                {headerSearchOpen && (
                  <div className="absolute right-0 top-[calc(100%+12px)] w-80 bg-white rounded-[18px] border border-border shadow-elevation-3 p-4">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Recherche rapide</p>
                    <div className="flex items-center gap-2 bg-muted border border-border rounded-[10px] px-3 h-11 focus-within:border-primary transition-colors duration-base">
                      <Search size={16} className="text-text-secondary shrink-0" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setHeaderSearchOpen(false);
                            goToRecherche();
                          }
                        }}
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
                      onClick={() => {
                        setHeaderSearchOpen(false);
                        goToRecherche();
                      }}
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

          {/* Mobile menu */}
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

      {/* Compensation de hauteur pour le header fixed (72px, hauteur non réduite). */}
      <div aria-hidden="true" className="h-[76px]" />

      {/* ── CONTENEUR CENTRAL BLANC (partie 1) ─────────────────────────
          Landing V5 : header et bandeau d'annonce restent seuls en pleine
          largeur (fond gris #F4F3EF visible dans les marges) ; le hero vit
          dans un conteneur centré à fond blanc, largeur cohérente avec le
          reste du repo (1520px). Coupé en deux morceaux pour laisser le
          bandeau d'annonce pleine largeur entre le hero et les catégories,
          sans changer sa position actuelle dans le flux. */}
      <div className="max-w-[1500px] mx-auto bg-[#FDF5F5]">
        {/* ── HERO PREMIUM V8 ──────────────────────────────────────────
            Deux cartes vertes indépendantes (pas de panneau vert commun) :
            bloc recherche (plus étroit) + bloc photo (plus large), posées
            directement sur le fond #FDF5F5 du conteneur — l'espace entre
            les deux cartes doit rester blanc/pâle, jamais vert. Logo
            uniquement dans le header du site — pas de doublon ici. */}
        <section className="relative pt-3 pb-4 text-text-primary">
          <div className="relative px-[18px]">
            <div className="relative flex flex-col lg:flex-row items-stretch gap-4 lg:gap-5 min-h-[520px]">
              {/* Bloc recherche (vert, plus étroit) */}
              <div className="relative rounded-[22px] shadow-elevation-2 overflow-hidden bg-gradient-to-br from-[#0d5c30] to-[#07301a] p-7 lg:p-8 flex flex-col justify-center gap-6 lg:w-[38%] shrink-0">
                <div>
                  <h1 className="text-[26px] lg:text-[32px] font-bold leading-[1.15] text-white">
                    Trouvez l&apos;école idéale pour votre enfant, en toute{" "}
                    <span className="text-[#f5c518]">confiance.</span>
                  </h1>
                  <p className="text-[15px] text-[#bacfc2] mt-3">
                    Plus de {schools.length.toLocaleString("fr-FR")} établissement{schools.length !== 1 ? "s" : ""} référencé
                    {schools.length !== 1 ? "s" : ""} dans tout le Cameroun.
                  </p>
                </div>

                <HeroSearch
                  query={query}
                  onQueryChange={setQuery}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  categories={categories}
                  city={city}
                  onCityChange={setCity}
                  cities={cities}
                  radius={radius}
                  onRadiusChange={setRadius}
                  onLocate={handleLocationToggle}
                  locating={locating}
                  onSearch={() => goToRecherche()}
                  tone="dark"
                />
                {locationError && (
                  <p className="text-xs text-white/60 -mt-2">{locationError}</p>
                )}
              </div>

              {/* Bloc photo (vert, plus large) */}
              <div className="relative flex-1 min-w-0 min-h-[260px] lg:min-h-0 rounded-[22px] shadow-elevation-2 overflow-hidden">
                <HeroPhotoCard photos={heroPhotos} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <AnnouncementTicker items={tickerItems} />

      {/* ── CONTENEUR CENTRAL BLANC (partie 2) ────────────────────────── */}
      <div className="max-w-[1500px] mx-auto bg-[#FDF5F5]">
        {/* ── EXPLORER PAR CATÉGORIE ────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="px-[18px] py-12 lg:py-14">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Explorer par catégorie</h2>
              <Link
                href="/categorie/garderie"
                className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
              >
                Voir toutes les catégories
                <ArrowRight size={14} />
              </Link>
            </div>
            <span className="block w-8 h-[3px] rounded-full bg-[#FCD116] mb-6" aria-hidden="true" />

            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.key}
                  href={`/categorie/${cat.key}`}
                  label={cat.label}
                  description={cat.description}
                  count={categoryCounts[cat.key] ?? 0}
                  loading={loading}
                  icon={cat.icon}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── ÉTABLISSEMENTS À LA UNE ───────────────────────────────── */}
        {/* Basé strictement sur establishments.is_featured (donnée réelle) —
            section entièrement masquée s'il n'y a aucun établissement
            réellement mis en avant, jamais de carte factice. */}
        {!loading && featuredSchools.length > 0 && (
          <section className="border-t border-border">
            <div className="px-[18px] py-12 lg:py-14 grid lg:grid-cols-[1fr_300px] gap-8 items-start">
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold">Établissements à la une</h2>
                  <Link
                    href="/recherche"
                    className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
                  >
                    Voir tout
                    <ArrowRight size={14} />
                  </Link>
                </div>
                <span className="block w-8 h-[3px] rounded-full bg-[#FCD116] mb-5" aria-hidden="true" />

                <FeaturedSchoolsCarousel schools={featuredSchools} />
              </div>

              <aside className="space-y-4">
                <PromotionCard
                  eyebrow="Pour les établissements"
                  title="Boostez la visibilité de votre école"
                  description="Atteignez plus de parents et d'élèves partout au Cameroun."
                  ctaLabel="Inscrire mon établissement"
                  ctaHref="/auth/inscription"
                />
                <PartnerAdCard ads={partnerAds} />
              </aside>
            </div>
          </section>
        )}

        {/* ── BANNIÈRE CTA SECONDAIRE ───────────────────────────────── */}
        {/* Reprend le CTA déjà réel "Inscrire mon établissement" / /auth/inscription,
            sous une forme bannière pleine largeur (du conteneur) plutôt qu'une
            carte latérale. Photo de fond réelle (établissement à la une) si
            disponible — repli sur le dégradé seul sinon, jamais un vide. */}
        <SecondaryCtaBanner photo={featuredSchools[0]?.image ?? null} />

        {/* ── STATISTIQUES ──────────────────────────────────────────── */}
        {/* Chiffres réels et dynamiques uniquement. "Préinscriptions envoyées"
            n'est pas exposable ici : la table `applications` n'a pas de policy
            RLS de lecture pour le rôle anonyme, et en créer une sortirait du
            périmètre Supabase de ce sprint — remplacé par "Régions couvertes",
            dérivé des vraies villes en base via une géographie réelle. */}
        <section className="relative border-t border-border overflow-hidden">
          {/* Forme discrète, jamais une carte cartographique précise —
              simple accent décoratif à faible opacité. */}
          <div
            aria-hidden="true"
            className="absolute -left-24 top-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-[35%_65%_60%_40%/45%_35%_65%_55%] bg-primary-light opacity-60 pointer-events-none"
          />

          <div className="relative px-[18px] py-16 lg:py-20 grid lg:grid-cols-[260px_1fr_260px] gap-10 items-start">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary leading-snug">
                L&apos;éducation camerounaise devient <span className="text-primary">plus accessible.</span>
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <LandingStatCard
                icon={Building2}
                value={loading ? "—" : schools.length.toLocaleString("fr-FR")}
                label="Établissements référencés"
                description="Dans tout le Cameroun."
              />
              <LandingStatCard
                icon={MapIcon}
                value={loading ? "—" : statRegions.toLocaleString("fr-FR")}
                label="Régions couvertes"
                description="Sur 10 régions au total."
              />
              <LandingStatCard
                icon={CheckCircle2}
                value={loading ? "—" : statVerified.toLocaleString("fr-FR")}
                label="Établissements vérifiés"
                description="Contrôlés par notre équipe."
              />
              <LandingStatCard
                icon={MapPin}
                value={loading ? "—" : statCities.toLocaleString("fr-FR")}
                label="Villes couvertes"
                description="Et de nouvelles chaque semaine."
              />
            </div>

            <div>
              <h3 className="font-bold text-text-primary mb-4">Pourquoi choisir Écoles237 ?</h3>
              <ul className="space-y-3">
                {[
                  "Annuaire centralisé et à jour",
                  "Établissements vérifiés par notre équipe",
                  "Outils modernes pour les établissements",
                  "Préinscription en ligne, sans déplacement",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-text-primary">
                    <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── PARTENAIRES ───────────────────────────────────────────── */}
        {/* Aucun partenariat réel n'existe aujourd'hui — emplacements par
            catégorie générique uniquement, jamais une marque nommée sans
            accord. Toujours étiquetés "Bientôt disponible" pour ne jamais
            laisser croire à un partenariat actif. */}
        <section className="border-t border-border">
          <div className="px-[18px] py-16 lg:py-20">
            <div className="max-w-md mb-10">
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-text-primary">Partenaires</h2>
              <p className="text-sm text-text-secondary mt-3">
                Écoles237 s&apos;ouvre progressivement à des partenaires qui simplifient la vie des familles et des établissements.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <PartnerPlaceholder label="Banques" description="Financement des frais de scolarité" />
              <PartnerPlaceholder label="Télécoms" description="Paiement et notifications SMS" />
              <PartnerPlaceholder label="Librairies" description="Fournitures et manuels scolaires" />
              <PartnerPlaceholder label="Universités" description="Passerelles vers l'enseignement supérieur" />
              <PartnerPlaceholder label="ONG" description="Bourses et accès à l'éducation" />
              <PartnerPlaceholder label="Assurances" description="Couverture scolaire et santé" />
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
