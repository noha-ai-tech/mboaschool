"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  MapPin,
  Phone,
  School,
  GraduationCap,
  Baby,
  Building2,
  Wrench,
  CheckCircle2,
  ArrowRight,
  Scale,
  Navigation,
  Heart,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/branding/Logo";

const LocalSchoolMap = dynamic(() => import("@/components/LocalSchoolMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <span className="text-sm text-slate-400 font-medium">Chargement de la carte…</span>
    </div>
  ),
});

const DEFAULT_CENTER = { lat: 4.0511, lng: 9.7679 }; // Douala

// Contenu restauré tel quel depuis la version antérieure au Design Freeze
// (commit 024b326, src/app/page.tsx) — voir docs/03_DESIGN_SYSTEM pour le
// détail. Slide 3 (Pro) reprend le texte déjà réellement utilisé et validé
// sur dashboard/ecole/page.tsx ("Écoles237 Pro" / "Emplois du temps,
// pointage des enseignants et messagerie interne"), jamais inventé.
const HERO_SLIDES = [
  {
    theme: "ivoire" as const,
    eyebrow: "Pour les familles",
    title: "Trouvez l'école idéale près de chez vous.",
    text: "Comparez les établissements, consultez les frais et les infrastructures, et postulez en ligne en quelques minutes.",
  },
  {
    theme: "green" as const,
    eyebrow: "Pour votre école",
    title: "Votre page visible dans tout le Cameroun.",
    text: null,
    cta: { label: "Inscrire mon établissement", href: "/auth/inscription" },
  },
  {
    theme: "indigo" as const,
    eyebrow: "Écoles237 Pro",
    title: "Emplois du temps, présences et salaires, réunis.",
    text: "Emplois du temps, pointage des enseignants et messagerie interne.",
  },
];

const SLIDE_THEME_CLASSES: Record<string, string> = {
  ivoire: "bg-[linear-gradient(135deg,#F3EEE2_0%,#E7EFE4_55%,#CFE3D6_100%)] text-[#0A0A0A]",
  green: "bg-[linear-gradient(135deg,#083D2A_0%,#0A5C3C_55%,#0F9D68_100%)] text-white",
  indigo: "bg-[linear-gradient(135deg,#241B3D_0%,#3B2E63_55%,#0A5C3C_100%)] text-white",
};

// ─── Data & Types ────────────────────────────────────────────────────────────

const categories = [
  {
    key: "garderie",
    label: "Garderie",
    icon: Baby,
    subcategories: ["Crèche", "Prématernelle", "Maternelle"],
  },
  {
    key: "primaire",
    label: "Primaire",
    icon: School,
    subcategories: ["Public", "Privé", "Confessionnel", "Bilingue"],
  },
  {
    key: "secondaire",
    label: "Secondaire",
    icon: Building2,
    subcategories: ["Lycée public", "Collège privé", "Technique", "Bilingue"],
  },
  {
    key: "superieur",
    label: "Supérieur",
    icon: GraduationCap,
    subcategories: ["Université", "Grande école", "Institut supérieur"],
  },
  {
    key: "autres",
    label: "Formations",
    icon: Wrench,
    subcategories: ["Santé", "Auto-école", "Couture", "Coiffure", "Hôtellerie", "Informatique", "Langues"],
  },
];

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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Money({ value }: { value: number }) {
  return <>{value.toLocaleString("fr-FR")} FCFA</>;
}

