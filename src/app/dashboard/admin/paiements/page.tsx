"use client";

// Paiements (Mission 08, Phase 7) — architecture uniquement. La table
// platform_payments (migration 0013) n'a aucune policy INSERT/UPDATE : rien
// ne peut l'alimenter avant qu'un fournisseur (MTN MoMo / Orange Money) soit
// réellement branché, hors périmètre de cette mission. Cette page est donc
// volontairement en lecture seule et vide en V1.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Wallet, Smartphone } from "lucide-react";

export default function AdminPaiementsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("platform_payments")
      .select("*, establishments(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPayments(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <Wallet size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Paiements</h1>
        </div>
      </div>

      <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 mb-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-slate-300" />
        </div>
        <div>
          <p className="font-bold text-sm text-slate-500 mb-1">Architecture préparée, aucun fournisseur connecté</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            La table <code className="bg-slate-100 px-1 rounded">platform_payments</code> (référence, montant,
            devise, statut, fournisseur) est prête à recevoir des transactions MTN Mobile Money et Orange Money —
            aucune API de paiement n&apos;est branchée dans cette version. Cette page restera vide tant que
            l&apos;intégration réelle n&apos;est pas construite (mission dédiée).
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : <><span className="text-emerald-600">{payments.length}</span> transaction{payments.length !== 1 ? "s" : ""}</>}
          </p>
        </div>
        {!loading && payments.length === 0 && (
          <div className="py-16 text-center">
            <Wallet size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucune transaction — architecture non connectée</p>
          </div>
        )}
      </div>
    </div>
  );
}
