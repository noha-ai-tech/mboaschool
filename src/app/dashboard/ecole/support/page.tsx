"use client";

// Support (Mission 03, Phase 2). Architecture uniquement — aucun système de
// ticket réel connecté. Le formulaire ci-dessous ne soumet rien : il
// documente l'emplacement prévu, conformément à "ne pas développer les
// fonctionnalités absentes".

import { LifeBuoy, Mail, BookOpen } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Support</h1>
        <p className="text-slate-500 text-sm mt-1">Une question sur votre compte ou votre fiche ? Nous sommes là.</p>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <LifeBuoy size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="font-bold text-sm text-[#0a0a0a] mb-1">Centre d&apos;aide</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Le centre d&apos;aide et le formulaire de contact direct sont en préparation. En attendant, l&apos;équipe
            Écoles237 reste joignable via les canaux habituels communiqués lors de votre inscription.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <Mail size={18} className="text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-400">Contacter l&apos;équipe</p>
          <p className="text-xs text-slate-400 mt-1">Bientôt disponible.</p>
        </div>
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <BookOpen size={18} className="text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-400">Guides d&apos;utilisation</p>
          <p className="text-xs text-slate-400 mt-1">Bientôt disponible.</p>
        </div>
      </div>
    </div>
  );
}
