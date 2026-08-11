"use client";

import { Search, X, Navigation, ArrowRight } from "lucide-react";

const RADIUS_OPTIONS = ["5", "10", "20", "50"];

type CategoryOption = { key: string; label: string };

export function HeroSearch({
  totalCount,
  query,
  onQueryChange,
  activeCategory,
  onCategoryChange,
  categories,
  city,
  onCityChange,
  cities,
  radius,
  onRadiusChange,
  onLocate,
  locating,
  onSearch,
}: {
  totalCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  categories: CategoryOption[];
  city: string;
  onCityChange: (value: string) => void;
  cities: string[];
  radius: string;
  onRadiusChange: (value: string) => void;
  onLocate: () => void;
  locating: boolean;
  /** Navigue vers la page de résultats (/recherche) avec les filtres actuels — jamais un scroll d'ancre local. */
  onSearch: () => void;
}) {
  return (
    <div className="w-full lg:w-[32%] shrink-0 flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold leading-tight text-text-primary">
          Trouvez l&apos;école idéale pour votre enfant.
        </h1>
        <p className="text-sm text-text-secondary mt-2">
          Plus de {totalCount.toLocaleString("fr-FR")} établissement{totalCount !== 1 ? "s" : ""} référencé
          {totalCount !== 1 ? "s" : ""} dans tout le Cameroun.
        </p>
      </div>

      <div className="flex items-center gap-2 bg-muted border border-border rounded-[10px] px-4 h-12 focus-within:border-primary transition-colors duration-base">
        <Search size={16} className="text-text-secondary shrink-0" />
        <input
          className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-text-secondary"
          placeholder="Nom, ville, niveau…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
        />
        {query && (
          <button onClick={() => onQueryChange("")} className="text-text-secondary hover:text-text-primary" aria-label="Effacer">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={activeCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="min-w-0 border border-border rounded-[10px] px-3 h-10 text-[13px] font-medium bg-surface focus:outline-none focus:border-primary transition-colors duration-base"
        >
          <option value="all">Toutes catégories</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="min-w-0 border border-border rounded-[10px] px-3 h-10 text-[13px] font-medium bg-surface focus:outline-none focus:border-primary transition-colors duration-base"
        >
          {cities.map((c) => (
            <option key={c} value={c}>{c === "all" ? "Toutes les villes" : c}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={radius}
          onChange={(e) => onRadiusChange(e.target.value)}
          className="flex-1 min-w-0 border border-border rounded-[10px] px-3 h-10 text-[13px] font-medium bg-surface focus:outline-none focus:border-primary transition-colors duration-base"
          aria-label="Rayon de recherche"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>Rayon {r} km</option>
          ))}
        </select>
        <button
          onClick={onLocate}
          disabled={locating}
          aria-label="Me localiser"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-[10px] border border-border text-text-secondary hover:text-text-primary hover:bg-muted transition-colors duration-base disabled:opacity-50"
        >
          <Navigation size={15} />
        </button>
      </div>

      <button
        onClick={onSearch}
        className="group inline-flex items-center justify-center gap-2 w-full h-12 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white font-semibold text-sm hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
      >
        Rechercher
        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-base" />
      </button>
    </div>
  );
}
