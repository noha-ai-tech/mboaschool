"use client";

// Journal d'audit (Mission 08, Phase 9) — lecture seule. platform_audit_log
// est append-only (migration 0013) : aucune policy INSERT/UPDATE/DELETE
// côté client, la seule voie d'écriture est log_platform_action() (RPC
// security definer). "Connexion" est prévue dans les actions possibles mais
// jamais émise en V1 — nécessiterait un Auth Hook Supabase, hors périmètre.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { History, Search } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  school_verified: "École vérifiée",
  school_suspended: "École suspendue",
  school_reactivated: "École réactivée",
  subscription_changed: "Offre modifiée",
  admin_created: "Administrateur créé",
  admin_role_changed: "Rôle administrateur modifié",
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    supabase
      .from("platform_audit_log")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setLogs(data ?? []);
        setLoading(false);
      });
  }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (query && !JSON.stringify(l).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [logs, query, actionFilter]);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <History size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Journal d&apos;audit</h1>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 flex-1">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="bg-transparent outline-none text-sm flex-1" />
        </div>
        {actions.length > 0 && (
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="all">Toutes les actions</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : <><span className="text-emerald-600">{filtered.length}</span> entrée{filtered.length !== 1 ? "s" : ""}</>}
          </p>
        </div>
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <History size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucune entrée — aucune action sensible enregistrée pour l&apos;instant</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-6 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0a0a0a]">{ACTION_LABELS[l.action] ?? l.action}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Par {l.profiles?.full_name ?? "—"} · {l.target_type ?? "—"}
                    {l.metadata && Object.keys(l.metadata).length > 0 && ` · ${JSON.stringify(l.metadata)}`}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(l.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
