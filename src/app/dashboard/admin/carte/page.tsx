"use client";

// Carte nationale (Sprint K, section 9) — répartition régionale réelle,
// construite depuis establishments.region (colonne réelle, peuplée : voir
// audit Sprint K) et establishment_claims. Volontairement PAS une carte SVG
// interactive ("Pas de carte interactive complexe") : une liste de régions
// triée par nombre d'établissements, avec barres de proportion — même
// grammaire visuelle que Statistiques (Répartition par région), au niveau
// national plutôt que par établissement.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MapPin, School, CheckCircle2, ClipboardCheck } from "lucide-react";

type RegionRow = { region: string; schools: number; verified: number; claims: number };

export default function AdminCartePage() {
  const [rows, setRows] = useState<RegionRow[]>([]);
  const [totalSchools, setTotalSchools] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [schoolsRes, claimsRes] = await Promise.all([
      supabase.from("establishments").select("id, region, is_verified"),
      supabase.from("establishment_claims").select("id, establishments(region)"),
    ]);

    const map = new Map<string, RegionRow>();
    (schoolsRes.data ?? []).forEach((s: any) => {
      const key = s.region || "Non précisée";
      const row = map.get(key) ?? { region: key, schools: 0, verified: 0, claims: 0 };
      row.schools += 1;
      if (s.is_verified) row.verified += 1;
      map.set(key, row);
    });
    (claimsRes.data ?? []).forEach((c: any) => {
      const key = c.establishments?.region || "Non précisée";
      const row = map.get(key) ?? { region: key, schools: 0, verified: 0, claims: 0 };
      row.claims += 1;
      map.set(key, row);
    });

    setRows(Array.from(map.values()).sort((a, b) => b.schools - a.schools));
    setTotalSchools(schoolsRes.data?.length ?? 0);
    setLoading(false);
  }

  const maxSchools = Math.max(1, ...rows.map((r) => r.schools));

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <MapPin size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Centre national de pilotage</p>
          <h1 className="text-3xl font-black tracking-tight text-text-primary">Carte nationale</h1>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Répartition des établissements par région. Composant préparé pour une future carte interactive
        du Cameroun — cette version présente les mêmes données sous forme de liste, sans logique
        supplémentaire.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-border rounded-xl p-5">
          <School size={16} className="text-emerald-600 mb-2" />
          <p className="text-2xl font-black text-text-primary">{rows.length}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Régions couvertes</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <CheckCircle2 size={16} className="text-emerald-600 mb-2" />
          <p className="text-2xl font-black text-text-primary">{rows.reduce((a, r) => a + r.verified, 0)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Établissements vérifiés</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <ClipboardCheck size={16} className="text-emerald-600 mb-2" />
          <p className="text-2xl font-black text-text-primary">{rows.reduce((a, r) => a + r.claims, 0)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Revendications au total</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : <>{totalSchools} établissement{totalSchools !== 1 ? "s" : ""} référencé{totalSchools !== 1 ? "s" : ""}</>}
          </p>
        </div>
        {loading ? (
          <div className="p-6 space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <MapPin size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucune donnée régionale</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {rows.map((r) => (
              <div key={r.region}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-text-primary">{r.region}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{r.verified} vérifié{r.verified !== 1 ? "s" : ""}</span>
                    <span>{r.claims} revendication{r.claims !== 1 ? "s" : ""}</span>
                    <span className="font-bold text-text-primary">{r.schools}</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-full h-2.5">
                  <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${(r.schools / maxSchools) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
