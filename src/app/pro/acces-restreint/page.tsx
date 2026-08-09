import Link from "next/link";
import { Lock } from "lucide-react";
import { Logo } from "@/components/branding/Logo";

export default function AccesRestreintPage() {
  return (
    <div className="min-h-screen bg-[#f9f7f2] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-6">
          <Lock size={24} className="text-slate-400" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-[#0a0a0a] mb-3">
          Fonctionnalité Pro
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-2">
          Cette section (emplois du temps, pointage, messagerie interne, gestion
          des enseignants) est réservée aux établissements avec le{" "}
          <strong className="text-[#0a0a0a]">forfait Pro</strong>.
        </p>
        <p className="text-slate-400 text-sm mb-8">
          Pour activer le forfait Pro, contactez l'équipe Écoles237.
        </p>

        <Link
          href="/dashboard/ecole"
          className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
        >
          ← Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
