"use client";

// "Mon établissement" — hub de gestion (Mission 03, Phase 2/12).
// Consolide l'accès aux pages existantes qui décrivent l'établissement
// (paramètres, frais, infrastructures, classes, paiements) sans dupliquer
// leur logique — chacune reste la source de vérité pour ses propres données.

import Link from "next/link";
import { useSchool } from "@/lib/useSchool";
import {
  Settings,
  DollarSign,
  Building2,
  GraduationCap,
  CreditCard,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

const SECTIONS = [
  { href: "/dashboard/ecole/parametres", label: "Informations & coordonnées", desc: "Nom, description, ville, téléphone, email, site web", icon: Settings },
  { href: "/dashboard/ecole/frais", label: "Frais scolaires", desc: "Inscription, scolarité, transport, cantine…", icon: DollarSign },
  { href: "/dashboard/ecole/infrastructure", label: "Infrastructures", desc: "Bibliothèque, laboratoire, cantine, internat…", icon: Building2 },
  { href: "/dashboard/ecole/classes", label: "Classes", desc: "Niveaux et classes de l'établissement", icon: GraduationCap },
  { href: "/dashboard/ecole/paiements", label: "Paiements", desc: "Suivi des règlements (bientôt disponible)", icon: CreditCard },
];

export default function MonEtablissementPage() {
  const { school, loading } = useSchool();

  if (loading) {
    return <div className="max-w-3xl space-y-4 animate-pulse">
      <div className="h-8 bg-white rounded-xl w-1/3" />
      <div className="h-40 bg-white rounded-2xl" />
    </div>;
  }

  if (!school) return null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Mon établissement</h1>
        </div>
        <Link
          href={`/ecole/${school.id}`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 border border-[#ddd] px-3 py-2 rounded-xl hover:border-[#aaa] transition-colors"
        >
          <ExternalLink size={12} />
          Voir la fiche publique
        </Link>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-6">
        <p className="font-black text-lg text-[#0a0a0a]">{school.name}</p>
        <p className="text-sm text-slate-500">{school.city} · {school.main_category}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-start justify-between gap-3 bg-white border border-[#ebebeb] rounded-2xl p-5 hover:border-[#ccc] transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-slate-500" />
                </div>
                <div>
                  <p className="font-bold text-sm text-[#0a0a0a]">{s.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-slate-300 shrink-0 mt-2" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
