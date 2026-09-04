"use client";

import { Search, X, Navigation, ArrowRight } from "lucide-react";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";

const RADIUS_OPTIONS = ["5", "10", "20", "50"];

type CategoryOption = { key: string; label: string };
type RegionOption = { value: string; label: string };

// Formulaire de recherche du Hero — plus de titre/sous-titre internes (Landing
// V6 : le titre "Trouvez l'école idéale..." vit désormais directement dans le
// panneau du Hero, au-dessus de ce formulaire, pas dans ce composant). Deux
// tons : "light" (fond clair) et "dark" (carte vert foncé actuelle — champs
// blancs opaques, comme la maquette de référence, pas de verre translucide).
export function HeroSearch({
  query,
  onQueryChange,
  activeCategory,
  onCategoryChange,
  categories,
  region,
  onRegionChange,
  regions,
  city,
  onCityChange,
  cities,
  radius,
  onRadiusChange,
  onLocate,
  locating,
  onSearch,
  tone = "dark",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  categories: CategoryOption[];
  region: string;
  onRegionChange: (value: string) => void;
  regions: RegionOption[];
  city: string;
  onCityChange: (value: string) => void;
  cities: string[];
  radius: string;
  onRadiusChange: (value: string) => void;
  onLocate: () => void;
  locating: boolean;
  /** Navigue vers la page de résultats (/recherche) avec les filtres actuels — jamais un scroll d'ancre local. */
  onSearch: () => void;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  const fieldCls = dark
    ? "border-0 bg-white text-[#132019] placeholder:text-[#8A9691]"
    : "border border-border bg-muted text-text-primary placeholder:text-text-secondary";
  const selectCls = dark
    ? "border-0 bg-white text-[#132019]"
    : "border border-border bg-surface text-text-primary";
  const iconCls = dark ? "text-[#12543F]" : "text-text-secondary";

  return (
    <div className="w-full flex flex-col gap-3.5">
      <div className={`relative flex items-center gap-2.5 rounded-xl px-4 h-14 focus-within:border-white/40 transition-colors duration-base ${fieldCls}`}>
        <Search size={18} className={`shrink-0 ${iconCls}`} />
        <input
          className="bg-transparent outline-none text-base flex-1 min-w-0 placeholder:inherit"
          placeholder="Nom, ville, niveau…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
        />
        {query && (
          <button onClick={() => onQueryChange("")} className={dark ? "text-[#8A9691] hover:text-[#132019]" : "text-text-secondary hover:text-text-primary"} aria-label="Effacer">
            <X size={16} />
          </button>
        )}
        <SearchSuggestions query={query} onSelectCity={(selectedCity) => { onRegionChange("all"); onCityChange(selectedCity); onQueryChange(""); }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <select
          value={activeCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={`min-w-0 rounded-xl px-3.5 h-12 text-[15px] font-medium focus:outline-none transition-colors duration-base ${selectCls}`}
        >
          <option value="all" className="text-[#0a0a0a]">Toutes les catégories</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key} className="text-[#0a0a0a]">{cat.label}</option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          aria-label="Filtrer par région"
          className={`min-w-0 rounded-xl px-3.5 h-12 text-[15px] font-medium focus:outline-none transition-colors duration-base ${selectCls}`}
        >
          {regions.map((item) => (
            <option key={item.value} value={item.value} className="text-[#0a0a0a]">{item.label}</option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          aria-label="Filtrer par ville"
          className={`min-w-0 rounded-xl px-3.5 h-12 text-[15px] font-medium focus:outline-none transition-colors duration-base ${selectCls}`}
        >
          {cities.map((c) => (
            <option key={c} value={c} className="text-[#0a0a0a]">{c === "all" ? "Toutes les villes" : c}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2.5">
        <select
          value={radius}
          onChange={(e) => onRadiusChange(e.target.value)}
          className={`flex-1 min-w-0 rounded-xl px-3.5 h-12 text-[15px] font-medium focus:outline-none transition-colors duration-base ${selectCls}`}
          aria-label="Rayon de recherche"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r} className="text-[#0a0a0a]">Rayon {r} km</option>
          ))}
        </select>
        <button
          onClick={onLocate}
          disabled={locating}
          aria-label="Me localiser"
          className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-xl transition-colors duration-base disabled:opacity-50 ${
            dark ? "border border-white/20 bg-white/5 text-[#F2AE1F] hover:bg-white/10" : "border border-border text-text-secondary hover:text-text-primary hover:bg-muted"
          }`}
        >
          <Navigation size={18} />
        </button>
      </div>

      <button
        onClick={onSearch}
        className={`group inline-flex items-center justify-center gap-2 w-full h-14 rounded-xl font-bold text-base transition-all duration-base ${
          dark
            ? "bg-[#F2AE1F] text-[#0B3B2E] hover:bg-[#D6941A] hover:shadow-elevation-2 hover:-translate-y-0.5"
            : "bg-[#1F8A5D] text-white hover:bg-[#12543F] hover:shadow-elevation-2 hover:-translate-y-0.5"
        }`}
      >
        <Search size={18} />
        Rechercher
        <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-base" />
      </button>
    </div>
  );
}
