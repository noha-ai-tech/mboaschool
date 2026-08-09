"use client";

// Abonnements (Mission 08, Phase 6) — historique commercial (subscriptions,
// migration 0013), distinct de establishments.forfait (colonne technique de
// gating Pro, déjà en production, non modifiée). Aucun paiement intégré ici
// (Phase 7, exclusion explicite) : uniquement dates et historique.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CreditCard, ArrowRight } from "lucide-react";

const PLAN_LABELS: Record<string, { label: string; cls: string }> = {
  decouverte: { label: "Découverte", cls: "text-slate-600 bg-slate-100 border-slate-200" },
  verifiee:   { label: "Vérifiée",   cls: "text-blue-700 bg-blue-50 border-blue-200" },
  pro:        { label: "Écoles237 Pro", cls: "text-yellow-700 bg-yellow-50 border-yellow-200" },
};

export default function AdminAbonnementsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("subscriptions")
      .select("*, establishments(id, name, city)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setSubs(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <CreditCard size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Abonnements</h1>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Historique des offres commerciales (Découverte / Vérifiée / Écoles237 Pro). Le changement
        d&apos;offre se fait depuis la fiche de chaque établissement. Aucun paiement n&apos;est
        intégré dans cette version — voir la page Paiements pour l&apos;architecture préparée.
      </p>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : <><span className="text-emerald-600">{subs.length}</span> abonnement{subs.length !== 1 ? "s" : ""}</>}
          </p>
        </div>
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse" />)}</div>
        ) : subs.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucun abonnement enregistré</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {subs.map((s) => {
              const plan = PLAN_LABELS[s.plan] ?? { label: s.plan, cls: "text-slate-600 bg-slate-50 border-slate-200" };
              return (
                <Link
                  key={s.id}
                  href={`/dashboard/admin/ecoles/${s.establishments?.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0a0a0a] truncate">{s.establishments?.name ?? "—"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Activé le {new Date(s.started_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      {s.expires_at && ` · Expire le ${new Date(s.expires_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${plan.cls}`}>{plan.label}</span>
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
