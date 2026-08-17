"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Search, CheckCircle2, ArrowRight, Building2, FilePlus2 } from "lucide-react";
import { AuthHeader } from "@/components/layout/AuthHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ClaimBranding } from "@/components/claim/ClaimBranding";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";

// Recherche nationale limitée à nom/ville : `establishments` n'a pas encore
// de colonnes région/département/arrondissement normalisées (voir le GAP
// ANALYSIS du rapport Sprint F V3) — pas de hiérarchie géographique
// hardcodée ici en attendant cette donnée réelle.
type SearchResult = {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  verified: boolean;
  ownerId: string | null;
  image: string | null;
};

type Mode = "choice" | "search" | "confirm" | "new";

export default function RevendiquerInscrirePage() {
  const [mode, setMode] = useState<Mode>("choice");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, main_category, is_verified, owner_id, cover_image_url, school_images(url)")
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20);

    setResults(
      (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        category: s.main_category ?? null,
        verified: s.is_verified ?? false,
        ownerId: s.owner_id ?? null,
        image: s.school_images?.[0]?.url ?? s.cover_image_url ?? null,
      }))
    );
    setSearching(false);
  }

  return (
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <AuthHeader />

      <div className="flex-1 flex flex-col lg:flex-row">
        <ClaimBranding />

        <div className="flex-1 flex flex-col items-center px-6 py-10 lg:py-14">
          <div className="w-full max-w-xl">

            {mode === "choice" && (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Que souhaitez-vous faire ?</h1>
                <p className="text-sm text-text-secondary mb-8">Choisissez le parcours qui correspond à votre situation.</p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setMode("search")}
                    className="group text-left bg-white border border-border rounded-[20px] p-6 hover:border-primary hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <Building2 size={22} className="text-primary mb-4" />
                    <p className="font-bold text-text-primary mb-1.5">Revendiquer un établissement existant</p>
                    <p className="text-sm text-text-secondary mb-4">Votre école est déjà référencée sur Écoles237.</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      Rechercher mon établissement
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-base" />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("new")}
                    className="group text-left bg-white border border-border rounded-[20px] p-6 hover:border-primary hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <FilePlus2 size={22} className="text-primary mb-4" />
                    <p className="font-bold text-text-primary mb-1.5">Inscrire un nouvel établissement</p>
                    <p className="text-sm text-text-secondary mb-4">Votre établissement n&apos;apparaît pas encore dans l&apos;annuaire.</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      Créer une nouvelle fiche
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-base" />
                    </span>
                  </button>
                </div>
              </>
            )}

            {mode === "search" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour
                </button>

                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Rechercher mon établissement</h1>
                <p className="text-sm text-text-secondary mb-6">Recherchez par nom ou par ville.</p>

                <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white border border-border rounded-card px-4 h-[52px] mb-6 focus-within:border-primary transition-colors duration-base">
                  <Search size={16} className="text-text-secondary shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nom de l'établissement ou ville…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-text-secondary"
                  />
                  <button type="submit" disabled={searching} className="shrink-0 text-sm font-semibold text-primary disabled:opacity-50">
                    {searching ? "Recherche…" : "Rechercher"}
                  </button>
                </form>

                {searched && !searching && results.length === 0 && (
                  <p className="text-sm text-text-secondary text-center py-8">
                    Aucun établissement trouvé pour « {query} ».
                  </p>
                )}

                <div className="space-y-3">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 bg-white border border-border rounded-[16px] p-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                        {r.image ? (
                          <Image src={r.image} alt="" fill sizes="56px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary/30 font-black text-xs">237</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-text-primary truncate">{r.name}</p>
                        <p className="text-xs text-text-secondary">{joinWithSeparator(r.city, r.category)}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {r.verified && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary-light text-primary px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={9} /> Vérifié
                            </span>
                          )}
                          <span className="text-[10px] font-semibold bg-muted text-text-secondary px-2 py-0.5 rounded-full">
                            {r.ownerId ? "Géré par l'établissement" : "Non revendiqué"}
                          </span>
                        </div>
                      </div>
                      {r.ownerId ? (
                        <span className="shrink-0 text-xs text-text-secondary">Déjà géré</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setSelected(r); setMode("confirm"); }}
                          className="shrink-0 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
                        >
                          C&apos;est mon établissement
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {mode === "confirm" && selected && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("search")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour aux résultats
                </button>

                <div className="bg-white border border-border rounded-[20px] p-6">
                  <h2 className="font-bold text-lg text-text-primary mb-4">Confirmez votre établissement</h2>
                  <div className="bg-muted rounded-[14px] p-4 space-y-2 mb-6">
                    <Row label="Nom" value={selected.name} />
                    <Row label="Ville" value={selected.city} />
                    {selected.category && <Row label="Catégorie" value={selected.category} />}
                  </div>
                  <p className="text-sm font-medium text-text-primary mb-4">
                    Confirmez-vous qu&apos;il s&apos;agit bien de votre établissement ?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setMode("search")}
                      className="h-[48px] px-5 rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
                    >
                      Ce n&apos;est pas mon établissement
                    </button>
                    <Link
                      href={`/revendiquer/${selected.id}`}
                      className="flex-1 h-[48px] flex items-center justify-center gap-2 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 transition-all duration-base"
                    >
                      Oui, revendiquer cet établissement
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {mode === "new" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour
                </button>
                <div className="bg-white border border-border rounded-[20px] p-8 text-center">
                  <FilePlus2 size={26} className="mx-auto text-text-secondary/40 mb-4" />
                  <h2 className="font-bold text-text-primary mb-2">Bientôt disponible</h2>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    La création d&apos;une nouvelle fiche établissement arrive prochainement sur Écoles237.
                  </p>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
      <span className="text-text-secondary text-sm shrink-0">{label}</span>
      <span className="font-semibold text-text-primary text-sm text-right truncate">{value ?? "—"}</span>
    </div>
  );
}
