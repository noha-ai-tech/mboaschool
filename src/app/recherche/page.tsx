"use client";

// Page de résultats / annuaire général (Landing V5, Sprint page-split).
// Héberge la liste/carte/comparaison qui vivait auparavant directement sur
// la landing (/) sous #resultats — déplacée ici pour que la page d'accueil
// reste une vraie page de présentation (hero → catégories → à la une → CTA →
// stats → partenaires → footer), sans scroll vers un bloc de résultats.
//
// Contenu et logique inchangés par rapport à l'ancien bloc de la landing :
// mêmes champs Supabase, même filtrage, mêmes cartes "Non revendiquée" /
// "Revendiquer cette page", même panneau de comparaison (max 3), même bascule
// Liste/Carte. Seule différence : les filtres initiaux peuvent être fournis
// par l'URL (q, categorie, ville, lat, lng, rayon) depuis le Hero de la
// landing ou la recherche rapide du header.

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, MapPin, Phone, CheckCircle2, ArrowRight, Scale, Heart, X, List, Map as MapIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { categories } from "@/lib/categories";

const LocalSchoolMap = dynamic(() => import("@/components/LocalSchoolMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <span className="text-sm text-slate-400 font-medium">Chargement de la carte…</span>
    </div>
  ),
});

const DEFAULT_CENTER = { lat: 4.0511, lng: 9.7679 }; // Douala

// ─── Data & Types (identiques à l'ancien bloc landing) ────────────────────────

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

