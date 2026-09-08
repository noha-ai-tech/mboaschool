"use client";

// Page de résultats / annuaire général (Landing V5, Sprint page-split).
//
// SPRINT R.2-B — réécriture de la source de données : la page ne charge plus
// jamais toute la table `establishments` au montage. Chaque changement de
// filtre/page appelle /api/recherche avec page/page_size, qui retourne au
// plus page_size lignes + un total_count exact (§3/§4). Le design des
// cartes, le panneau de comparaison et la bascule Liste/Carte sont inchangés
// (§29) — seule la source des données change.
//
// Portée volontairement réduite par rapport à l'ancienne page : la vue Carte
// et le filtre géolocalisé "Près de moi" opèrent maintenant sur la PAGE de
// résultats courante (≤ page_size établissements), pas sur la base entière —
// une recherche par rayon réellement server-side (bounding box + distance en
// base) sortirait du contrat §4 (q/region/city/category/page/page_size) et
// n'est pas demandée par ce sprint. Documenté dans le rapport final R.2-B.

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fraunces } from "next/font/google";
import {
  Search, MapPin, Phone, ArrowRight, Scale, Heart, X, List, Map as MapIcon,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";
import { useNearMeFilter, haversineKm } from "@/lib/useNearMeFilter";
import { categories } from "@/lib/categories";
import { citiesForRegionFilter } from "@/lib/cameroonMajorCities";
import { REGION_FILTER_OPTIONS } from "@/lib/cameroonRegions";
import type { SchoolSearchResponse, SchoolSearchResult } from "@/lib/search/types";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE } from "@/lib/search/types";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";

const LocalSchoolMap = dynamic(() => import("@/components/LocalSchoolMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <span className="text-sm text-slate-400 font-medium">Chargement de la carte…</span>
    </div>
  ),
});

// Fraunces pour le titre éditorial de la page (même pattern déjà en place
// sur src/app/page.tsx et src/app/categorie/[slug]/page.tsx), sans toucher
// au Manrope global du reste du site.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const DEFAULT_CENTER = { lat: 4.0511, lng: 9.7679 }; // Douala

// ─── Data & Types ──────────────────────────────────────────────────────────

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

