"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { admissionStatusConfig } from "@/lib/admissions/status";
import { ArrowLeft, Search, School, GraduationCap, Calendar, MessageSquare } from "lucide-react";

type Result = {
  establishment_name: string;
  student_name: string;
  desired_level: string | null;
  submitted_at: string;
  status: string;
  parent_message: string | null;
};

function SuiviForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    setNotFound(false);
    setResult(null);

    const { data, error } = await supabase.rpc("get_admission_by_tracking", {
      p_tracking_code: code.trim(),
      p_phone: phone.trim(),
    });

    setLoading(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      setNotFound(true);
    } else {
      setResult(row as Result);
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2]">
      <div className="bg-[#0a0f0d] text-white">
        <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors mb-10"
          >
            <ArrowLeft size={15} />
            Annuaire
          </Link>
          <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-400 mb-2">
            Suivi de préinscription
          </p>
          <h1 className="text-3xl font-black tracking-tight">Où en est ma demande ?</h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Entrez le code de suivi reçu après votre préinscription, ainsi que le numéro de
            téléphone utilisé lors de la demande.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="tracking_code" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Code de suivi
            </label>
            <input
              id="tracking_code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              placeholder="E237-XXXXXX"
              className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors font-mono tracking-wider"
            />
          </div>
          <div>
            <label htmlFor="parent_phone" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Téléphone utilisé lors de la demande
            </label>
            <input
              id="parent_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+237 6XX XXX XXX"
              className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Search size={15} />}
            {loading ? "Recherche…" : "Suivre ma demande"}
          </button>
        </form>

        {notFound && (
          <div className="mt-5 bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-semibold text-red-700">Aucune demande trouvée</p>
            <p className="text-xs text-red-500 mt-1">
              Vérifiez le code de suivi et le numéro de téléphone saisis.
            </p>
          </div>
        )}

        {result && (
          <div className="mt-5 bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</p>
              {(() => {
                const s = admissionStatusConfig(result.status);
                return (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${s.cls}`}>{s.label}</span>
                );
              })()}
            </div>

            <Row icon={School} label="Établissement" value={result.establishment_name} />
            <Row icon={GraduationCap} label="Enfant" value={result.student_name} />
            {result.desired_level && <Row icon={GraduationCap} label="Niveau demandé" value={result.desired_level} />}
            <Row
              icon={Calendar}
              label="Date de la demande"
              value={new Date(result.submitted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            />

            {result.parent_message && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Message de l&apos;établissement
                </p>
                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4">
                  {result.parent_message}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-slate-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-[#0a0a0a]">{value}</p>
      </div>
    </div>
  );
}

export default function SuiviAdmissionPage() {
  return (
    <Suspense>
      <SuiviForm />
    </Suspense>
  );
}
