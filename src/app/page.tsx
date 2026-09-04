"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
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
  Check,
  ShieldCheck,
  Wrench,
  LayoutGrid,
  CalendarCheck,
} from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { HeroSearch } from "@/components/hero/HeroSearch";
import { HeroPhotoCard, type HeroPhoto } from "@/components/hero/HeroPhotoCard";
import { HERO_PHOTOS } from "@/lib/heroPhotos";
import { AnnouncementTicker, type TickerItem } from "@/components/hero/AnnouncementTicker";
import { CategoryCard } from "@/components/categories/CategoryCard";
import { FeaturedSchoolsCarousel } from "@/components/schools/FeaturedSchoolsCarousel";
import { StatCard as LandingStatCard } from "@/components/landing/StatCard";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { REGION_FILTER_OPTIONS } from "@/lib/cameroonRegions";
import { citiesForRegionFilter } from "@/lib/cameroonMajorCities";
import { categories } from "@/lib/categories";

// Typographie de marque (skill ecoles237-design-system) — chargée ici, scopée
// à la page d'accueil via les variables CSS ci-dessous, sans toucher au
// Manrope global du reste du site (src/app/layout.tsx). Fraunces pour les
// titres éditoriaux, Plus Jakarta Sans pour le corps de texte/l'UI.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

// Photo réelle pour la section "Pour les parents" — jamais une illustration
// (voir references/anti-ai-tells.md du skill de design : un pictogramme
// dessiné à la place d'une vraie photo est le signe le plus repérable d'un
// écran généré). Réutilise une des photos réelles déjà fournies plutôt que
// d'en inventer une nouvelle.
const PARENT_PHOTO = HERO_PHOTOS[1];

// Raisons "Pourquoi choisir Écoles237" — contenu factuel et vérifiable,
// jamais une promesse abstraite (voir anti-ai-tells.md §Copywriting).
const WHY_REASONS = [
  {
    icon: LayoutGrid,
    title: "Annuaire centralisé",
    description: "Toute l'offre scolaire du pays au même endroit, mise à jour en continu.",
  },
  {
    icon: ShieldCheck,
    title: "Établissements vérifiés",
    description: "Chaque fiche est contrôlée manuellement par notre équipe.",
  },
  {
    icon: Wrench,
    title: "Outils pour les écoles",
    description: "Des outils modernes pour gérer et faire rayonner leur établissement.",
  },
  {
    icon: CalendarCheck,
    title: "Préinscription en ligne",
    description: "Simplifiez la démarche pour les familles, sans aucun déplacement.",
  },
];

