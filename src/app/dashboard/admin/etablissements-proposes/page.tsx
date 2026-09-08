"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronRight, Inbox } from "lucide-react";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";

type RequestRow = {
  id: string;
  status: "pending" | "under_review" | "approved" | "rejected" | "duplicate";
  proposed_name: string;
  proposed_city: string | null;
  first_name: string;
  last_name: string;
  role_title: string;
  created_at: string;
};

const TABS: { key: RequestRow["status"]; label: string }[] = [
  { key: "pending", label: "Nouvelle" },
  { key: "under_review", label: "En cours" },
  { key: "approved", label: "Acceptée" },
  { key: "rejected", label: "Refusée" },
  { key: "duplicate", label: "Doublon" },
];

export default function EstablishmentCreationRequestsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RequestRow["status"]>("pending");

  useEffect(() => {
    supabase
      .from("establishment_creation_requests")
      .select("id, status, proposed_name, proposed_city, first_name, last_name, role_title, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRequests((data as unknown as RequestRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = requests.filter((r) => r.status === activeTab);
  const countFor = (status: RequestRow["status"]) => requests.filter((r) => r.status === status).length;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-black text-[#0a0a0a] mb-1">Établissements proposés</h1>
      <p className="text-sm text-slate-500 mb-6">
        Établissements absents du registre, proposés par des utilisateurs — aucune fiche publique n&apos;est créée avant approbation.
      </p>

      <div className="flex items-center gap-1 mb-6 border-b border-[#ebebeb] overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
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
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/admin/etablissements-proposes/${r.id}`}
              className="flex items-center justify-between bg-white border border-[#ebebeb] rounded-2xl p-5 hover:border-[#ccc] transition-colors"
            >
              <div>
                <p className="font-bold text-[#0a0a0a]">{r.proposed_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {joinWithSeparator(r.proposed_city, `Proposé par ${r.first_name} ${r.last_name} (${r.role_title})`)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </span>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
