"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, MapPin, ArrowRight, School, Search, X, Scale,
} from "lucide-react";
import { CategoryComparison } from "@/components/categories/CategoryComparison";
import { CAT_META } from "./catMeta";
import { includesInsensitive } from "@/lib/textSearch";
import { formatQuartierCity } from "@/lib/formatSchoolLocation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { useNearMeFilter, haversineKm } from "@/lib/useNearMeFilter";
import { citiesForRegionFilter, getMajorCity } from "@/lib/cameroonMajorCities";
import { REGION_FILTER_OPTIONS, regionsForFilterValue } from "@/lib/cameroonRegions";
import { paginateAll } from "@/lib/sitemap/paginate";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

function CategoryPageInner() {
  const { slug } = useParams() as { slug: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  // § filtres cohérents avec /recherche : Nom/Région/Ville/Près de moi, état
  // d'URL comme source de vérité (même pattern que /recherche/page.tsx).
  const urlRegion = searchParams.get("region") ?? "all";
  const urlCity = searchParams.get("ville") ?? "all";

  const meta = CAT_META[slug];
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const near = useNearMeFilter();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const compareSchools = schools.filter((school) => compareIds.includes(school.id));
  function toggleCompare(id: string) {
    setCompareIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 3 ? [...ids, id] : ids);
  }

  // Ville dépend de la Région choisie — même correspondance que /recherche.
  const cityOptions = useMemo(() => ["all", ...citiesForRegionFilter(urlRegion).map((c) => c.name)], [urlRegion]);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sous");
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all" || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.replace(`/categorie/${slug}${params.toString() ? `?${params}` : ""}`);
  }

  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setSchools([]);
    setQuery("");
    setCompareIds([]);
    setShowCompare(false);
    paginateAll(500, async (from, to) => {
      const { data, error } = await supabase
      .from("establishments")
      .select(`
        id, name, main_category, sub_category, description,
        city, region, neighborhood, cover_image_url,
        latitude, longitude,
        is_verified, is_featured, is_claimed, subscription_plan,
        fees(registration_fee, tuition_fee),
        school_images(url)
      `)
      .eq("main_category", slug)
      // CMS-F.6 — ne remonter que les photos publiées (même filtre que
      // useShowcasePhotos), défense en profondeur avec la policy RLS.
      .eq("school_images.status", "live")
      .order("is_featured", { ascending: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .abortSignal(controller.signal);
      if (error) throw error;
      return data ?? [];
    }).then((data) => {
      if (!controller.signal.aborted) setSchools(data);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError("Impossible de charger les établissements. Rechargez la page pour réessayer.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [slug, meta]);

  if (!meta) {
    return (
      <div className="min-h-screen bg-[#FBF6F2]">
        <SiteHeader />
        <SiteHeaderSpacer />
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <p className="text-[#5A695F] font-semibold">Catégorie introuvable.</p>
            <Link href="/" className="text-sm text-[#12543F] font-semibold mt-3 block">← Retour à l&apos;accueil</Link>
          </div>
        </div>
      </div>
    );
  }

  const { label } = meta;

  // Ville/Région — même logique de correspondance que /recherche
  // (regionsForFilterValue + getMajorCity pour résoudre les alias de ville).
  const regionsForFilter = regionsForFilterValue(urlRegion);

  // Filtered list
  const filtered = schools.filter((s) => {
    if (query && !includesInsensitive(`${s.name} ${s.city ?? ""} ${s.neighborhood ?? ""} ${s.sub_category ?? ""}`, query)) {
      return false;
    }
    if (regionsForFilter && !(s.region && regionsForFilter.includes(s.region))) return false;
    if (urlCity !== "all") {
      const majorName = getMajorCity(s.city)?.name ?? s.city;
      if (!majorName || majorName.toLowerCase() !== urlCity.toLowerCase()) return false;
    }
    if (near.useLocation && near.userLocation) {
      if (s.latitude == null || s.longitude == null) return false;
      if (haversineKm(near.userLocation.lat, near.userLocation.lng, s.latitude, s.longitude) > Number(near.radius)) return false;
    }
    return true;
  });

  return (
    <div className={`min-h-screen bg-[#FBF6F2] ${jakarta.variable} font-[family-name:var(--font-jakarta)]`}>
      <SiteHeader />
      <SiteHeaderSpacer />

      <div className="max-w-[1520px] mx-auto px-[18px]">

        {/* ── FIL D'ARIANE ─────────────────────────────────────────── */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#5A695F] hover:text-[#12543F] transition-colors duration-base pt-6"
        >
          <ArrowLeft size={15} /> Accueil
        </Link>

        <header className="pt-4 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#12543F] mb-1">Catégorie</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#132019]">{label}</h1>
        </header>

        <section className="pb-16" aria-label="Établissements de la catégorie">
          {/* Filtres — mêmes champs et même style que /recherche (Nom, Région,
              Ville dépendante, Près de moi), sans "Toutes catégories"
              puisque cette page est déjà scopée à une catégorie. */}
          <div className="bg-white border border-[#E7E0D7] rounded-[16px] shadow-[0_8px_24px_-14px_rgba(11,59,46,0.15)] p-3 grid grid-cols-2 lg:flex lg:items-center gap-2.5 mb-5">
            <div className="flex items-center gap-2 bg-[#FCFAF7] border border-[#E7E0D7] rounded-[10px] px-3 h-10 col-span-2 lg:flex-1 min-w-0 focus-within:border-[#12543F] transition-colors duration-base">
              <Search size={15} className="text-[#5A695F] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom d'établissement…"
                aria-label="Rechercher un établissement"
                className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-[#5A695F]/70 text-[#132019]"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Effacer la recherche">
                  <X size={13} className="text-[#5A695F]" />
                </button>
              )}
            </div>

            <select
              value={urlRegion}
              onChange={(e) => {
                const nextRegion = e.target.value;
                const stillValid = urlCity === "all" || citiesForRegionFilter(nextRegion).some((c) => c.name === urlCity);
                updateParams(stillValid ? { region: nextRegion } : { region: nextRegion, ville: null });
              }}
              aria-label="Filtrer par région"
              className="border border-[#E7E0D7] rounded-[10px] px-2.5 h-10 min-w-0 text-sm font-medium bg-[#FCFAF7] text-[#132019]"
            >
              {REGION_FILTER_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.value === "all" ? "Région" : r.label}</option>
              ))}
            </select>

            <select
              value={urlCity}
              onChange={(e) => updateParams({ ville: e.target.value })}
              aria-label="Filtrer par ville"
              className="border border-[#E7E0D7] rounded-[10px] px-2.5 h-10 min-w-0 text-sm font-medium bg-[#FCFAF7] text-[#132019]"
            >
              {cityOptions.map((c) => (
                <option key={c} value={c}>{c === "all" ? "Ville" : c}</option>
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
                À moins de {near.radius} km
                <button onClick={near.clearLocation} aria-label="Retirer le filtre de proximité"><X size={13} /></button>
              </span>
            )}

            <button type="button" onClick={() => setShowCompare((value) => !value)} aria-expanded={showCompare} aria-controls="category-comparison"
              className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-[10px] bg-[#F2AE1F] text-[#0B3B2E] text-sm font-semibold whitespace-nowrap">
              <Scale size={16} /> Comparer{compareIds.length > 0 ? ` (${compareIds.length})` : ""}
            </button>
          </div>

          {showCompare && <CategoryComparison schools={compareSchools} onRemove={toggleCompare} onClose={() => setShowCompare(false)} />}

          <p className="text-sm text-[#5A695F] mb-4" aria-live="polite">
            {loading ? "Chargement…" : loadError ? "" : <><span className="text-[#132019] font-semibold">{filtered.length}</span> établissement{filtered.length !== 1 ? "s" : ""}</>}
          </p>

          {near.locationError && (
            <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 bg-[#F4F3EF] border border-[#E7E0D7] rounded-[10px] text-sm text-[#5A695F]">
              <span>{near.locationError}</span>
              <button onClick={() => near.setLocationError(null)} aria-label="Fermer" className="text-[#5A695F] hover:text-[#132019] shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 bg-white border border-[#E7E0D7] rounded-[16px] animate-pulse" />
              ))}
            </div>
          ) : loadError ? (
            <p role="alert" className="rounded-[16px] border border-red-200 bg-white p-6 text-red-700">{loadError}</p>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-[#E7E0D7] rounded-[16px] py-20 text-center">
              <School size={32} className="mx-auto text-[#E7E0D7] mb-4" />
              <p className="font-semibold text-[#5A695F] text-sm">Aucun établissement trouvé</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((s) => {
                const tuition = s.fees?.[0]?.tuition_fee ?? 0;
                const location = formatQuartierCity(s.neighborhood, s.city);
                return (
                  <div
                    key={s.id}
                    className="group bg-white border border-[#E7E0D7] rounded-[16px] overflow-hidden shadow-[0_8px_24px_-14px_rgba(11,59,46,0.2)] hover:shadow-[0_16px_34px_-14px_rgba(11,59,46,0.26)] hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <Link href={`/ecole/${s.id}`}>
                      <div className="p-4 pb-0">
                        <p className="font-bold text-[#132019] leading-snug">{s.name}</p>
                        {location && (
                          <p className="text-xs text-[#5A695F] mt-1 flex items-center gap-1">
                            <MapPin size={10} /> {location}
                          </p>
                        )}
                        {s.sub_category && (
                          <span className="inline-block mt-2 text-[10px] font-semibold text-[#5A695F] bg-[#F4F3EF] px-2 py-0.5 rounded-full">
                            {s.sub_category}
                          </span>
                        )}
                        <div className="mt-3 pt-3 border-t border-[#F4F3EF]">
                          {tuition > 0 ? (
                            <p className="text-xs text-[#5A695F]">
                              <span className="font-bold text-[#132019]">{tuition.toLocaleString("fr-FR")}</span>
                              <span className="ml-1">FCFA/an</span>
                            </p>
                          ) : (
                            <p className="text-xs text-[#5A695F]">Frais non renseignés</p>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="p-4 pt-3 flex items-center justify-between gap-3">
                      <Link
                        href={`/ecole/${s.id}`}
                        className="group/voir inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[9px] bg-[#F2AE1F] text-[#0B3B2E] text-[13px] font-bold shadow-[0_6px_16px_-8px_rgba(11,59,46,0.45)] hover:bg-[#D6941A] hover:shadow-[0_10px_22px_-8px_rgba(11,59,46,0.5)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_4px_10px_-6px_rgba(11,59,46,0.4)] transition-all duration-base"
                      >
                        Voir
                        <ArrowRight size={12} strokeWidth={2.5} className="transition-transform duration-base group-hover/voir:translate-x-0.5" />
                      </Link>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#12543F]">
                        <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} disabled={compareIds.length >= 3 && !compareIds.includes(s.id)} aria-label={`Comparer ${s.name}`} className="accent-[#12543F]" />
                        Comparer
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryPageInner />
    </Suspense>
  );
}