function transformSchool(raw: SchoolSearchResult): School {
  const infra = raw.infrastructures?.[0] ?? {};
  const fee = raw.fees?.[0] ?? { registration_fee: null, tuition_fee: null };
  const infrastructure = Object.entries(infra)
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

function Money({ value }: { value: number }) {
  return <>{value.toLocaleString("fr-FR")} FCFA</>;
}

// ─── Sub-components ────────────────────────────────────────────────────────

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
  const [liked, setLiked] = useState(false);

  return (
    <div className="group bg-white rounded-[16px] overflow-hidden border border-[#E7E0D7] shadow-[0_8px_24px_-14px_rgba(11,59,46,0.2)] hover:shadow-[0_16px_34px_-14px_rgba(11,59,46,0.26)] hover:-translate-y-0.5 transition-all duration-base">
      <div className="relative h-48 overflow-hidden bg-[#E9F5EE]">
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
          <div className="w-full h-full bg-[#0B3B2E] flex items-center justify-center">
            <span className="text-5xl">{school.emojiLogo ?? "🏫"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {school.emojiLogo && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-base leading-none px-2 py-1 rounded-xl">
            {school.emojiLogo}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setLiked((v) => !v); }}
          aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={liked}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/85 backdrop-blur-sm text-[#5A695F] hover:text-red-500 transition-colors duration-base"
        >
          <Heart size={14} className={liked ? "fill-red-500 text-red-500" : ""} />
        </button>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-[10px] font-semibold bg-[#EEF6F1] text-[#12543F] px-2 py-0.5 rounded-full capitalize">
            {school.category}{school.subcategory ? ` · ${school.subcategory}` : ""}
          </span>
        </div>

        <h3 className="font-bold text-[15px] leading-snug text-[#132019] mb-1.5 line-clamp-2">
          {school.name}
        </h3>

        <p className="flex items-center gap-1 text-xs text-[#5A695F] mb-1">
          <MapPin size={11} />
          {school.quartier ? `${school.quartier}, ` : ""}{school.city}
          {dist !== null && (
            <span className="ml-1 text-[#1F8A5D] font-semibold">· {dist.toFixed(1)} km</span>
          )}
        </p>

        {school.phone ? (
          <a
            href={`tel:${school.phone}`}
            className="flex items-center gap-1 text-xs text-[#5A695F] hover:text-[#12543F] transition-colors duration-base mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone size={11} />
            {school.phone}
          </a>
        ) : (
          <div className="mb-3" />
        )}

        {school.fees > 0 && (
          <p className="text-xs text-[#5A695F] mb-3">
            À partir de <span className="font-bold text-[#132019]"><Money value={school.fees} /></span>/an
          </p>
        )}

        {school.infrastructure.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {school.infrastructure.slice(0, 3).map((item) => (
              <span key={item} className="text-[10px] font-semibold bg-[#F4F3EF] text-[#5A695F] border border-[#E7E0D7] px-2 py-0.5 rounded-full">
                {item}
              </span>
            ))}
            {school.infrastructure.length > 3 && (
              <span className="text-[10px] font-semibold text-[#5A695F] px-1 py-0.5">
                +{school.infrastructure.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link
            href={`/ecole/${school.id}`}
            className="group/voir inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[9px] bg-[#F2AE1F] text-[#0B3B2E] text-[13px] font-bold shadow-[0_6px_16px_-8px_rgba(11,59,46,0.45)] hover:bg-[#D6941A] hover:shadow-[0_10px_22px_-8px_rgba(11,59,46,0.5)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_4px_10px_-6px_rgba(11,59,46,0.4)] transition-all duration-base"
          >
            Voir
            <ArrowRight size={12} strokeWidth={2.5} className="transition-transform duration-base group-hover/voir:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); toggleCompare(school.id); }}
            aria-pressed={inCompare}
            className={`inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[9px] border text-[13px] font-semibold transition-all duration-base ${
              inCompare
                ? "bg-[#1F8A5D] text-white border-[#1F8A5D] shadow-[0_6px_16px_-8px_rgba(31,138,93,0.4)]"
                : "bg-white text-[#132019] border-[#E7E0D7] hover:border-[#1F8A5D] hover:text-[#12543F] hover:-translate-y-0.5"
            }`}
          >
            <Scale size={12} />
            Comparer
          </button>
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination des résultats" className="flex items-center justify-center gap-2 mt-10">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#E7E0D7] bg-white text-[#5A695F] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F3EF] transition-colors duration-base"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-[#5A695F] px-2" aria-live="polite">
        Page {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Page suivante"
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#E7E0D7] bg-white text-[#5A695F] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F3EF] transition-colors duration-base"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

function RecherchePageInner() {
  const tickerItems = useSiteTickerItems();
  const searchParams = useSearchParams();
  const router = useRouter();

  // §22-23 — état d'URL comme source de vérité pour q/region/city/category/page.
  const urlQuery = searchParams.get("q") ?? "";
  const urlRegion = searchParams.get("region") ?? "all";
  const urlCity = searchParams.get("ville") ?? "all";
  const urlCategory = searchParams.get("categorie") ?? "all";
  const urlPage = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  // Champ texte local — débattu (§24) avant de répercuter dans l'URL/la requête.
  const [queryInput, setQueryInput] = useState(urlQuery);
  useEffect(() => setQueryInput(urlQuery), [urlQuery]);

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => {
    function applyPageSize() {
      setPageSize(window.innerWidth < 768 ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE);
    }
    applyPageSize();
    window.addEventListener("resize", applyPageSize);
    return () => window.removeEventListener("resize", applyPageSize);
  }, []);

  const [response, setResponse] = useState<SchoolSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const [compare, setCompare] = useState<string[]>([]);
  const [view, setView] = useState<"liste" | "carte">("liste");
  const near = useNearMeFilter(() => setView("carte"));

  // Ville dépend de la Région choisie (§ demande "filtres cohérents") — même
  // correspondance macro-zone -> régions réelles que /api/recherche.
  const cityOptions = useMemo(() => ["all", ...citiesForRegionFilter(urlRegion).map((c) => c.name)], [urlRegion]);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all" || value === "") params.delete(key);
      else params.set(key, value);
    }
    // §23 — tout changement de filtre (hors page elle-même) revient à la page 1.
    if (!("page" in next)) params.delete("page");
    router.replace(`/recherche${params.toString() ? `?${params}` : ""}`);
  }

  // §24 — debounce texte : la frappe met à jour l'URL 350ms après la dernière touche.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQueryChange(value: string) {
    setQueryInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value.trim() || null }), 350);
  }

  // §25 — protection contre les courses : seule la réponse de la DERNIÈRE requête émise est appliquée.
  const requestIdRef = useRef(0);
  const fetchResults = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrored(false);

    const params = new URLSearchParams();
    if (urlQuery) params.set("q", urlQuery);
    if (urlRegion !== "all") params.set("region", urlRegion);
    if (urlCity !== "all") params.set("city", urlCity);
    if (urlCategory !== "all") params.set("category", urlCategory);
    params.set("page", String(urlPage));
    params.set("page_size", String(pageSize));

    fetch(`/api/recherche?${params.toString()}`)
      .then(async (res) => {
        if (requestId !== requestIdRef.current) return; // réponse obsolète — ignorée
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SchoolSearchResponse;
        setResponse(json);
        setLoading(false);
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        console.error("[/recherche] fetch failed:", error);
        setErrored(true);
        setLoading(false);
      });
  }, [urlQuery, urlRegion, urlCity, urlCategory, urlPage, pageSize]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  function toggleCompare(id: string) {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [prev[1], prev[2], id].filter(Boolean);
      return [...prev, id];
    });
  }

  const schools = useMemo(() => (response?.results ?? []).map(transformSchool), [response]);
  const totalCount = response?.total_count ?? 0;
  const totalPages = response?.total_pages ?? 0;

  const mapCenter = near.userLocation ?? DEFAULT_CENTER;

  // "Près de moi" filtre la PAGE courante uniquement (§ note d'en-tête) — pas
  // une recherche par rayon server-side, hors du contrat §4 de ce sprint.
  const displayedSchools = useMemo(() => {
    if (!near.useLocation || !near.userLocation) return schools;
    return schools.filter((s) => {
      if (!s.lat || !s.lng) return false;
      return haversineKm(near.userLocation!.lat, near.userLocation!.lng, s.lat, s.lng) <= Number(near.radius);
    });
  }, [schools, near.useLocation, near.userLocation, near.radius]);

  const compareSchools = schools.filter((s) => compare.includes(s.id)).slice(0, 3);

  const mapSchools = useMemo(
    () => displayedSchools.filter((s): s is School & { lat: number; lng: number } => s.lat != null && s.lng != null),
    [displayedSchools]
  );

  function goToPage(p: number) {
    if (p < 1 || (totalPages > 0 && p > totalPages)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/recherche?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className={`min-h-screen bg-[#FBF6F2] ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="max-w-[1520px] mx-auto px-[18px] py-8">
        <div className="mb-6">
          <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[#132019]">Tous les établissements</h1>
          <p className="text-sm text-[#5A695F] mt-1.5">Annuaire complet des écoles référencées sur Écoles237.</p>
        </div>

        {/* Filtres */}
        <div className="bg-white border border-[#E7E0D7] rounded-[16px] shadow-[0_8px_24px_-14px_rgba(11,59,46,0.15)] p-3.5 flex items-center gap-2.5 mb-5 flex-wrap">
          <div className="relative flex items-center gap-2 bg-[#FCFAF7] border border-[#E7E0D7] rounded-[10px] px-3 h-10 flex-1 min-w-[220px] max-w-sm focus-within:border-[#12543F] transition-colors duration-base">
            <Search size={15} className="text-[#5A695F] shrink-0" />
            <input
              value={queryInput}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Nom, ville, niveau…"
              aria-label="Rechercher un établissement"
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-[#5A695F]/70 text-[#132019]"
            />
            {queryInput && (
              <button onClick={() => { setQueryInput(""); updateParams({ q: null }); }} aria-label="Effacer la recherche">
                <X size={13} className="text-[#5A695F]" />
              </button>
            )}
            <SearchSuggestions query={queryInput} onSelectCity={(city) => { setQueryInput(""); updateParams({ q: null, region: null, ville: city }); }} />
          </div>

          <select
            value={urlCategory}
            onChange={(e) => updateParams({ categorie: e.target.value })}
            aria-label="Filtrer par catégorie"
            className="border border-[#E7E0D7] rounded-[10px] px-3 h-10 text-sm font-medium bg-[#FCFAF7] text-[#132019]"
          >
            <option value="all">Toutes catégories</option>
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
          </select>

          <select
            value={urlRegion}
            onChange={(e) => {
              const nextRegion = e.target.value;
              const stillValid = urlCity === "all" || citiesForRegionFilter(nextRegion).some((c) => c.name === urlCity);
              updateParams(stillValid ? { region: nextRegion } : { region: nextRegion, ville: null });
            }}
            aria-label="Filtrer par région"
            className="border border-[#E7E0D7] rounded-[10px] px-3 h-10 text-sm font-medium bg-[#FCFAF7] text-[#132019]"
          >
            {REGION_FILTER_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <select
            value={urlCity}
            onChange={(e) => updateParams({ ville: e.target.value })}
            aria-label="Filtrer par ville"
            className="border border-[#E7E0D7] rounded-[10px] px-3 h-10 text-sm font-medium bg-[#FCFAF7] text-[#132019]"
          >
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c === "all" ? "Toutes les villes" : c}</option>
            ))}
          </select>

          <button
            onClick={near.handleLocationToggle}
            disabled={near.locating}
            className="flex items-center gap-1.5 border border-[#DCEEE3] bg-[#EEF6F1] text-[#12543F] rounded-[10px] px-3.5 h-10 text-sm font-semibold hover:bg-[#E3F1E9] transition-colors duration-base disabled:opacity-50 whitespace-nowrap"
          >
            <MapPin size={14} />
            {near.locating ? "Localisation…" : "Près de moi"}
          </button>

          {near.useLocation && (
            <span className="flex items-center gap-2 px-3 py-2 bg-[#E9F5EE] text-[#0B3B2E] rounded-lg text-sm font-semibold border border-[#DCEEE3]">
              À moins de {near.radius} km (sur cette page)
              <button onClick={near.clearLocation} aria-label="Retirer le filtre de proximité"><X size={13} /></button>
            </span>
          )}

          <span className="ml-auto text-sm text-[#5A695F] font-medium whitespace-nowrap" aria-live="polite">
            {loading ? "Chargement…" : errored ? "" : <><span className="text-[#132019] font-bold font-[family-name:var(--font-fraunces)]">{totalCount}</span> résultat{totalCount !== 1 ? "s" : ""}</>}
          </span>
        </div>

        {/* Liste / Carte */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setView("liste")}
            aria-pressed={view === "liste"}
            className={`flex items-center gap-1.5 px-3.5 h-9 rounded-[9px] border text-sm font-semibold transition-colors duration-base ${view === "liste" ? "bg-[#0B3B2E] text-white border-[#0B3B2E]" : "bg-white text-[#5A695F] border-[#E7E0D7] hover:text-[#132019]"}`}
          >
            <List size={14} />
            Liste
          </button>
          <button
            onClick={() => setView("carte")}
            aria-pressed={view === "carte"}
            className={`flex items-center gap-1.5 px-3.5 h-9 rounded-[9px] border text-sm font-semibold transition-colors duration-base ${view === "carte" ? "bg-[#0B3B2E] text-white border-[#0B3B2E]" : "bg-white text-[#5A695F] border-[#E7E0D7] hover:text-[#132019]"}`}
          >
            <MapIcon size={14} />
            Carte
          </button>
        </div>

        {near.locationError && (
          <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 bg-[#F4F3EF] border border-[#E7E0D7] rounded-[10px] text-sm text-[#5A695F]">
            <span>{near.locationError}</span>
            <button onClick={() => near.setLocationError(null)} aria-label="Fermer" className="text-[#5A695F] hover:text-[#132019] shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* §28 — erreur réseau/serveur distincte de "0 résultat" */}
        {errored && (
          <div className="py-20 text-center">
            <AlertTriangle size={36} className="mx-auto text-[#C8202F]/50 mb-4" />
            <h3 className="text-xl font-bold text-[#132019] mb-2">Impossible de charger les résultats</h3>
            <p className="text-[#5A695F] text-sm mb-4">Une erreur est survenue. Réessayez dans un instant.</p>
            <button
              onClick={() => fetchResults()}
              className="inline-flex items-center gap-1.5 bg-[#0B3B2E] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#12543F] transition-colors duration-base"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Vue Liste */}
        {!errored && view === "liste" && (
        <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
          <div>
            {loading && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-[16px] overflow-hidden border border-[#E7E0D7] animate-pulse" role="status" aria-label="Chargement des résultats">
                    <div className="h-48 bg-[#F4F3EF]" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-[#F4F3EF] rounded w-1/3" />
                      <div className="h-5 bg-[#F4F3EF] rounded w-3/4" />
                      <div className="h-4 bg-[#F4F3EF] rounded w-1/2" />
                      <div className="h-9 bg-[#F4F3EF] rounded-lg mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && displayedSchools.length > 0 && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedSchools.map((school) => (
                  <SchoolCard key={school.id} school={school} userLocation={near.userLocation} compare={compare} toggleCompare={toggleCompare} />
                ))}
              </div>
            )}

            {!loading && displayedSchools.length === 0 && (
              <div className="py-20 text-center">
                <Search size={36} className="mx-auto text-[#E7E0D7] mb-4" />
                <h3 className="text-xl font-bold text-[#132019] mb-2">Aucun établissement trouvé</h3>
                <p className="text-[#5A695F] text-sm">Modifiez vos filtres ou élargissez votre recherche.</p>
              </div>
            )}

            {!loading && <Pagination page={urlPage} totalPages={totalPages} onChange={goToPage} />}
          </div>

          {/* Sidebar compare */}
          <aside className="hidden lg:block sticky top-[94px]">
            <div className="bg-white border border-[#E7E0D7] rounded-[16px] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E7E0D7]">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-[#132019]">Comparaison</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${compareSchools.length > 0 ? "bg-[#E9F5EE] text-[#12543F]" : "bg-[#F4F3EF] text-[#5A695F]"}`}>
                    {compareSchools.length}/3
                  </span>
                </div>
              </div>

              <div className="p-4">
                {compareSchools.length === 0 ? (
                  <div className="text-center py-6">
                    <Scale size={28} className="mx-auto text-[#E7E0D7] mb-3" />
                    <p className="text-xs text-[#5A695F] leading-relaxed">
                      Cliquez sur <strong className="text-[#132019]">Comparer</strong> sur une carte pour comparer jusqu&apos;à 3 écoles.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {compareSchools.map((school) => (
                      <div key={school.id} className="border border-[#E7E0D7] rounded-[14px] p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-semibold text-sm leading-snug text-[#132019]">{school.name}</p>
                          <button onClick={() => toggleCompare(school.id)} className="text-[#5A695F]/50 hover:text-[#5A695F] shrink-0 mt-0.5">
                            <X size={13} />
                          </button>
                        </div>
                        <p className="text-xs text-[#5A695F] mb-2">{school.city}{school.subcategory ? ` · ${school.subcategory}` : ""}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-[#F4F3EF] rounded-lg p-2">
                            <p className="text-[#5A695F] mb-0.5">Inscription</p>
                            <p className="font-bold text-[11px] text-[#132019]">
                              {school.registration > 0 ? <Money value={school.registration} /> : "—"}
                            </p>
                          </div>
                          <div className="bg-[#F4F3EF] rounded-lg p-2">
                            <p className="text-[#5A695F] mb-0.5">Scolarité</p>
                            <p className="font-bold text-[11px] text-[#132019]">
                              {school.fees > 0 ? <Money value={school.fees} /> : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {compareSchools.length >= 2 && (
                      <button className="w-full bg-[#0B3B2E] text-white text-xs font-semibold py-2.5 rounded-[14px] hover:bg-[#12543F] transition-colors duration-base">
                        Comparer côte à côte
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="relative overflow-hidden mt-4 bg-gradient-to-br from-[#0B3B2E] to-[#12543F] text-white rounded-[16px] p-5">
              <span aria-hidden="true" className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-[#F2AE1F]/20 blur-2xl" />
              <p className="relative text-xs font-semibold tracking-wider uppercase text-[#F2AE1F] mb-3">
                Vous gérez une école ?
              </p>
              <p className="relative font-[family-name:var(--font-fraunces)] font-semibold text-base leading-snug mb-4">
                Inscrivez votre établissement et recevez des demandes de parents.
              </p>
              <Link
                href="/auth/inscription"
                className="relative flex items-center justify-center gap-2 bg-[#F2AE1F] text-[#0B3B2E] px-4 py-2.5 rounded-[10px] text-sm font-bold hover:bg-[#D6941A] transition-colors duration-base"
              >
                Commencer gratuitement
                <ArrowRight size={15} />
              </Link>
            </div>
          </aside>
        </div>
        )}

        {/* Vue Carte — limitée à la page courante (voir note d'en-tête) */}
        {!errored && view === "carte" && (
        <div className="grid lg:grid-cols-[3fr_2fr] gap-6 items-start">
          <div className="hidden lg:block space-y-3 lg:max-h-[calc(100vh-144px)] lg:overflow-y-auto lg:pr-1">
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-white rounded-[16px] border border-[#E7E0D7] animate-pulse" role="status" aria-label="Chargement des résultats" />
                ))}
              </div>
            )}
            {!loading && displayedSchools.length === 0 && (
              <div className="py-16 text-center">
                <Search size={32} className="mx-auto text-[#E7E0D7] mb-3" />
                <h3 className="font-bold text-[#132019] mb-1">Aucun établissement trouvé</h3>
                <p className="text-[#5A695F] text-sm">Modifiez vos filtres ou élargissez votre recherche.</p>
              </div>
            )}
            {!loading && displayedSchools.map((school) => (
              <SchoolCard key={school.id} school={school} userLocation={near.userLocation} compare={compare} toggleCompare={toggleCompare} />
            ))}
            {!loading && <Pagination page={urlPage} totalPages={totalPages} onChange={goToPage} />}
          </div>

          <div className="relative sticky top-[94px] h-[65vh] lg:h-[calc(100vh-144px)] rounded-[16px] overflow-hidden border border-[#E7E0D7]">
            <LocalSchoolMap center={mapCenter} userLocation={near.userLocation} radiusKm={Number(near.radius)} schools={mapSchools} />
            {!loading && mapSchools.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/85 pointer-events-none px-6 text-center">
                <p className="text-sm text-[#5A695F]">Aucun établissement géolocalisé pour ces filtres.</p>
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
