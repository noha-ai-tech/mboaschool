"use client";

// CRM commercial (Mission 08, Phase 5) — vue d'ensemble du pipeline commercial
// sur tous les établissements. L'édition (changer le statut, ajouter un
// commentaire) se fait depuis la fiche établissement
// (/dashboard/admin/ecoles/[id]), qui reste la seule surface d'écriture —
// cette page est une vue de pilotage, pas un doublon du formulaire.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Users2, ArrowRight, Search } from "lucide-react";

const CRM_LABELS: Record<string, { label: string; cls: string }> = {
  prospect:      { label: "Prospect",      cls: "text-slate-600 bg-slate-100 border-slate-200" },
  contacte:      { label: "Contacté",      cls: "text-blue-700 bg-blue-50 border-blue-200" },
  demonstration: { label: "Démonstration", cls: "text-purple-700 bg-purple-50 border-purple-200" },
  essai:         { label: "Essai",         cls: "text-orange-700 bg-orange-50 border-orange-200" },
  client:        { label: "Client",        cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  suspendu:      { label: "Suspendu",      cls: "text-red-700 bg-red-50 border-red-200" },
  resilie:       { label: "Résilié",       cls: "text-slate-500 bg-slate-50 border-slate-200" },
};

export default function AdminCrmPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, establishment_crm(status, next_followup_date, assigned_admin_id)")
      .order("name", { ascending: true });
    if (data) setRows(data);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const crmStatus = r.establishment_crm?.[0]?.status ?? "prospect";
      if (statusFilter !== "all" && crmStatus !== statusFilter) return false;
      if (query && !`${r.name} ${r.city}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  const counts = Object.keys(CRM_LABELS).reduce((acc, k) => {
    acc[k] = rows.filter((r) => (r.establishment_crm?.[0]?.status ?? "prospect") === k).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <Users2 size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">CRM commercial</h1>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 flex-1">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un établissement…"
            className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${statusFilter === "all" ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5]"}`}
        >
          Tous <span className="ml-1.5 opacity-60">{rows.length}</span>
        </button>
        {Object.entries(CRM_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStatusFilter(k)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${statusFilter === k ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5]"}`}
          >
            {v.label} <span className="ml-1.5 opacity-60">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center"><p className="text-sm text-slate-400">Aucun établissement</p></div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {filtered.map((r) => {
              const crm = r.establishment_crm?.[0];
              const status = CRM_LABELS[crm?.status ?? "prospect"];
              return (
                <Link
                  key={r.id}
                  href={`/dashboard/admin/ecoles/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0a0a0a] truncate">{r.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.city || "—"}
                      {crm?.next_followup_date && ` · Relance : ${new Date(crm.next_followup_date).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.cls}`}>{status.label}</span>
                  <ArrowRight size={14} className="text-slate-300 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
