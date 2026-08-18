"use client";

// Centre de revue du registre national (SPRINT P.3). Transforme les lignes
// de establishment_import_staging (migration 0006, RLS platform_admin) en
// lots de décision — jamais une promotion automatique. Aucune écriture dans
// `establishments` depuis cette page : les actions ("Approuver", "Lier",
// "Exclure"...) ne modifient que `establishment_import_staging` (status +
// raw_data._review), via les mêmes policies RLS "for all" déjà en place
// pour platform_admin — pas besoin de service-role côté client.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CANONICAL_REGIONS, GRAND_NORD, ZONE_ANGLOPHONE, normalizeRegionCasing } from "@/lib/cameroonRegions";
import {
  Building2,
  Link2,
  Sparkles,
  AlertTriangle,
  Search,
  History,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Layers,
  ShieldCheck,
} from "lucide-react";

type MatchType =
  | "EXISTING_OFFICIAL_ID"
  | "EXISTING_LEGACY_CONFIRMED"
  | "EXISTING_PROBABLE"
  | "REVIEW_REQUIRED"
  | "NEW_CANDIDATE";

type LocalityStatus = "VALID" | "MISSING" | "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW";

type ReviewAction = "approved_for_promotion" | "link_existing" | "keep_as_new" | "needs_more_review" | "excluded";

interface ReviewMeta {
  reviewed_by: string;
  reviewed_at: string;
  review_action: ReviewAction;
  review_note: string;
}

interface StagingRow {
  id: string;
  official_identifier: string | null;
  name_raw: string;
  region: string | null;
  locality: string | null;
  city: string | null;
  education_family: string | null;
  source_ministry: string | null;
  status: string;
  duplicate_of_establishment_id: string | null;
  created_at: string;
  raw_data: {
    _matchAudit?: { matchType: MatchType; matchReason: string; confidence: string };
    _localityAudit?: { rawLocality: string | null; localityStatus: LocalityStatus };
    _review?: ReviewMeta;
  } | null;
}

interface EstablishmentLite {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  main_category: string | null;
  source_ministry: string | null;
}

type MacroZone = "all" | "grand_nord" | "zone_anglophone";

type Classification =
  | "EXISTING_OFFICIAL_ID"
  | "EXISTING_LEGACY_CONFIRMED"
  | "EXISTING_PROBABLE"
  | "EXISTING_AMBIGUOUS"
  | "CLEAN_NEW_CANDIDATE"
  | "NEW_CANDIDATE_REVIEW_REQUIRED";

function classify(row: StagingRow): Classification {
  const matchType = row.raw_data?._matchAudit?.matchType;
  if (matchType === "EXISTING_OFFICIAL_ID") return "EXISTING_OFFICIAL_ID";
  if (matchType === "EXISTING_LEGACY_CONFIRMED") return "EXISTING_LEGACY_CONFIRMED";
  if (matchType === "EXISTING_PROBABLE") return "EXISTING_PROBABLE";
  if (matchType === "REVIEW_REQUIRED") return "EXISTING_AMBIGUOUS";
  const locality = row.raw_data?._localityAudit?.localityStatus;
  return locality === "CLEARLY_INVALID" || locality === "NEEDS_REVIEW" ? "NEW_CANDIDATE_REVIEW_REQUIRED" : "CLEAN_NEW_CANDIDATE";
}

