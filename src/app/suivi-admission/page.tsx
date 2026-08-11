"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { admissionStatusConfig } from "@/lib/admissions/status";
import { ArrowLeft, Search, MessageSquare } from "lucide-react";
import { AuthHeader } from "@/components/layout/AuthHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

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
  const [errors, setErrors] = useState<{ code?: string; phone?: string }>({});

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!code.trim()) next.code = "Indiquez votre code de suivi.";
    if (!phone.trim()) next.phone = "Indiquez le numéro de téléphone utilisé lors de la demande.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

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
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <AuthHeader />

      <div className="flex-1 px-6 py-10">
        <div className="max-w-[560px] mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
          >
            <ArrowLeft size={15} />
            Annuaire
          </Link>

          <div className="bg-white rounded-[24px] shadow-elevation-2 p-6 lg:p-8">
            <h1 className="text-2xl font-bold text-text-primary mb-1.5">Suivre une demande</h1>
            <p className="text-sm text-text-secondary mb-6">
              Entrez votre code de suivi et le numéro de téléphone utilisé lors de la demande.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="tracking_code" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Code de suivi
                </label>
                <input
                  id="tracking_code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setErrors((er) => ({ ...er, code: undefined })); }}
                  placeholder="E237-XXXXXX"
                  aria-invalid={!!errors.code}
                  className={`w-full h-[52px] border rounded-card px-4 text-sm bg-white outline-none focus:shadow-elevation-1 transition-all duration-base font-mono tracking-wider ${
                    errors.code ? "border-danger focus:border-danger" : "border-border focus:border-primary"
                  }`}
                />
                {errors.code && <p className="text-xs text-danger mt-1.5">{errors.code}</p>}
              </div>
              <div>
                <label htmlFor="parent_phone" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Téléphone utilisé lors de la demande
                </label>
                <input
                  id="parent_phone"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setErrors((er) => ({ ...er, phone: undefined })); }}
                  placeholder="+237 6XX XXX XXX"
                  aria-invalid={!!errors.phone}
                  className={`w-full h-[52px] border rounded-card px-4 text-sm bg-white outline-none focus:shadow-elevation-1 transition-all duration-base ${
                    errors.phone ? "border-danger focus:border-danger" : "border-border focus:border-primary"
                  }`}
                />
                {errors.phone && <p className="text-xs text-danger mt-1.5">{errors.phone}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[52px] flex items-center justify-center gap-2 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                {loading ? "Recherche…" : "Afficher le dossier"}
              </button>
            </form>

            {notFound && (
              <div className="mt-5 bg-red-50 border border-red-200 rounded-[14px] p-5 text-center">
                <p className="text-sm font-semibold text-red-700">
                  Nous n&apos;avons pas trouvé de demande correspondant à ces informations.
                </p>
                <p className="text-xs text-red-500 mt-1.5">Vérifiez le code de suivi et le numéro de téléphone saisis.</p>
              </div>
            )}

            {result && (
              <div className="mt-6 pt-6 border-t border-border space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Statut actuel</p>
                  {(() => {
                    const s = admissionStatusConfig(result.status);
                    return <span className={`text-xs font-bold px-3 py-1 rounded-full border ${s.cls}`}>{s.label}</span>;
                  })()}
                </div>

                <div className="bg-muted rounded-[14px] p-4 space-y-2">
                  <Row label="Établissement" value={result.establishment_name} />
                  <Row label="Enfant" value={result.student_name} />
                  {result.desired_level && <Row label="Niveau demandé" value={result.desired_level} />}
                  <Row
                    label="Date de la demande"
                    value={new Date(result.submitted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  />
                </div>

                {result.parent_message && (
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <MessageSquare size={12} /> Message de l&apos;établissement
                    </p>
                    <p className="text-sm text-text-primary leading-relaxed bg-muted rounded-[12px] p-4">
                      {result.parent_message}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <span className="text-text-secondary text-sm shrink-0">{label}</span>
      <span className="font-semibold text-text-primary text-sm text-right truncate">{value}</span>
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