function Money({ value }: { value: number }) {
  return <>{value.toLocaleString("fr-FR")} FCFA</>;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

      <div className="p-4">
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

function RecherchePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(searchParams.get("categorie") ?? "all");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [city, setCity] = useState(searchParams.get("ville") ?? "all");
  const initialLat = searchParams.get("lat");
  const initialLng = searchParams.get("lng");
  const [useLocation, setUseLocation] = useState(Boolean(initialLat && initialLng));
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: Number(initialLat), lng: Number(initialLng) } : null
  );
  const [radius, setRadius] = useState(searchParams.get("rayon") ?? "5");
  const [compare, setCompare] = useState<string[]>([]);
  const [view, setView] = useState<"liste" | "carte">(useLocation ? "carte" : "liste");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

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
        setUseLocation(true);
        setLocating(false);
        setView("carte");
      },
      () => {
        setLocating(false);
        setLocationError("Position indisponible. Vous pouvez rechercher par ville ou consulter la carte manuellement.");
      }
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
    () => ["all", ...Array.from(new Set(schools.map((s) => s.city).filter((c) => c.trim().length > 0)))],
    [schools]
  );

  const mapCenter = userLocation ?? DEFAULT_CENTER;

  const filtered = schools.filter((s) => {
    if (activeCategory !== "all" && s.category !== activeCategory) return false;
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

  const mapSchools = useMemo(
    () => filtered.filter((s): s is School & { lat: number; lng: number } => s.lat != null && s.lng != null),
    [filtered]
  );

  const groupedByCategory = useMemo(() => {
    if (activeCategory !== "all") return null;
    return categories
      .map((cat) => ({ cat, items: filtered.filter((s) => s.category === cat.key).slice(0, 3) }))
      .filter((group) => group.items.length > 0);
  }, [filtered, activeCategory]);

  function updateCategory(v: string) {
    setActiveCategory(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === "all") params.delete("categorie");
    else params.set("categorie", v);
    router.replace(`/recherche?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <SiteHeaderSpacer />

      <div className="max-w-[1520px] mx-auto px-[18px] py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#0a0a0a]">Tous les établissements</h1>
          <p className="text-sm text-slate-500 mt-1">Annuaire complet des écoles référencées sur Écoles237.</p>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-border rounded-[10px] px-3 h-10 flex-1 min-w-[220px] max-w-sm focus-within:border-primary transition-colors">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, ville, niveau…"
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-slate-400"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer"><X size={13} className="text-slate-400" /></button>
            )}
          </div>

          <select
            value={activeCategory}
            onChange={(e) => updateCategory(e.target.value)}
            className="border border-border rounded-[10px] px-3 h-10 text-sm font-medium bg-white"
          >
            <option value="all">Toutes catégories</option>
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
          </select>

          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border border-border rounded-[10px] px-3 h-10 text-sm font-medium bg-white"
          >
            {cities.map((c) => (
              <option key={c} value={c}>{c === "all" ? "Toutes les villes" : c}</option>
            ))}
          </select>

          <button
            onClick={handleLocationToggle}
            disabled={locating}
            className="flex items-center gap-1.5 border border-border rounded-[10px] px-3 h-10 text-sm font-medium bg-white hover:bg-muted transition-colors disabled:opacity-50"
          >
            <MapPin size={14} />
            {locating ? "Localisation…" : "Près de moi"}
          </button>

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

          <div className="flex items-center rounded-[10px] border border-border overflow-hidden shrink-0">
            <button
              onClick={() => setView("liste")}
              className={`flex items-center gap-1.5 px-3 h-9 text-sm font-semibold transition-colors ${view === "liste" ? "bg-[#0A0A0A] text-white" : "bg-white text-slate-500 hover:text-[#0a0a0a]"}`}
            >
              <List size={14} />
              Liste
            </button>
            <button
              onClick={() => setView("carte")}
              className={`flex items-center gap-1.5 px-3 h-9 text-sm font-semibold border-l border-border transition-colors ${view === "carte" ? "bg-[#0A0A0A] text-white" : "bg-white text-slate-500 hover:text-[#0a0a0a]"}`}
            >
              <MapIcon size={14} />
              Carte
            </button>
          </div>
        </div>

        {locationError && (
          <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 bg-muted border border-border rounded-[10px] text-sm text-slate-600">
            <span>{locationError}</span>
            <button onClick={() => setLocationError(null)} aria-label="Fermer" className="text-slate-500 hover:text-[#0a0a0a] shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Vue Liste */}
        {view === "liste" && (
        <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
          <div>
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

            {!loading && groupedByCategory && (
              <div className="space-y-10">
                {groupedByCategory.map(({ cat, items }) => (
                  <div key={cat.key} className="border border-border rounded-xl p-5">
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

            {!loading && !groupedByCategory && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((school) => (
                  <SchoolCard key={school.id} school={school} userLocation={userLocation} compare={compare} toggleCompare={toggleCompare} />
                ))}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="py-20 text-center">
                <Search size={36} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-xl font-bold mb-2">Aucun résultat</h3>
                <p className="text-slate-500 text-sm">Modifiez vos filtres ou élargissez votre recherche.</p>
              </div>
            )}
          </div>

          {/* Sidebar compare */}
          <aside className="hidden lg:block sticky top-[94px]">
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
                      Cliquez sur <Scale size={11} className="inline" /> sur une carte pour comparer jusqu&apos;à 3 écoles.
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
        )}

        {/* Vue Carte */}
        {view === "carte" && (
        <div className="grid lg:grid-cols-[3fr_2fr] gap-6 items-start">
          <div className="hidden lg:block space-y-3 lg:max-h-[calc(100vh-144px)] lg:overflow-y-auto lg:pr-1">
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-white rounded-xl border border-[#ebebeb] animate-pulse" />
                ))}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="py-16 text-center">
                <Search size={32} className="mx-auto text-slate-300 mb-3" />
                <h3 className="font-bold mb-1">Aucun résultat</h3>
                <p className="text-slate-500 text-sm">Modifiez vos filtres ou élargissez votre recherche.</p>
              </div>
            )}
            {!loading && filtered.map((school) => (
              <SchoolCard key={school.id} school={school} userLocation={userLocation} compare={compare} toggleCompare={toggleCompare} />
            ))}
          </div>

          <div className="relative sticky top-[94px] h-[65vh] lg:h-[calc(100vh-144px)] rounded-card overflow-hidden border border-border">
            <LocalSchoolMap center={mapCenter} userLocation={userLocation} radiusKm={Number(radius)} schools={mapSchools} />
            {!loading && mapSchools.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/85 pointer-events-none px-6 text-center">
                <p className="text-sm text-slate-500">Aucun établissement géolocalisé pour ces filtres.</p>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense>
      <RecherchePageInner />
    </Suspense>
  );
}
