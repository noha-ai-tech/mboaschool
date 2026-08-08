"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ChevronRight, Inbox } from "lucide-react";

type ClaimRow = {
  id: string;
  status: "new" | "in_review" | "accepted" | "rejected";
  first_name: string;
  last_name: string;
  role_title: string;
  created_at: string;
  establishments: { name: string; city: string } | null;
};

const TABS: { key: ClaimRow["status"]; label: string }[] = [
  { key: "new", label: "Nouvelle" },
  { key: "in_review", label: "En cours" },
  { key: "accepted", label: "Acceptée" },
  { key: "rejected", label: "Refusée" },
];

export default function VerificationsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ClaimRow["status"]>("new");

  useEffect(() => {
    supabase
      .from("establishment_claims")
      .select("id, status, first_name, last_name, role_title, created_at, establishments(name, city)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setClaims((data as unknown as ClaimRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = claims.filter((c) => c.status === activeTab);
  const countFor = (status: ClaimRow["status"]) => claims.filter((c) => c.status === status).length;

  return (
    <div className="min-h-screen bg-[#f9f7f2] p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors mb-6">
          <ArrowLeft size={15} />
          Retour à l&apos;admin
        </Link>

        <h1 className="text-2xl font-black text-[#0a0a0a] mb-1">Demandes de vérification</h1>
        <p className="text-sm text-slate-500 mb-6">Revendications d&apos;établissements en attente de traitement.</p>

        <div className="flex items-center gap-1 mb-6 border-b border-[#ebebeb]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "border-[#0a0a0a] text-[#0a0a0a]"
                  : "border-transparent text-slate-400 hover:text-[#0a0a0a]"
              }`}
            >
              {tab.label}
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
                {countFor(tab.key)}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white border border-[#ebebeb] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-[#ebebeb] rounded-2xl py-16 text-center">
            <Inbox size={28} className="mx-auto text-slate-200 mb-4" />
            <p className="text-sm font-semibold text-slate-400">Aucune demande dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((claim) => (
              <Link
                key={claim.id}
                href={`/dashboard/admin/verifications/${claim.id}`}
                className="flex items-center justify-between bg-white border border-[#ebebeb] rounded-2xl p-5 hover:border-[#ccc] transition-colors"
              >
                <div>
                  <p className="font-bold text-[#0a0a0a]">{claim.establishments?.name ?? "Établissement inconnu"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {claim.establishments?.city} · Demandé par {claim.first_name} {claim.last_name} ({claim.role_title})
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-400">
                    {new Date(claim.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </span>
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
