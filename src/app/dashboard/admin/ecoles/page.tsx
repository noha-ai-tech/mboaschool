"use client";

// Gestion centralisée des établissements (Mission 08, Phase 4). Remplace la
// liste qui vivait auparavant sur /dashboard/admin (Mission 01) — même
// donnée, recherche/filtres/tri en plus, actions de modération réelles.
// Aucune suppression physique : suspendre/réactiver/vérifier sont des
// changements de statut (establishments.verification_status, déjà préparé
// en migration 0008), jamais un DELETE.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  School, MapPin, Search, CheckCircle2, Crown, ArrowRight,
  ShieldOff, ShieldCheck, RotateCcw, Loader2,
} from "lucide-react";

const VERIFICATION_LABELS: Record<string, { label: string; cls: string }> = {
  referenced:      { label: "Référencée",   cls: "text-slate-600 bg-slate-100 border-slate-200" },
  claim_requested: { label: "Revendication", cls: "text-blue-700 bg-blue-50 border-blue-200" },
  under_review:    { label: "En analyse",   cls: "text-orange-700 bg-orange-50 border-orange-200" },
  verified:        { label: "Vérifiée",     cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  active:          { label: "Active",       cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  suspended:       { label: "Suspendue",    cls: "text-red-700 bg-red-50 border-red-200" },
};

type SortKey = "recent" | "name" | "city";

export default function AdminEcolesPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, region, main_category, is_verified, forfait, verification_status, created_at")
      .order("created_at", { ascending: false });
    if (data) setSchools(data);
    setLoading(false);
  }

  const regions = useMemo(
    () => Array.from(new Set(schools.map((s) => s.region).filter(Boolean))).sort(),
    [schools]
  );

  const filtered = useMemo(() => {
    let list = schools.filter((s) => {
      if (query) {
        const q = query.toLowerCase();
        if (!`${s.name} ${s.city ?? ""} ${s.main_category ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && (s.verification_status ?? "referenced") !== statusFilter) return false;
      if (planFilter !== "all" && s.forfait !== planFilter) return false;
      if (regionFilter !== "all" && s.region !== regionFilter) return false;
      return true;
    });
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "city") list = [...list].sort((a, b) => (a.city ?? "").localeCompare(b.city ?? ""));
    return list;
  }, [schools, query, statusFilter, planFilter, regionFilter, sort]);

  async function runAction(id: string, action: "verifier" | "suspendre" | "reactiver") {
    setBusyId(id);
    setActionError(null);
    const res = await fetch(`/api/admin/ecoles/${id}/${action}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setActionError(body.error ?? "Échec de l'action");
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Plateforme</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Établissements</h1>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 flex-1 focus-within:border-[#aaa] transition-colors">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, ville, catégorie…"
            className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value="all">Tous les statuts</option>
          {Object.entries(VERIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value="all">Tous les forfaits</option>
          <option value="gratuit">Gratuit</option>
          <option value="gere">Géré</option>
          <option value="pro">Pro</option>
        </select>
        {regions.length > 0 && (
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="all">Toutes les régions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value="recent">Plus récentes</option>
          <option value="name">Nom (A-Z)</option>
          <option value="city">Ville (A-Z)</option>
        </select>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : <><span className="text-emerald-600">{filtered.length}</span> établissement{filtered.length !== 1 ? "s" : ""}</>}
          </p>
        </div>

        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <School size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucun établissement trouvé</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {filtered.map((school) => {
              const status = VERIFICATION_LABELS[school.verification_status ?? "referenced"];
              const isSuspended = school.verification_status === "suspended";
              const isVerified = ["verified", "active"].includes(school.verification_status);
              return (
                <div key={school.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <School size={16} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-[#0a0a0a] truncate">{school.name}</p>
                      {school.is_verified && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                      {school.forfait === "pro" && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full shrink-0">
                          <Crown size={8} /> Pro
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <MapPin size={10} /> {school.city || "—"} · {school.region || "—"} · {school.main_category || "—"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.cls}`}>
                    {status.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isVerified && !isSuspended && (
                      <button
                        onClick={() => runAction(school.id, "verifier")}
                        disabled={busyId === school.id}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Vérifier"
                      >
                        {busyId === school.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      </button>
                    )}
                    {isSuspended ? (
                      <button
                        onClick={() => runAction(school.id, "reactiver")}
                        disabled={busyId === school.id}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Réactiver"
                      >
                        {busyId === school.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => { if (confirm(`Suspendre ${school.name} ?`)) runAction(school.id, "suspendre"); }}
                        disabled={busyId === school.id}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Suspendre"
                      >
                        {busyId === school.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                      </button>
                    )}
                    <Link
                      href={`/dashboard/admin/ecoles/${school.id}`}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors ml-1"
                    >
                      Gérer <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