// Points de la section "Pour les parents" — reflètent des fonctionnalités
// réelles (badge vérifié, filtres de /recherche, préinscription en ligne),
// jamais une numérotation "01/02/03" factice : ces trois points sont des
// bénéfices parallèles, pas une séquence à suivre dans l'ordre.
const PARENT_POINTS = [
  {
    title: "Une base fiable, pas une liste au hasard",
    description: "Chaque établissement affiché est contrôlé par notre équipe avant publication.",
  },
  {
    title: "Filtrez selon vos vrais critères",
    description: "Niveau, ville, statut public ou privé — trouvez en quelques secondes sur /recherche.",
  },
  {
    title: "Pré-inscrivez-vous sans vous déplacer",
    description: "Contactez ou pré-inscrivez votre enfant directement depuis la fiche de l'école.",
  },
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

function SectionEyebrow({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider mb-3 ${
        dark ? "text-[#F2AE1F]" : "text-[#12543F]"
      }`}
    >
      <span
        aria-hidden="true"
        className="w-7 h-[3px] rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F]"
      />
      {label}
    </p>
  );
}

function SecondaryCtaBanner({ photo }: { photo: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = photo && !imgFailed;

  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-[#0B3B2E] to-[#12543F]">
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo as string}
          alt=""
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B3B2E] via-[#0B3B2E]/95 to-[#12543F]/95" />
      <div className="relative max-w-[1500px] mx-auto px-[18px] py-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <span
            aria-hidden="true"
            className="hidden sm:block w-9 h-1 rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F] mb-3"
          />
          <p className="font-[family-name:var(--font-fraunces)] text-white font-semibold text-xl leading-snug">
            Votre établissement mérite plus de visibilité.
          </p>
          <p className="text-white/70 text-sm mt-1.5">Rejoignez Écoles237 et développez votre communauté.</p>
        </div>
        <Link
          href="/auth/inscription"
          className="shrink-0 inline-flex items-center gap-2 bg-[#F2AE1F] text-[#0B3B2E] px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#D6941A] transition-colors duration-base"
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
  const [region, setRegion] = useState("all");
  const [city, setCity] = useState("all");
  const [stats, setStats] = useState({ establishments: 0, regions: 0, cities: 0, categories: 0 });
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
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
      try {
        const response = await fetch("/api/homepage", { cache: "no-store" });
        if (!response.ok) throw new Error("Homepage data unavailable");
        const data = await response.json();
        setSchools((data.featured ?? []).map(transformSchool));
        setStats(data.stats);
        setCategoryCounts(data.categoryCounts ?? {});
      } catch (error) {
        console.error("[homepage] Unable to load homepage data:", error);
      } finally {
        setLoading(false);
      }
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
    if (region !== "all") params.set("region", region);
    if (city !== "all") params.set("ville", city);
    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
      params.set("rayon", radius);
    }
    const qs = params.toString();
    router.push(qs ? `/recherche?${qs}` : "/recherche");
  }

  const heroSearchCities = useMemo(
    () => ["all", ...citiesForRegionFilter(region).map((item) => item.name)],
    [region]
  );

  // Données réelles pour Catégories / À la une / Statistiques — aucune valeur inventée.
  const featuredSchools = schools;
  // Photos du panneau Hero — fournies par Eddy (public/hero/), affichées
  // sans nom/badge/CTA puisque ce panneau illustre la plateforme dans son
  // ensemble, pas un établissement précis. Pas de repli Supabase : ce sont
  // les photos explicitement choisies pour cet emplacement.
  const heroPhotos: HeroPhoto[] = HERO_PHOTOS;

  // Bande d'annonces — chaque entrée est un vrai lien vers une fonctionnalité
  // ou une page existante, jamais un message inventé.
  const tickerItems = useMemo<TickerItem[]>(() => {
    const items: TickerItem[] = [];
    if (featuredSchools[0]) {
      items.push({
        id: "featured",
        label: `École à la une : ${featuredSchools[0].name}`,
        href: featuredSchools[0].isClaimed ? `/ecole/${featuredSchools[0].id}` : `/auth/inscription?ecole=${featuredSchools[0].id}`,
      });
    }
    if (!loading && stats.establishments > 0) {
      items.push({
        id: "count",
        label: `${stats.establishments.toLocaleString("fr-FR")} établissement${stats.establishments !== 1 ? "s" : ""} référencé${stats.establishments !== 1 ? "s" : ""}`,
        href: "/recherche",
      });
    }
    items.push({ id: "preinscription", label: "Préinscription en ligne", href: "/preinscription" });
    items.push({ id: "inscription", label: "Inscrire mon établissement", href: "/auth/inscription" });
    return items;
  }, [loading, stats.establishments, featuredSchools]);

  return (
    <div
      className={`${fraunces.variable} ${jakarta.variable} min-h-screen bg-[#FBF6F2] text-[#132019] font-[family-name:var(--font-jakarta)]`}
    >

      {/* ── HEADER ─────────────────────────────────────────────────────
          Barre pleine largeur, collée en haut, vert profond de marque —
          logo (épingle + texte) seul (plus de favicon carré redondant à
          côté), nav simplifiée à 3 entrées (Toutes les écoles avec menu
          déroulant des catégories réelles, Qui sommes-nous, Contact).
          Rétrécit doucement au scroll. */}
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

            {/* Navigation — hover : texte blanc + fond translucide léger.
                "Accueil" est marqué actif : cette nav n'est rendue que sur la
                page d'accueil elle-même. */}
            <nav className="hidden lg:flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-2 rounded-lg text-base font-semibold bg-white/10 text-white"
              >
                Accueil
              </Link>
              <div ref={categoriesMenuRef} className="relative">
                <button
                  onClick={() => setCategoriesMenuOpen((v) => !v)}
                  aria-expanded={categoriesMenuOpen}
                  className={`group relative flex items-center gap-1 px-3 py-2 rounded-lg text-base font-medium transition-colors duration-base ${
                    categoriesMenuOpen ? "bg-white/10 text-white font-semibold" : "text-white/80 hover:text-white"
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
                className="group relative px-3 py-2 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-base"
              >
                À propos
              </Link>
              <Link
                href="/contact"
                className="group relative px-3 py-2 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-base"
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

                {/* Panneau de recherche rapide */}
                {headerSearchOpen && (
                  <div className="absolute right-0 top-[calc(100%+12px)] w-80 bg-white rounded-[18px] border border-[#E7E0D7] shadow-[0_16px_48px_rgba(11,59,46,0.18)] p-4">
                    <p className="text-xs font-semibold text-[#5A695F] uppercase tracking-wider mb-3">Recherche rapide</p>
                    <div className="flex items-center gap-2 bg-[#F4F3EF] border border-[#E7E0D7] rounded-[10px] px-3 h-11 focus-within:border-[#1F8A5D] transition-colors duration-base">
                      <Search size={16} className="text-[#5A695F] shrink-0" />
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
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-[#5A695F]"
                      />
                      {query && (
                        <button onClick={() => setQuery("")} aria-label="Effacer" className="text-[#5A695F] hover:text-[#132019] shrink-0">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setHeaderSearchOpen(false);
                        goToRecherche();
                      }}
                      className="mt-3 w-full h-10 rounded-xl bg-[#F2AE1F] text-[#0B3B2E] text-sm font-bold hover:bg-[#D6941A] transition-colors duration-base"
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
                className="inline-flex items-center h-10 px-5 rounded-xl bg-[#F2AE1F] text-[#0B3B2E] text-sm font-bold shadow-[0_4px_14px_-4px_rgba(242,174,31,0.55)] hover:bg-[#D6941A] hover:-translate-y-0.5 transition-all duration-base"
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
            <div className="lg:hidden mt-2 rounded-[18px] border border-white/10 bg-[#0B3B2E] shadow-[0_16px_48px_rgba(0,0,0,0.25)] px-5 py-4 space-y-1">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white bg-white/10 rounded-lg">
                Accueil
              </Link>
              <Link href="/recherche" onClick={() => setMobileMenuOpen(false)} className="w-full text-left px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10 flex items-center justify-between">
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
                <Link href="/qui-sommes-nous" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10">À propos</Link>
                <Link href="/contact" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white rounded-lg hover:bg-white/10">Contact</Link>
              </div>
              <div className="pt-3 border-t border-white/10 flex flex-col gap-2 mt-2">
                <Link href="/auth/connexion" className="px-3 py-2.5 text-sm font-semibold text-white">Connexion</Link>
                <Link href="/auth/inscription" className="bg-[#F2AE1F] text-[#0B3B2E] px-4 py-2.5 rounded-xl text-sm font-bold text-center">Inscrire mon école</Link>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Compensation de hauteur pour le header fixed (76px, hauteur non réduite). */}
      <div aria-hidden="true" className="h-[76px]" />

      {/* Bandeau d'annonces — juste sous la barre de navigation, au-dessus du
          hero (même ordre que la maquette). */}
      <AnnouncementTicker items={tickerItems} />

      {/* ── HERO PLEIN CADRE ─────────────────────────────────────────────
          Photos réelles de la plateforme en fond, dégradé vert de lisibilité
          côté texte, carte de recherche flottante au fond flouté (verre
          dépoli) posée par-dessus — reprend la maquette de référence tout en
          gardant exactement les mêmes champs/état/logique de recherche
          qu'avant (aucun champ région/département n'existe dans la vraie
          recherche : catégorie + ville + rayon + géolocalisation). */}
      <section className="relative">
        <div className="max-w-[1500px] mx-auto px-[18px] pt-4 pb-3">
          <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_-24px_rgba(11,59,46,0.45)] min-h-[560px] lg:min-h-[620px]">
            <div className="absolute inset-0">
              <HeroPhotoCard photos={heroPhotos} variant="background" />
            </div>

            <div className="relative z-[5] flex items-center min-h-[560px] lg:min-h-[620px] px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
              <div className="w-full max-w-[520px]">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white mb-6">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#F2AE1F]" />
                  {loading
                    ? "Annuaire scolaire du Cameroun"
                    : `${stats.establishments.toLocaleString("fr-FR")} établissement${stats.establishments !== 1 ? "s" : ""} référencé${stats.establishments !== 1 ? "s" : ""} dans tout le Cameroun`}
                </span>

                <h1 className="font-[family-name:var(--font-fraunces)] text-[32px] sm:text-[40px] lg:text-[46px] leading-[1.1] font-semibold text-white tracking-[-0.01em]">
                  Trouvez l&apos;école idéale pour votre enfant, <em className="text-[#F2AE1F]">en toute confiance.</em>
                </h1>
                <p className="text-[15px] sm:text-base text-white/80 mt-4 max-w-[430px] leading-relaxed">
                  De la garderie à l&apos;université, ainsi que les formations professionnelles et techniques — rassemblés et vérifiés au même endroit.
                </p>

                <div className="relative rounded-[20px] overflow-hidden mt-7 max-w-[440px] shadow-[0_20px_44px_-16px_rgba(0,0,0,0.5)]">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center blur-[18px] scale-110 brightness-75"
                    style={heroPhotos[0] ? { backgroundImage: `url(${heroPhotos[0].url})` } : undefined}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[linear-gradient(155deg,rgba(11,59,46,0.86)_0%,rgba(6,37,27,0.92)_100%)]"
                  />
                  <div className="relative p-5">
                    <p className="flex items-center gap-2 text-[13px] font-bold text-white mb-4">
                      <Search size={14} className="text-[#F2AE1F]" />
                      Rechercher un établissement
                    </p>
                    <HeroSearch
                      query={query}
                      onQueryChange={setQuery}
                      activeCategory={activeCategory}
                      onCategoryChange={setActiveCategory}
                      categories={categories}
                      region={region}
                      onRegionChange={(value) => { setRegion(value); setCity("all"); }}
                      regions={REGION_FILTER_OPTIONS}
                      city={city}
                      onCityChange={setCity}
                      cities={heroSearchCities}
                      radius={radius}
                      onRadiusChange={setRadius}
                      onLocate={handleLocationToggle}
                      locating={locating}
                      onSearch={() => goToRecherche()}
                      tone="dark"
                    />
                    {locationError && <p className="text-xs text-white/60 mt-2.5">{locationError}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-6 sm:gap-9 flex-wrap mt-7">
                  <div>
                    <p className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-white leading-none tabular-nums">
                      {loading ? "—" : stats.establishments.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mt-1">Établissements</p>
                  </div>
                  <span aria-hidden="true" className="hidden sm:block w-px h-9 bg-white/20" />
                  <div>
                    <p className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-white leading-none tabular-nums">
                      {loading ? "—" : stats.regions.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mt-1">Régions couvertes</p>
                  </div>
                  <span aria-hidden="true" className="hidden sm:block w-px h-9 bg-white/20" />
                  <div>
                    <p className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-white leading-none tabular-nums">
                      {loading ? "—" : stats.cities.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mt-1">Villes couvertes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTENEUR CENTRAL ─────────────────────────────────────────── */}
      <div className="max-w-[1500px] mx-auto bg-[#FBF6F2]">
        {/* ── EXPLORER PAR CATÉGORIE ────────────────────────────────── */}
        <section className="border-t border-[#E7E0D7]">
          <div className="px-[18px] py-12 lg:py-14">
            <div className="flex items-center justify-between gap-4 mb-1">
              <div>
                <SectionEyebrow label="Explorer" />
                <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-[#132019]">
                  Explorer par catégorie
                </h2>
              </div>
              <Link
                href="/recherche"
                className="shrink-0 flex items-center gap-1 text-sm font-semibold text-[#12543F] hover:text-[#0B3B2E] transition-colors duration-base"
              >
                Toutes les catégories
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mt-6">
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
          <section className="border-t border-[#E7E0D7]">
            <div className="px-[18px] py-12 lg:py-14">
              <div className="flex items-center justify-between gap-4 mb-1">
                <div>
                  <SectionEyebrow label="Sélection" />
                  <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-[#132019]">
                    Établissements à la une
                  </h2>
                  <p className="text-sm text-[#5A695F] mt-2 max-w-md">
                    Une sélection d&apos;établissements mise en avant par notre équipe, actualisée régulièrement.
                  </p>
                </div>
                <Link
                  href="/recherche"
                  className="shrink-0 flex items-center gap-1 text-sm font-semibold text-[#12543F] hover:text-[#0B3B2E] transition-colors duration-base"
                >
                  Voir tout
                  <ArrowRight size={14} />
                </Link>
              </div>

              <div className="mt-6">
                <FeaturedSchoolsCarousel schools={featuredSchools} />
              </div>
            </div>
          </section>
        )}

        {/* ── BANNIÈRE CTA SECONDAIRE ───────────────────────────────── */}
        {/* Reprend le CTA déjà réel "Inscrire mon établissement" / /auth/inscription,
            sous une forme bannière pleine largeur (du conteneur) plutôt qu'une
            carte latérale. Photo de fond réelle (établissement à la une) si
            disponible — repli sur le dégradé seul sinon, jamais un vide. */}
        <SecondaryCtaBanner photo={featuredSchools[0]?.image ?? null} />

        {/* ── POUR LES PARENTS ─────────────────────────────────────────
            Photo réelle (jamais une illustration — voir anti-ai-tells.md) +
            trois bénéfices parallèles réels (pas de numérotation 01/02/03,
            ces points ne sont pas une séquence à suivre dans l'ordre). */}
        <section className="border-t border-[#E7E0D7]">
          <div className="px-[18px] py-16 lg:py-20 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
            <div className="relative rounded-[20px] overflow-hidden h-[300px] lg:h-[380px] shadow-[0_20px_44px_-20px_rgba(11,59,46,0.35)]">
              <Image
                src={PARENT_PHOTO.url}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
              <div className="absolute left-4 bottom-4 flex items-center gap-2 bg-white rounded-xl px-3.5 py-2.5 shadow-[0_14px_26px_-14px_rgba(0,0,0,0.3)]">
                <CheckCircle2 size={16} className="text-[#1F8A5D] shrink-0" />
                <span className="text-[12.5px] font-bold text-[#132019]">Établissements vérifiés par notre équipe</span>
              </div>
            </div>

            <div>
              <SectionEyebrow label="Pour les parents" />
              <h2 className="font-[family-name:var(--font-fraunces)] text-2xl lg:text-[28px] font-semibold text-[#132019] max-w-[440px]">
                Pourquoi les parents choisissent Écoles237
              </h2>

              <div className="flex flex-col gap-5 my-7">
                {PARENT_POINTS.map((point) => (
                  <div key={point.title} className="flex gap-3.5">
                    <span
                      className="shrink-0 w-8 h-8 rounded-[9px] bg-[#E9F5EE] text-[#0B3B2E] flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Check size={15} strokeWidth={2.5} />
                    </span>
                    <div>
                      <h4 className="text-[15px] font-bold text-[#132019] mb-0.5">{point.title}</h4>
                      <p className="text-[13.5px] text-[#5A695F] leading-relaxed">{point.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/recherche"
                className="inline-flex items-center gap-2 bg-[#0B3B2E] text-white px-6 py-3.5 rounded-xl text-sm font-bold hover:bg-[#12543F] hover:-translate-y-0.5 transition-all duration-base"
              >
                Parcourir toutes les écoles
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── STATISTIQUES + POURQUOI CHOISIR ÉCOLES237 ────────────────
            Chiffres réels et dynamiques uniquement. "Préinscriptions envoyées"
            n'est pas exposable ici : la table `applications` n'a pas de policy
            RLS de lecture pour le rôle anonyme, et en créer une sortirait du
            périmètre Supabase de ce sprint — remplacé par "Régions couvertes",
            dérivé des vraies villes en base via une géographie réelle.
            Fond vert foncé de marque (identique à la maquette) — c'est la
            seule section "corps de page" à porter cette couleur, jamais du
            blanc/crème pour une section qui est verte dans la référence. */}
        <section className="relative bg-[#0B3B2E] overflow-hidden">
          {/* Halo décoratif à faible opacité, jamais une carte cartographique précise. */}
          <div
            aria-hidden="true"
            className="absolute -left-24 -top-40 w-[420px] h-[420px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(31,138,93,0.45), transparent 70%)" }}
          />

          <div className="relative px-[18px] py-16 lg:py-20">
            <div className="max-w-xl mb-10">
              <SectionEyebrow label="Notre engagement" dark />
              <h2 className="font-[family-name:var(--font-fraunces)] text-2xl lg:text-[28px] font-semibold text-white leading-snug">
                L&apos;éducation camerounaise devient <em className="italic text-[#F2AE1F]">plus accessible.</em>
              </h2>
              <p className="text-[15px] text-white/65 leading-relaxed mt-3.5">
                Écoles237 centralise, vérifie et met à jour l&apos;information scolaire dans tout le pays — pour que
                chaque famille et chaque établissement y gagne en clarté.
              </p>
            </div>

            <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 rounded-[20px] overflow-hidden">
              <LandingStatCard
                variant="cell-dark"
                icon={Building2}
                value={loading ? "—" : stats.establishments.toLocaleString("fr-FR")}
                label="Établissements référencés"
                description="Dans tout le Cameroun."
              />
              <LandingStatCard
                variant="cell-dark"
                icon={MapIcon}
                value={loading ? "—" : stats.regions.toLocaleString("fr-FR")}
                label="Régions couvertes"
                description="Sur 10 régions au total."
              />
              <LandingStatCard
                variant="cell-dark"
                icon={LayoutGrid}
                value={loading ? "—" : stats.categories.toLocaleString("fr-FR")}
                label="Catégories représentées"
                description="Issues des établissements du registre."
              />
              <LandingStatCard
                variant="cell-dark"
                icon={MapPin}
                value={loading ? "—" : stats.cities.toLocaleString("fr-FR")}
                label="Villes couvertes"
                description="Et de nouvelles chaque semaine."
              />
            </div>

            <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {WHY_REASONS.map((reason) => (
                <div key={reason.title} className="bg-white/[0.06] border border-white/10 rounded-[16px] p-5">
                  <reason.icon size={19} className="text-[#F2AE1F] mb-3" aria-hidden="true" />
                  <h4 className="text-[14.5px] font-bold text-white mb-1">{reason.title}</h4>
                  <p className="text-[12.5px] text-white/60 leading-relaxed">{reason.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PARTENAIRES ───────────────────────────────────────────── */}
      </div>

      <SiteFooter />
    </div>
  );
}
