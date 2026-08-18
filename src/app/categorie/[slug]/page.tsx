"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, MapPin, CheckCircle2, Crown, ChevronRight, ChevronLeft,
  Search, X, ArrowRight, School,
} from "lucide-react";
import { CAT_META } from "./catMeta";
import { includesInsensitive } from "@/lib/textSearch";

// ─── Config ──────────────────────────────────────────────────────────────────

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=900&q=80";

// ─── Main page ────────────────────────────────────────────────────────────────

function CategoryPageInner() {
  const { slug } = useParams() as { slug: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeSub = searchParams.get("sous") ?? "all";

  const meta = CAT_META[slug];
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!meta) return;
    setLoading(true);
    supabase
      .from("establishments")
      .select(`
        id, name, main_category, sub_category,
        city, neighborhood, cover_image_url,
        is_verified, is_featured, subscription_plan,
        fees(registration_fee, tuition_fee)
      `)
      .eq("main_category", slug)
      .order("is_featured", { ascending: false })
      .then(({ data }) => {
        if (data) setSchools(data);
        setLoading(false);
      });
  }, [slug]);

  if (!meta) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 font-semibold">Catégorie introuvable.</p>
          <Link href="/" className="text-sm text-emerald-700 font-semibold mt-3 block">← Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  const { label, description, icon: CatIcon, color, subcategories } = meta;

  // Subcategory counts — combine predefined + DB values
  const dbSubcats = Array.from(new Set(schools.map((s) => s.sub_category).filter(Boolean)));
  const allSubcats = Array.from(new Set([...subcategories, ...dbSubcats]));

  const subcatCounts: Record<string, number> = {};
  allSubcats.forEach((sub) => {
    subcatCounts[sub] = schools.filter(
      (s) => (s.sub_category ?? "").toLowerCase() === sub.toLowerCase()
    ).length;
  });

  // "Mis en avant" = uniquement is_featured (signal commercial réel, distinct
  // de la vérification). Vérifié reste un badge indépendant affiché sur
  // n'importe quelle carte, organique ou mise en avant — jamais fusionnés
  // (voir docs/03_DESIGN_SYSTEM, hiérarchie commerciale organic/verified/sponsored).
  const featured = schools.filter((s) => s.is_featured);

  // Filtered list
  const filtered = schools.filter((s) => {
    if (activeSub !== "all" && (s.sub_category ?? "").toLowerCase() !== activeSub.toLowerCase()) return false;
    if (query && !includesInsensitive(`${s.name} ${s.city ?? ""} ${s.neighborhood ?? ""} ${s.sub_category ?? ""}`, query)) {
      return false;
    }
    return true;
  });

  function setSubcat(sub: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sub === "all") params.delete("sous");
    else params.set("sous", sub);
    router.replace(`/categorie/${slug}?${params.toString()}`);
  }

  function scrollCarousel(dir: "left" | "right") {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2]">

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="bg-[#0a0f0d] text-white">
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors mb-10">
            <ArrowLeft size={15} /> Accueil
          </Link>

          <div className="flex items-start gap-5">
            <div className={`shrink-0 w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center ${color}`}>
              <CatIcon size={26} />
            </div>
            <div>
              <p className={`text-[11px] font-bold tracking-widest uppercase mb-2 ${color}`}>Catégorie</p>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-3">{label}</h1>
              <p className="text-slate-400 text-sm max-w-xl">{description}</p>
              <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                <span>
                  <span className="text-white font-black text-2xl">{loading ? "—" : schools.length}</span>
                  <span className="ml-1.5">établissement{schools.length !== 1 ? "s" : ""}</span>
                </span>
                {featured.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Crown size={12} className="text-yellow-400" />
                    {featured.length} mis en avant
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">

        {/* ── CAROUSEL VEDETTES ─────────────────────────────────── */}
        {(loading || featured.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg text-[#0a0a0a]">
                Établissements à découvrir
              </h2>
              <div className="flex gap-2">
                <button onClick={() => scrollCarousel("left")}
                  className="w-8 h-8 rounded-full border border-[#e5e5e5] bg-white flex items-center justify-center hover:border-[#aaa] transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => scrollCarousel("right")}
                  className="w-8 h-8 rounded-full border border-[#e5e5e5] bg-white flex items-center justify-center hover:border-[#aaa] transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
              style={{ scrollbarWidth: "none" }}
            >
              {loading
                ? [1, 2, 3].map((i) => (
                    <div key={i} className="shrink-0 w-72 h-52 bg-white border border-[#ebebeb] rounded-2xl animate-pulse snap-start" />
                  ))
                : featured.map((s) => (
                    <Link
                      key={s.id}
                      href={`/ecole/${s.id}`}
                      className="group shrink-0 w-72 snap-start bg-white border border-[#ebebeb] rounded-2xl overflow-hidden hover:border-[#ccc] hover:shadow-md transition-all"
                    >
                      <div className="relative h-36 overflow-hidden">
                        <img
                          src={s.cover_image_url ?? PLACEHOLDER}
                          alt={s.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <span className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-white/90 px-2 py-0.5 rounded-full">
                          <Crown size={8} /> Mis en avant
                        </span>
                        {s.is_verified && (
                          <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-semibold text-emerald-900 bg-emerald-300 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={8} /> Vérifié
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-sm text-[#0a0a0a] truncate">{s.name}</p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <MapPin size={10} /> {s.city || "—"}
                        </p>
                      </div>
                    </Link>
                  ))}
            </div>
          </section>
        )}

        {/* ── SOUS-CATÉGORIES ────────────────────────────────────── */}
        <section>
          <h2 className="font-black text-lg text-[#0a0a0a] mb-4">Explorer par sous-catégorie</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* "Toutes" card */}
            <button
              onClick={() => setSubcat("all")}
              className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all ${
                activeSub === "all"
                  ? "bg-[#0a0f0d] text-white border-[#0a0f0d]"
                  : "bg-white border-[#ebebeb] hover:border-[#aaa]"
              }`}
            >
              <CatIcon size={20} className={activeSub === "all" ? color : "text-slate-300"} />
              <p className="font-black text-sm mt-3">Toutes</p>
              <p className={`text-xs mt-1 font-semibold ${activeSub === "all" ? "text-slate-300" : "text-slate-400"}`}>
                {loading ? "…" : schools.length} école{schools.length !== 1 ? "s" : ""}
              </p>
            </button>

            {allSubcats.map((sub) => {
              const count = subcatCounts[sub] ?? 0;
              const active = activeSub === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSubcat(sub)}
                  className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all ${
                    active
                      ? "bg-[#0a0f0d] text-white border-[#0a0f0d]"
                      : "bg-white border-[#ebebeb] hover:border-[#aaa]"
                  }`}
                >
                  <span className={`text-2xl font-black ${active ? "text-white" : "text-[#0a0a0a]"}`}>
                    {loading ? "—" : count}
                  </span>
                  <p className={`font-semibold text-sm mt-2 ${active ? "text-white" : "text-[#0a0a0a]"}`}>{sub}</p>
                  <p className={`text-xs mt-0.5 ${active ? "text-slate-300" : "text-slate-400"}`}>
                    école{count !== 1 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── LISTE DES ÉCOLES ───────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="font-black text-lg text-[#0a0a0a]">
              {activeSub === "all" ? "Tous les établissements" : activeSub}
              <span className="ml-2 text-sm font-semibold text-slate-400">
                ({loading ? "…" : filtered.length})
              </span>
            </h2>
            <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-3 py-2 focus-within:border-[#aaa] transition-colors">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="bg-transparent outline-none text-sm w-36 placeholder-slate-400"
              />
              {query && (
                <button onClick={() => setQuery("")}><X size={12} className="text-slate-400" /></button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-56 bg-white border border-[#ebebeb] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-[#ebebeb] rounded-2xl py-20 text-center">
              <School size={32} className="mx-auto text-slate-200 mb-4" />
              <p className="font-semibold text-slate-400 text-sm">Aucun établissement trouvé</p>
              {activeSub !== "all" && (
                <button onClick={() => setSubcat("all")} className="text-xs text-emerald-700 font-semibold mt-3 block mx-auto">
                  Voir tous les établissements →
                </button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((s) => {
                const tuition = s.fees?.[0]?.tuition_fee ?? 0;
                return (
                  <Link
                    key={s.id}
                    href={`/ecole/${s.id}`}
                    className="group bg-white border border-[#ebebeb] rounded-2xl overflow-hidden hover:border-[#ccc] hover:shadow-sm transition-all"
                  >
                    {/* Image */}
                    <div className="relative h-40 overflow-hidden bg-slate-100">
                      <img
                        src={s.cover_image_url ?? PLACEHOLDER}
                        alt={s.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute bottom-3 left-3 flex gap-1.5">
                        {s.is_featured && (
                          <span className="text-[9px] font-bold text-slate-700 bg-white/90 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Crown size={8} /> Mis en avant
                          </span>
                        )}
                        {s.is_verified && (
                          <span className="text-[9px] font-semibold text-emerald-900 bg-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={8} /> Vérifié
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <p className="font-bold text-[#0a0a0a] truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin size={10} />
                        {s.city || "—"}{s.neighborhood ? `, ${s.neighborhood}` : ""}
                      </p>
                      {s.sub_category && (
                        <span className="inline-block mt-2 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {s.sub_category}
                        </span>
                      )}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f5f5f5]">
                        {tuition > 0 ? (
                          <p className="text-xs text-slate-500">
                            <span className="font-black text-[#0a0a0a]">{tuition.toLocaleString("fr-FR")}</span>
                            <span className="ml-1">FCFA/an</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">Frais non renseignés</p>
                        )}
                        <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 group-hover:gap-2 transition-all">
                          Voir <ArrowRight size={11} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

      </div>
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