function SchoolCard({
  school,
  userLocation,
  compare,
  toggleCompare,
}: {
  school: School;
  userLocation: { lat: number; lng: number } | null;
  compare: string[];
  toggleCompare: (id: string) => void;
}) {
  const dist = userLocation && school.lat && school.lng
    ? haversineKm(userLocation.lat, userLocation.lng, school.lat, school.lng)
    : null;
  const inCompare = compare.includes(school.id);

  return (
    <div className="group bg-white rounded-xl overflow-hidden border border-[#ebebeb] hover:border-[#ccc] hover:-translate-y-0.5 transition-all duration-200">
      {/* Image / Fallback */}
      <div className="relative h-48 overflow-hidden bg-slate-100">
        {school.image ? (
          <img
            src={school.image}
            alt={school.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : school.couleurPrimaire && school.couleurSecondaire ? (
          <div
            className="w-full h-full group-hover:scale-105 transition-transform duration-500"
            style={{ background: `linear-gradient(135deg, ${school.couleurPrimaire}, ${school.couleurSecondaire})` }}
          />
        ) : (
          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
            <span className="text-5xl">{school.emojiLogo ?? "🏫"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {/* Emoji badge top-left (quand pas sponsorisé) */}
        {school.emojiLogo && !school.isFeatured && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-base leading-none px-2 py-1 rounded-xl">
            {school.emojiLogo}
          </span>
        )}

        {school.isFeatured && (
          <span className="absolute top-3 left-3 bg-yellow-400 text-[#0a0a0a] text-[11px] font-black px-2.5 py-1 rounded-full tracking-wide">
            SPONSORISÉ
          </span>
        )}

        <div className="absolute top-3 right-3 flex gap-1.5">
          <button
            onClick={(e) => { e.preventDefault(); toggleCompare(school.id); }}
            className={`backdrop-blur-sm rounded-full p-1.5 transition-colors ${inCompare ? "bg-emerald-600 text-white" : "bg-white/90 text-slate-600 hover:text-emerald-600"}`}
          >
            <Scale size={13} />
          </button>
          <button className="bg-white/90 backdrop-blur-sm rounded-full p-1.5 text-slate-600 hover:text-red-500 transition-colors">
            <Heart size={13} />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full capitalize">
            {school.category}{school.subcategory ? ` · ${school.subcategory}` : ""}
          </span>
          {school.verified && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={9} /> Vérifiée
            </span>
          )}
          {!school.isClaimed && (
            <span className="text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">
              Non revendiquée
            </span>
          )}
        </div>

        <h3 className="font-bold text-[15px] leading-snug text-[#0a0a0a] mb-1.5 line-clamp-2">
          {school.name}
        </h3>

        <p className="flex items-center gap-1 text-xs text-slate-500 mb-1">
          <MapPin size={11} />
          {school.quartier ? `${school.quartier}, ` : ""}{school.city}
          {dist !== null && (
            <span className="ml-1 text-emerald-600 font-semibold">· {dist.toFixed(1)} km</span>
          )}
        </p>

        {school.phone ? (
          <a
            href={`tel:${school.phone}`}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700 transition-colors mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone size={11} />
            {school.phone}
          </a>
        ) : (
          <div className="mb-3" />
        )}

        {school.fees > 0 && (
          <p className="text-xs text-slate-500 mb-3">
            À partir de <span className="font-bold text-[#0a0a0a]"><Money value={school.fees} /></span>/an
          </p>
        )}

        {school.infrastructure.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {school.infrastructure.slice(0, 3).map((item) => (
              <span key={item} className="text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                {item}
              </span>
            ))}
            {school.infrastructure.length > 3 && (
              <span className="text-[10px] font-semibold text-slate-400 px-1 py-0.5">
                +{school.infrastructure.length - 3}
              </span>
            )}
          </div>
        )}

        {school.isClaimed ? (
          <Link
            href={`/ecole/${school.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-600 transition-colors group/link"
          >
            Voir la fiche
            <ArrowRight size={14} className="group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        ) : (
          <Link
            href={`/auth/inscription?ecole=${school.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors group/link"
          >
            Revendiquer cette page
            <ArrowRight size={14} className="group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [useLocation, setUseLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius] = useState("5");
  const [compare, setCompare] = useState<string[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  // Carrousel Hero : intervalle 6s, pause au survol/interaction et quand
  // l'onglet est masqué. Respecte prefers-reduced-motion (pas de rotation
  // automatique dans ce mode — voir docs/03_DESIGN_SYSTEM/06_MOTION.md).
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || heroPaused) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        setHeroSlide((i) => (i + 1) % HERO_SLIDES.length);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [heroPaused]);

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
    if (!navigator.geolocation) { alert("Géolocalisation non supportée."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setUseLocation(true);
        setLocating(false);
        setMapModalOpen(true);
      },
      () => { setLocating(false); alert("Position indisponible."); }
    );
  }

  function toggleCompare(id: string) {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [prev[1], prev[2], id].filter(Boolean);
      return [...prev, id];
    });
  }

  const cities = useMemo(
    () => ["all", ...Array.from(new Set(schools.map((s) => s.city)))],
    [schools]
  );

  const mapCenter = userLocation ?? DEFAULT_CENTER;

  const nearbySchools = useMemo(() => {
    const withCoords = schools.filter(
      (s): s is School & { lat: number; lng: number } =>
        s.lat != null && s.lng != null && (activeCategory === "all" || s.category === activeCategory)
    );
    if (!userLocation) return withCoords.slice(0, 30);
    return withCoords
      .filter((s) => haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng) <= Number(radius))
      .slice(0, 30);
  }, [schools, userLocation, radius, activeCategory]);

  const filtered = schools.filter((s) => {
    if (activeCategory !== "all" && s.category !== activeCategory) return false;
    if (activeSubcategory !== "all" && s.subcategory.toLowerCase() !== activeSubcategory.toLowerCase()) return false;
    if (city !== "all" && s.city !== city) return false;
    if (useLocation && userLocation) {
      if (!s.lat || !s.lng) return false;
      if (haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng) > Number(radius)) return false;
    }
    if (query) {
      const t = `${s.name} ${s.city} ${s.quartier} ${s.category} ${s.subcategory}`.toLowerCase();
      if (!t.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const compareSchools = schools.filter((s) => compare.includes(s.id)).slice(0, 3);

  const groupedByCategory = useMemo(() => {
    if (activeCategory !== "all") return null;
    return categories
      .map((cat) => ({ cat, items: filtered.filter((s) => s.category === cat.key).slice(0, 3) }))
      .filter((group) => group.items.length > 0);
  }, [filtered, activeCategory]);

  return (
    <div className="min-h-screen bg-[#f9f7f2] text-[#0a0a0a]">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white border-b border-border">
        <div className="max-w-screen-xl mx-auto px-5 h-20 flex items-center gap-8">
          <Link href="/" className="shrink-0 flex items-center">
            <Logo size="md" priority />
          </Link>

          {/* Desktop nav — liens directs, pas de sous-menu au survol (inutilisable au tactile) */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => { setActiveCategory("all"); setActiveSubcategory("all"); }}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-fast ${activeCategory === "all" ? "text-primary" : "text-text-secondary hover:text-text-primary"}`}
            >
              Toutes les écoles
            </button>
            {categories.map((cat) => (
              <Link
                key={cat.key}
                href={`/categorie/${cat.key}`}
                className="px-3 py-2 text-sm font-medium rounded-lg text-text-secondary hover:text-text-primary transition-colors duration-fast"
              >
                {cat.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4 ml-auto">
            <Link href="/auth/connexion" className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors duration-fast">
              Connexion
            </Link>
            <Link href="/auth/inscription" className="inline-flex items-center h-10 px-4 rounded-[10px] bg-[#0A0A0A] text-white text-sm font-semibold hover:bg-[#0A0A0A]/90 transition-colors duration-fast">
              Inscrire mon école
            </Link>
          </div>

          <button aria-label="Menu" className="lg:hidden ml-auto p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-white px-5 py-4 space-y-1">
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
              <Link href="/auth/inscription" className="bg-[#0A0A0A] text-white px-4 py-2.5 rounded-[10px] text-sm font-semibold text-center">Inscrire mon école</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── ANNOUNCEMENT RIBBON ────────────────────────────────────── */}
      {/* Restaurée (Correctif Landing) — contenu identique à la version
          d'origine (établissements référencés, inscription gratuite,
          préinscription en ligne, villes), retraitement visuel uniquement :
          ruban éditorial compact plutôt que bannière noire clignotante. */}
      <div className="bg-muted border-b border-border py-2 overflow-hidden whitespace-nowrap">
        <div className="flex w-max animate-marquee-soft motion-reduce:animate-none">
          {[0, 1].map((i) => (
            <span key={i} className="flex items-center gap-6 pr-6 text-[13px] font-medium text-text-secondary shrink-0" aria-hidden={i === 1}>
              {!loading && schools.length > 0 && (
                <>
                  <span className="text-text-primary font-semibold">{schools.length} établissement{schools.length !== 1 ? "s" : ""} déjà référencé{schools.length !== 1 ? "s" : ""}</span>
                  <span className="text-border">·</span>
                </>
              )}
              <span>Inscription gratuite pour votre école</span>
              <span className="text-border">·</span>
              <span>Préinscription en ligne en quelques minutes</span>
              <span className="text-border">·</span>
              <span>Douala · Yaoundé</span>
              <span className="text-border">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="relative pt-10 pb-16 lg:pb-20 bg-background text-text-primary overflow-hidden">
        <div className="relative max-w-screen-xl mx-auto px-5">
          <div className="flex items-center gap-2 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#CE1126]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#FCD116]" />
            <span className="ml-2 text-sm font-semibold tracking-[0.15em] uppercase text-text-secondary">
              Plateforme éducative · Cameroun
            </span>
          </div>

          <div className="grid lg:grid-cols-[0.85fr_1.5fr] items-stretch gap-8">

            {/* Search card */}
            <div className="flex flex-col justify-center">
              <div className="bg-surface border border-border rounded-card p-6 shadow-elevation-1 flex flex-col gap-3.5">
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Recherche rapide</p>
                  <h1 className="text-xl font-bold leading-snug">Trouvez l&apos;école idéale près de chez vous.</h1>
                </div>

                <div className="flex items-center gap-2 bg-muted border border-border rounded-[10px] px-4 h-12 focus-within:border-primary transition-colors duration-fast">
                  <Search size={16} className="text-text-secondary shrink-0" />
                  <input
                    className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-text-secondary"
                    placeholder="Nom, ville, niveau…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button onClick={() => setQuery("")} className="text-text-secondary hover:text-text-primary" aria-label="Effacer">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={activeCategory}
                    onChange={(e) => { setActiveCategory(e.target.value); setActiveSubcategory("all"); }}
                    className="flex-1 min-w-0 border border-border rounded-[10px] px-3 h-10 text-[13px] font-medium bg-surface focus:outline-none focus:border-primary transition-colors duration-fast"
                  >
                    <option value="all">Toutes catégories</option>
                    {categories.map((cat) => (
                      <option key={cat.key} value={cat.key}>{cat.label}</option>
                    ))}
                  </select>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="flex-1 min-w-0 border border-border rounded-[10px] px-3 h-10 text-[13px] font-medium bg-surface focus:outline-none focus:border-primary transition-colors duration-fast"
                  >
                    {cities.map((c) => (
                      <option key={c} value={c}>{c === "all" ? "Toutes les villes" : c}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleLocationToggle}
                    disabled={locating}
                    aria-label="Me localiser"
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-[10px] border border-border text-text-secondary hover:text-text-primary hover:bg-muted transition-colors duration-fast disabled:opacity-50"
                  >
                    <Navigation size={15} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => document.getElementById("resultats")?.scrollIntoView({ behavior: "smooth" })}
                  className="bg-[#0A0A0A] text-white rounded-[10px] h-12 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#0A0A0A]/90 transition-colors duration-fast"
                >
                  Rechercher
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Hero carousel — panneaux éditoriaux thématiques */}
            <div
              className="relative w-full min-h-[380px] lg:min-h-0 rounded-card overflow-hidden"
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => setHeroPaused(false)}
              onFocus={() => setHeroPaused(true)}
              onBlur={() => setHeroPaused(false)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setHeroSlide((i) => (i + 1) % HERO_SLIDES.length);
                if (e.key === "ArrowLeft") setHeroSlide((i) => (i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
              }}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const delta = e.changedTouches[0].clientX - touchStartX.current;
                if (delta < -40) setHeroSlide((i) => (i + 1) % HERO_SLIDES.length);
                if (delta > 40) setHeroSlide((i) => (i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
                touchStartX.current = null;
              }}
            >
              {HERO_SLIDES.map((slide, i) => (
                <div
                  key={slide.title}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} sur ${HERO_SLIDES.length}`}
                  aria-hidden={i !== heroSlide}
                  className={`absolute inset-0 flex flex-col justify-end p-8 lg:p-10 transition-all duration-500 ease-out ${SLIDE_THEME_CLASSES[slide.theme]} ${
                    i === heroSlide ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
                  }`}
                >
                  {/* Micro-motif géométrique camerounais — texture discrète, jamais illustrative */}
                  <svg className="absolute inset-0 w-full h-full opacity-[0.06]" preserveAspectRatio="none" aria-hidden="true">
                    <pattern id={`motif-${i}`} width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="56" height="56" fill="none" />
                      <path d="M28 0 L56 28 L28 56 L0 28 Z" fill="currentColor" />
                    </pattern>
                    <rect width="100%" height="100%" fill={`url(#motif-${i})`} />
                  </svg>

                  <div className="relative z-10 max-w-md">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${slide.theme === "ivoire" ? "text-primary" : "text-white/70"}`}>
                      {slide.eyebrow}
                    </p>
                    <h2 className="text-2xl lg:text-[28px] font-bold leading-tight mb-2">{slide.title}</h2>
                    {slide.text && (
                      <p className={`text-sm leading-relaxed ${slide.theme === "ivoire" ? "text-text-secondary" : "text-white/80"}`}>
                        {slide.text}
                      </p>
                    )}
                    {"cta" in slide && slide.cta && (
                      <Link
                        href={slide.cta.href}
                        className={`mt-4 inline-flex items-center gap-2 text-sm font-semibold ${slide.theme === "ivoire" ? "text-primary" : "text-white"} hover:opacity-80 transition-opacity duration-fast`}
                      >
                        {slide.cta.label}
                        <ArrowRight size={15} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              {/* Contrôles */}
              <button
                onClick={() => setHeroSlide((i) => (i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
                aria-label="Diapositive précédente"
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors duration-fast backdrop-blur-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setHeroSlide((i) => (i + 1) % HERO_SLIDES.length)}
                aria-label="Diapositive suivante"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors duration-fast backdrop-blur-sm"
              >
                <ChevronRight size={16} />
              </button>

              <div className="absolute top-5 right-5 flex gap-1.5 z-20">
                {HERO_SLIDES.map((slide, i) => (
                  <button
                    key={slide.title}
                    onClick={() => setHeroSlide(i)}
                    className={`h-1.5 rounded-full transition-all duration-fast ${i === heroSlide ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
                    aria-label={`Aller à la diapositive ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAP MODAL (recherche géolocalisée façon Airbnb) ─────────── */}
      {mapModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ebebeb] shrink-0">
              <div>
                <p className="font-black text-[#0a0a0a]">
                  {nearbySchools.length} établissement{nearbySchools.length !== 1 ? "s" : ""}
                  {activeCategory !== "all" ? ` · ${categories.find((c) => c.key === activeCategory)?.label}` : ""}
                </p>
                <p className="text-xs text-slate-400">
                  Dans un rayon de {radius} km autour de votre position
                </p>
              </div>
              <button
                onClick={() => setMapModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-[#0a0a0a] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <LocalSchoolMap
                center={mapCenter}
                userLocation={userLocation}
                radiusKm={Number(radius)}
                schools={nearbySchools}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      <main id="resultats" className="max-w-screen-xl mx-auto px-5 pt-8 pb-12">

        {/* Filters row */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          {city !== "all" && (
            <span className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold border border-emerald-200">
              {city}
              <button onClick={() => setCity("all")}><X size={13} /></button>
            </span>
          )}

          {useLocation && (
            <span className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold border border-emerald-200">
              À moins de {radius} km
              <button onClick={() => { setUseLocation(false); setUserLocation(null); }}><X size={13} /></button>
            </span>
          )}

          <span className="ml-auto text-sm text-slate-400 font-medium">
            {loading ? "Chargement…" : <><span className="text-[#0a0a0a] font-bold">{filtered.length}</span> résultat{filtered.length !== 1 ? "s" : ""}</>}
          </span>
        </div>


        {/* Grid */}
        <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
          <div>
            {/* Skeletons */}
            {loading && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl overflow-hidden border border-[#ebebeb] animate-pulse">
                    <div className="h-48 bg-slate-100" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-slate-100 rounded w-1/3" />
                      <div className="h-5 bg-slate-100 rounded w-3/4" />
                      <div className="h-4 bg-slate-100 rounded w-1/2" />
                      <div className="h-9 bg-slate-100 rounded-lg mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Grouped by category */}
            {!loading && groupedByCategory && (
              <div className="space-y-10">
                {groupedByCategory.map(({ cat, items }) => (
                  <div key={cat.key} className="border border-black rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-[20px] font-bold tracking-tight text-[#0a0a0a]">{cat.label}</h2>
                      <Link
                        href={`/categorie/${cat.key}`}
                        className="flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
                      >
                        Voir tout
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {items.map((school) => (
                        <SchoolCard key={school.id} school={school} userLocation={userLocation} compare={compare} toggleCompare={toggleCompare} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Flat grid (single category selected) */}
            {!loading && !groupedByCategory && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((school) => (
                  <SchoolCard key={school.id} school={school} userLocation={userLocation} compare={compare} toggleCompare={toggleCompare} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-4xl mb-4">🏫</p>
                <h3 className="text-xl font-bold mb-2">Aucun résultat</h3>
                <p className="text-slate-500 text-sm">Modifiez vos filtres ou élargissez votre recherche.</p>
              </div>
            )}
          </div>

          {/* Sidebar compare */}
          <aside className="hidden lg:block sticky top-[80px]">
            <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#ebebeb]">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">Comparaison</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${compareSchools.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                    {compareSchools.length}/3
                  </span>
                </div>
              </div>

              <div className="p-4">
                {compareSchools.length === 0 ? (
                  <div className="text-center py-6">
                    <Scale size={28} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Cliquez sur <Scale size={11} className="inline" /> sur une carte pour comparer jusqu'à 3 écoles.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {compareSchools.map((school) => (
                      <div key={school.id} className="border border-[#ebebeb] rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-semibold text-sm leading-snug">{school.name}</p>
                          <button onClick={() => toggleCompare(school.id)} className="text-slate-300 hover:text-slate-500 shrink-0 mt-0.5">
                            <X size={13} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{school.city}{school.subcategory ? ` · ${school.subcategory}` : ""}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-slate-400 mb-0.5">Inscription</p>
                            <p className="font-bold text-[11px]">
                              {school.registration > 0 ? <Money value={school.registration} /> : "—"}
                            </p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-slate-400 mb-0.5">Scolarité</p>
                            <p className="font-bold text-[11px]">
                              {school.fees > 0 ? <Money value={school.fees} /> : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {compareSchools.length >= 2 && (
                      <button className="w-full bg-[#0a0a0a] text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-slate-800 transition-colors">
                        Comparer côte à côte
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CTA card */}
            <div className="mt-4 bg-[#0a0f0d] text-white rounded-2xl p-5">
              <p className="text-xs font-semibold tracking-wider uppercase text-slate-400 mb-3">
                Vous gérez une école ?
              </p>
              <p className="font-bold text-base leading-snug mb-4">
                Inscrivez votre établissement et recevez des demandes de parents.
              </p>
              <Link
                href="/auth/inscription"
                className="flex items-center justify-center gap-2 bg-yellow-400 text-[#0a0a0a] px-4 py-2.5 rounded-xl text-sm font-black hover:bg-yellow-300 transition-colors"
              >
                Commencer gratuitement
                <ArrowRight size={15} />
              </Link>
            </div>
          </aside>
        </div>
      </main>

      {/* ── CTA SECTION ────────────────────────────────────────────── */}
      <section className="bg-[#0a0f0d] text-white">
        <div className="max-w-screen-xl mx-auto px-5 py-24 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-emerald-400 mb-4">
              Pour les établissements
            </p>
            <h2 className="text-4xl lg:text-5xl font-black leading-tight tracking-tight mb-6">
              Votre école visible<br />dans tout le Cameroun.
            </h2>
            <p className="text-slate-400 text-base leading-relaxed mb-8 max-w-md">
              Créez votre page, publiez vos tarifs, votre galerie et recevez des demandes de préinscription directement depuis la plateforme.
            </p>
            <Link
              href="/auth/inscription"
              className="inline-flex items-center gap-2 bg-yellow-400 text-[#0a0a0a] px-6 py-3.5 rounded-xl font-black text-sm hover:bg-yellow-300 transition-colors"
            >
              Inscrire mon établissement
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "Page dédiée", desc: "Photos, tarifs, documents, annonces" },
              { title: "Pré-inscriptions", desc: "Recevez et gérez les dossiers en ligne" },
              { title: "Vérification", desc: "Badge officiel pour rassurer les parents" },
              { title: "Statistiques", desc: "Suivez vos vues et vos candidatures" },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mb-4" />
                <p className="font-bold text-sm mb-1">{item.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="bg-accent text-white">
        <div className="max-w-screen-xl mx-auto px-5 py-14 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Link href="/" className="inline-block">
              <Logo variant="dark" />
            </Link>
            <p className="text-slate-400 text-sm mt-4 leading-relaxed max-w-[220px]">
              La plateforme camerounaise pour trouver et gérer un établissement scolaire.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">Catégories</p>
            <div className="space-y-2.5">
              {categories.map((cat) => (
                <Link key={cat.key} href={`/categorie/${cat.key}`} className="block text-sm text-slate-400 hover:text-white transition-colors duration-fast">
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">Établissements</p>
            <div className="space-y-2.5">
              <Link href="/auth/inscription" className="block text-sm text-slate-400 hover:text-white transition-colors duration-fast">Inscrire mon établissement</Link>
              <Link href="/auth/connexion" className="block text-sm text-slate-400 hover:text-white transition-colors duration-fast">Connexion</Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">Légal</p>
            <div className="space-y-2.5">
              <p className="text-sm text-slate-500">Confidentialité</p>
              <p className="text-sm text-slate-500">Conditions</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 max-w-screen-xl mx-auto px-5 py-5 text-xs text-slate-500">
          © {new Date().getFullYear()} Écoles237. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