async function fetchAllStaging(): Promise<StagingRow[]> {
  const all: StagingRow[] = [];
  const pageSize = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("establishment_import_staging")
      .select("id, official_identifier, name_raw, region, locality, city, education_family, source_ministry, status, duplicate_of_establishment_id, created_at, raw_data")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as StagingRow[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// SPRINT R — établissements a dépassé 1000 lignes (le plafond par défaut
// PostgREST) ; un .select() sans .range() tronquait silencieusement "Déjà
// liés" et les KPIs live. Paginé pour la même raison que fetchAllStaging.
async function fetchAllEstablishments(): Promise<EstablishmentLite[]> {
  const all: EstablishmentLite[] = [];
  const pageSize = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("establishments")
      .select("id, name, region, city, main_category, source_ministry")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as EstablishmentLite[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "new", label: "Nouveaux candidats" },
  { key: "matches", label: "Correspondances" },
  { key: "review", label: "À revoir" },
  { key: "history", label: "Historique" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function RegistreNationalPage() {
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Nouveaux candidats — recherche/filtres/sélection
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [macroZoneFilter, setMacroZoneFilter] = useState<MacroZone>("all");
  const [localityQualityFilter, setLocalityQualityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [staging, establishmentsData] = await Promise.all([fetchAllStaging(), fetchAllEstablishments()]);
      setRows(staging);
      setEstablishments(establishmentsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du chargement");
    }
    setLoading(false);
  }

  const establishmentsById = useMemo(() => new Map(establishments.map((e) => [e.id, e])), [establishments]);

  const classified = useMemo(() => rows.map((row) => ({ row, classification: classify(row) })), [rows]);

  const counts = useMemo(() => {
    const c: Record<Classification, number> = {
      EXISTING_OFFICIAL_ID: 0,
      EXISTING_LEGACY_CONFIRMED: 0,
      EXISTING_PROBABLE: 0,
      EXISTING_AMBIGUOUS: 0,
      CLEAN_NEW_CANDIDATE: 0,
      NEW_CANDIDATE_REVIEW_REQUIRED: 0,
    };
    for (const c2 of classified) c[c2.classification]++;
    return c;
  }, [classified]);

  const linkedExisting = counts.EXISTING_OFFICIAL_ID + counts.EXISTING_LEGACY_CONFIRMED;
  const needsReview = counts.EXISTING_PROBABLE + counts.EXISTING_AMBIGUOUS + counts.NEW_CANDIDATE_REVIEW_REQUIRED;

  // ── SPRINT R §34 — KPIs nationaux réels (jamais de chiffre inventé) ──────
  const nationalKpis = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return {
      totalMinesecStaging: rows.length,
      live: establishments.filter((e) => e.source_ministry === "MINESEC").length,
      staging: rows.length,
      promoted: byStatus.promoted ?? 0,
      ready: byStatus.ready ?? 0,
      review: (byStatus.duplicate_review ?? 0) + counts.NEW_CANDIDATE_REVIEW_REQUIRED,
      duplicate: byStatus.duplicate_exact ?? 0,
    };
  }, [rows, establishments, counts]);

  // ── Nouveaux candidats (propres + à revoir) ──────────────────────────────
  const newCandidates = useMemo(
    () => classified.filter((c) => c.classification === "CLEAN_NEW_CANDIDATE" || c.classification === "NEW_CANDIDATE_REVIEW_REQUIRED"),
    [classified]
  );
  // SPRINT R §29 — les 10 régions canoniques toujours proposées au filtre
  // (pas seulement celles présentes dans le lot courant de candidats).
  const regions = CANONICAL_REGIONS;
  const categories = useMemo(() => Array.from(new Set(newCandidates.map((c) => c.row.education_family).filter(Boolean))).sort() as string[], [newCandidates]);
  const sources = useMemo(() => Array.from(new Set(newCandidates.map((c) => c.row.source_ministry).filter(Boolean))).sort() as string[], [newCandidates]);

  const filteredNewCandidates = useMemo(() => {
    return newCandidates.filter((c) => {
      // region en staging reste en casse brute source (ex. "SUD") — comparaison canonique.
      if (regionFilter !== "all" && normalizeRegionCasing(c.row.region) !== regionFilter) return false;
      if (categoryFilter !== "all" && c.row.education_family !== categoryFilter) return false;
      if (sourceFilter !== "all" && c.row.source_ministry !== sourceFilter) return false;
      if (macroZoneFilter !== "all") {
        const canonical = normalizeRegionCasing(c.row.region);
        const zoneRegions: readonly string[] = macroZoneFilter === "grand_nord" ? GRAND_NORD : ZONE_ANGLOPHONE;
        if (!canonical || !zoneRegions.includes(canonical)) return false;
      }
      if (localityQualityFilter !== "all") {
        const quality = c.row.raw_data?._localityAudit?.localityStatus ?? "MISSING";
        if (quality !== localityQualityFilter) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        if (!`${c.row.name_raw} ${c.row.official_identifier ?? ""} ${c.row.locality ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [newCandidates, regionFilter, categoryFilter, sourceFilter, macroZoneFilter, localityQualityFilter, query]);

  const doubtfulMatches = useMemo(
    () => classified.filter((c) => c.classification === "EXISTING_PROBABLE" || c.classification === "EXISTING_AMBIGUOUS"),
    [classified]
  );
  const reviewRequired = useMemo(() => classified.filter((c) => c.classification === "NEW_CANDIDATE_REVIEW_REQUIRED"), [classified]);
  const history = useMemo(() => classified.filter((c) => c.row.raw_data?._review), [classified]);

  // ── Actions d'écriture — staging uniquement, jamais establishments ──────
  async function writeReview(id: string, action: ReviewAction, note: string) {
    setBusyIds((s) => new Set(s).add(id));
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const nextRawData = {
      ...row.raw_data,
      _review: {
        reviewed_by: "admin:review-center",
        reviewed_at: new Date().toISOString(),
        review_action: action,
        review_note: note,
      } satisfies ReviewMeta,
    };
    const { error: updateError } = await supabase
      .from("establishment_import_staging")
      .update({ raw_data: nextRawData })
      .eq("id", id);
    setBusyIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, raw_data: nextRawData } : r)));
  }

  async function bulkAction(ids: string[], action: ReviewAction, note: string) {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await writeReview(id, action, note);
    }
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Plateforme</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Registre national</h1>
        <p className="text-sm text-slate-500 mt-1">
          {rows.length} ligne(s) importées du registre MINESEC — revue humaine avant toute promotion. Aucune action ici ne crée d&apos;établissement.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
      )}

      {/* KPI nationaux — SPRINT R §34, uniquement des chiffres réels */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
        <KpiCard icon={Building2} value={nationalKpis.totalMinesecStaging} label="Total MINESEC" />
        <KpiCard icon={ShieldCheck} value={nationalKpis.live} label="Live" />
        <KpiCard icon={Layers} value={nationalKpis.staging} label="Staging" />
        <KpiCard icon={CheckCircle2} value={nationalKpis.promoted} label="Promus" />
        <KpiCard icon={Sparkles} value={nationalKpis.ready} label="Prêts" />
        <KpiCard icon={AlertTriangle} value={nationalKpis.review} label="À vérifier" />
        <KpiCard icon={Link2} value={nationalKpis.duplicate} label="Doublons" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#ebebeb] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key ? "border-[#0a0a0a] text-[#0a0a0a]" : "border-transparent text-slate-400 hover:text-[#0a0a0a]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ebebeb]">
            <p className="text-sm font-semibold">Répartition des {rows.length} lignes</p>
          </div>
          <div className="divide-y divide-[#f5f5f5]">
            <OverviewRow label="Déjà liés — matricule officiel exact" value={counts.EXISTING_OFFICIAL_ID} tone="linked" />
            <OverviewRow label="Déjà liés — correspondance historique confirmée" value={counts.EXISTING_LEGACY_CONFIRMED} tone="linked" />
            <OverviewRow label="Correspondance probable (revue requise)" value={counts.EXISTING_PROBABLE} tone="review" />
            <OverviewRow label="Correspondance ambiguë (revue requise)" value={counts.EXISTING_AMBIGUOUS} tone="review" />
            <OverviewRow label="Nouveaux candidats propres" value={counts.CLEAN_NEW_CANDIDATE} tone="clean" />
            <OverviewRow label="Nouveaux candidats à revoir (localité)" value={counts.NEW_CANDIDATE_REVIEW_REQUIRED} tone="review" />
          </div>
        </div>
      )}

      {tab === "new" && (
        <div>
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 flex-1">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, matricule, localité…"
                className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
              />
            </div>
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="all">Toutes les régions</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="all">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={macroZoneFilter}
              onChange={(e) => setMacroZoneFilter(e.target.value as MacroZone)}
              className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white"
              title="Filtre produit — jamais une valeur de region en base"
            >
              <option value="all">Toutes macro-zones</option>
              <option value="grand_nord">Grand Nord</option>
              <option value="zone_anglophone">Zone anglophone</option>
            </select>
            <select value={localityQualityFilter} onChange={(e) => setLocalityQualityFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="all">Toute qualité localité</option>
              <option value="VALID">Localité valide</option>
              <option value="POSSIBLE_REAL_LOCALITY">Localité possible</option>
              <option value="NEEDS_REVIEW">Localité à revoir</option>
              <option value="CLEARLY_INVALID">Localité invalide</option>
              <option value="MISSING">Localité absente</option>
            </select>
            {sources.length > 1 && (
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
                <option value="all">Toutes sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-4 bg-[#0a0f0d] text-white rounded-xl px-4 py-3">
              <span className="text-sm font-semibold">{selected.size} sélectionné(s)</span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => bulkAction(Array.from(selected), "approved_for_promotion", "Approuvé en lot depuis le Registry Review Center — ne crée aucun établissement.")}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Approve for promotion
                </button>
                <button
                  onClick={() => bulkAction(Array.from(selected), "needs_more_review", "Maintenu en revue depuis le Registry Review Center.")}
                  className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Keep in review
                </button>
                <button
                  onClick={() => bulkAction(Array.from(selected), "excluded", "Exclu depuis le Registry Review Center.")}
                  className="text-xs font-bold bg-red-500/20 text-red-200 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Exclude
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ebebeb] flex items-center justify-between">
              <p className="text-sm font-semibold">{filteredNewCandidates.length} candidat(s)</p>
              <button
                onClick={() =>
                  setSelected((prev) =>
                    prev.size === filteredNewCandidates.length ? new Set() : new Set(filteredNewCandidates.map((c) => c.row.id))
                  )
                }
                className="text-xs font-semibold text-emerald-700 hover:opacity-80"
              >
                {selected.size === filteredNewCandidates.length && filteredNewCandidates.length > 0 ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-[#f5f5f5]">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Matricule</th>
                    <th className="px-4 py-3">Région</th>
                    <th className="px-4 py-3">Localité</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f5f5]">
                  {filteredNewCandidates.slice(0, 300).map((c) => {
                    const reviewAction = c.row.raw_data?._review?.review_action;
                    return (
                      <tr key={c.row.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(c.row.id)} onChange={() => toggleSelect(c.row.id)} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#0a0a0a]">{c.row.name_raw}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.row.official_identifier}</td>
                        <td className="px-4 py-3 text-slate-500">{c.row.region}</td>
                        <td className="px-4 py-3 text-slate-500">{c.row.locality || "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{c.row.education_family}</td>
                        <td className="px-4 py-3 text-slate-500">{c.row.source_ministry}</td>
                        <td className="px-4 py-3">
                          <StatusPill classification={c.classification} reviewAction={reviewAction} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredNewCandidates.length > 300 && (
                <p className="text-xs text-slate-400 text-center py-3">Affichage limité à 300 lignes — affinez la recherche/filtres pour voir le reste.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "matches" && (
        <div className="space-y-4">
          {doubtfulMatches.length === 0 ? (
            <EmptyState label="Aucune correspondance à revoir" />
          ) : (
            doubtfulMatches.map((c) => {
              const existing = c.row.duplicate_of_establishment_id ? establishmentsById.get(c.row.duplicate_of_establishment_id) : undefined;
              const busy = busyIds.has(c.row.id);
              const decided = c.row.raw_data?._review?.review_action;
              return (
                <div key={c.row.id} className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#ebebeb] flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#0a0a0a]">{c.row.name_raw}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {c.classification === "EXISTING_AMBIGUOUS" ? "Ambiguë" : "Probable"} · confiance {c.row.raw_data?._matchAudit?.confidence}
                      </p>
                    </div>
                    {decided && (
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{decided}</span>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 divide-x divide-[#f5f5f5]">
                    <div className="p-5">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-3">Staging (MINESEC)</p>
                      <CompareRow label="Nom" value={c.row.name_raw} />
                      <CompareRow label="Matricule" value={c.row.official_identifier} />
                      <CompareRow label="Région" value={c.row.region} />
                      <CompareRow label="Localité" value={c.row.locality ?? c.row.raw_data?._localityAudit?.rawLocality} />
                      <CompareRow label="Catégorie" value={c.row.education_family} />
                    </div>
                    <div className="p-5">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-3">Établissement existant</p>
                      {existing ? (
                        <>
                          <CompareRow label="Nom" value={existing.name} />
                          <CompareRow label="Région" value={existing.region} />
                          <CompareRow label="Ville" value={existing.city} />
                          <CompareRow label="Catégorie" value={existing.main_category} />
                        </>
                      ) : (
                        <p className="text-sm text-slate-400">Aucun candidat</p>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-3 bg-slate-50 text-xs text-slate-500 border-t border-[#f5f5f5]">
                    {c.row.raw_data?._matchAudit?.matchReason}
                  </div>
                  <div className="px-6 py-4 flex items-center gap-2 border-t border-[#ebebeb]">
                    <button
                      disabled={busy}
                      onClick={() => writeReview(c.row.id, "link_existing", "Décision manuelle : correspondance confirmée depuis le Registry Review Center.")}
                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 size={13} /> LINK_EXISTING
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => writeReview(c.row.id, "keep_as_new", "Décision manuelle : traité comme nouveau candidat depuis le Registry Review Center.")}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-[#ddd] px-3 py-2 rounded-lg hover:border-[#aaa] transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={13} /> KEEP_AS_NEW
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => writeReview(c.row.id, "needs_more_review", "Marqué pour revue complémentaire depuis le Registry Review Center.")}
                      className="flex items-center gap-1.5 text-xs font-bold text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      <HelpCircle size={13} /> NEEDS_MORE_REVIEW
                    </button>
                    {busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ebebeb]">
            <p className="text-sm font-semibold">{reviewRequired.length} candidat(s) à revoir — localité problématique</p>
          </div>
          {reviewRequired.length === 0 ? (
            <EmptyState label="Rien à revoir" />
          ) : (
            <div className="divide-y divide-[#f5f5f5]">
              {reviewRequired.map((c) => {
                const reason = c.row.raw_data?._localityAudit?.localityStatus === "CLEARLY_INVALID" ? "CLEARLY_INVALID_LOCALITY" : "NEEDS_REVIEW_LOCALITY";
                const busy = busyIds.has(c.row.id);
                const decided = c.row.raw_data?._review?.review_action;
                return (
                  <div key={c.row.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#0a0a0a] truncate">{c.row.name_raw}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {c.row.region} · localité brute : &quot;{c.row.raw_data?._localityAudit?.rawLocality}&quot; ·{" "}
                        <span className="font-semibold text-amber-600">{reason}</span>
                      </p>
                    </div>
                    {decided ? (
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full shrink-0">{decided}</span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          disabled={busy}
                          onClick={() => writeReview(c.row.id, "approved_for_promotion", "Localité problématique acceptée manuellement — city restera NULL, jamais la valeur invalide.")}
                          className="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          Approuver
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => writeReview(c.row.id, "excluded", "Exclu depuis la file de revue localité.")}
                          className="text-xs font-bold text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Exclure
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ebebeb] flex items-center gap-2">
            <History size={14} className="text-slate-400" />
            <p className="text-sm font-semibold">{history.length} décision(s) enregistrée(s)</p>
          </div>
          {history.length === 0 ? (
            <EmptyState label="Aucune décision encore prise" />
          ) : (
            <div className="divide-y divide-[#f5f5f5]">
              {history.map((c) => {
                const review = c.row.raw_data!._review!;
                return (
                  <div key={c.row.id} className="px-6 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[#0a0a0a]">{c.row.name_raw}</p>
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{review.review_action}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {review.reviewed_by} · {new Date(review.reviewed_at).toLocaleString("fr-FR")}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{review.review_note}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
      <Icon size={16} className="text-emerald-600 mb-3" />
      <p className="text-2xl font-black text-[#0a0a0a]">{value.toLocaleString("fr-FR")}</p>
      <p className="text-xs text-slate-400 font-medium mt-1">{label}</p>
    </div>
  );
}

function OverviewRow({ label, value, tone }: { label: string; value: number; tone: "linked" | "review" | "clean" }) {
  const cls =
    tone === "linked" ? "text-slate-600 bg-slate-100" : tone === "clean" ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50";
  return (
    <div className="flex items-center justify-between px-6 py-3.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>{value.toLocaleString("fr-FR")}</span>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="font-semibold text-[#0a0a0a] text-right truncate">{value || "—"}</span>
    </div>
  );
}

function StatusPill({ classification, reviewAction }: { classification: Classification; reviewAction?: ReviewAction }) {
  if (reviewAction === "approved_for_promotion") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle2 size={10} /> Approuvé</span>;
  }
  if (reviewAction === "excluded") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-full"><XCircle size={10} /> Exclu</span>;
  }
  if (classification === "NEW_CANDIDATE_REVIEW_REQUIRED") {
    return <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">À revoir</span>;
  }
  return <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">En attente</span>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}
