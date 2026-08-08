"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  School,
  User,
  FileText,
  Upload,
  X,
  Loader2,
} from "lucide-react";

type EstablishmentSummary = { id: string; name: string; city: string; owner_id: string | null };

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  role_title: "",
  phone: "",
  email: "",
  comments: "",
};

export default function RevendiquerPage() {
  const params = useParams() as { id: string };
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [establishment, setEstablishment] = useState<EstablishmentSummary | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data.user);
      if (data.user?.email) {
        setForm((f) => ({ ...f, email: data.user!.email! }));
      }
      setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    supabase
      .from("establishments")
      .select("id, name, city, owner_id")
      .eq("id", params.id)
      .single()
      .then(({ data }) => {
        setEstablishment(data ?? null);
        setLoadingSchool(false);
      });
  }, [params.id]);

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishment_id: params.id, ...form }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Échec de l'envoi de la demande");
      setSubmitting(false);
      return;
    }

    const claimId = body.claimId as string;

    // Upload des documents justificatifs — chemin {claim_id}/... requis par
    // la policy Storage (voir supabase/migrations/0008_school_onboarding.sql).
    for (const file of files) {
      const path = `${claimId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("claim-documents")
        .upload(path, file, { upsert: false });

      if (!uploadError) {
        await supabase.from("establishment_claim_documents").insert({
          claim_id: claimId,
          file_name: file.name,
          storage_path: path,
        });
      }
    }

    setSubmitting(false);
    setSuccess(true);
  }

  if (checkingAuth || loadingSchool) {
    return <div className="min-h-screen bg-[#f9f7f2]" />;
  }

  if (!establishment) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-slate-400 font-semibold">Établissement introuvable.</p>
          <Link href="/" className="text-sm text-emerald-700 font-semibold mt-3 block">← Retour à l&apos;accueil</Link>
        </div>
      </div>
    );
  }

  if (establishment.owner_id) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <p className="font-black text-[#0a0a0a] mb-2">Cette page est déjà gérée</p>
          <p className="text-sm text-slate-500 mb-6">
            {establishment.name} a déjà un compte associé sur Écoles237.
          </p>
          <Link href={`/ecole/${establishment.id}`} className="text-sm text-emerald-700 font-semibold">
            ← Retour à la fiche
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center bg-white border border-[#ebebeb] rounded-2xl p-8">
          <School size={28} className="mx-auto text-slate-300 mb-4" />
          <h1 className="font-black text-[#0a0a0a] mb-2">Connectez-vous pour continuer</h1>
          <p className="text-sm text-slate-500 mb-6">
            Pour revendiquer la page de {establishment.name}, vous devez d&apos;abord créer un compte ou vous connecter.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/auth/inscription"
              className="w-full bg-[#0a0a0a] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              Créer un compte
            </Link>
            <Link
              href="/auth/connexion"
              className="w-full border border-[#ddd] text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:border-[#aaa] transition-colors"
            >
              Se connecter
            </Link>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Revenez ensuite sur cette page pour finaliser votre demande.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-[#0a0a0a] mb-2">Demande envoyée</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Votre demande de revendication pour {establishment.name} a bien été reçue.
            L&apos;équipe Écoles237 va analyser vos justificatifs et vous recontactera par email.
          </p>
          <Link
            href={`/ecole/${establishment.id}`}
            className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
          >
            Retour à la fiche
          </Link>
        </div>
      </div>
    );
  }

  const steps = [
    { id: 1, label: "Vos informations" },
    { id: 2, label: "Établissement" },
    { id: 3, label: "Documents" },
    { id: 4, label: "Récapitulatif" },
  ];

  const step1Valid = form.first_name.trim() && form.last_name.trim() && form.role_title.trim() && form.phone.trim() && form.email.trim();

  return (
    <div className="min-h-screen bg-[#f9f7f2]">
      <div className="bg-[#0a0f0d] text-white">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
          <Link
            href={`/ecole/${establishment.id}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft size={15} />
            {establishment.name}
          </Link>
          <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-400 mb-2">Revendication</p>
          <h1 className="text-3xl font-black tracking-tight">Revendiquer {establishment.name}</h1>

          {/* Progress */}
          <div className="flex items-center gap-2 mt-6">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    s.id <= step ? "bg-emerald-500 text-white" : "bg-white/10 text-white/40"
                  }`}
                >
                  {s.id < step ? <CheckCircle2 size={13} /> : s.id}
                </div>
                <span className={`text-xs font-semibold hidden sm:block ${s.id <= step ? "text-white" : "text-white/40"}`}>
                  {s.label}
                </span>
                {s.id < steps.length && <div className="flex-1 h-px bg-white/10" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-5">
            {error}
          </div>
        )}

        {step === 1 && (
          <Section icon={User} title="Vos informations">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Prénom" value={form.first_name} onChange={(v) => field("first_name", v)} required />
              <Field label="Nom" value={form.last_name} onChange={(v) => field("last_name", v)} required />
              <Field label="Fonction dans l'établissement" value={form.role_title} onChange={(v) => field("role_title", v)} required placeholder="Directeur, Fondateur, Secrétariat…" />
              <Field label="Téléphone" value={form.phone} onChange={(v) => field("phone", v)} required placeholder="+237 6XX XXX XXX" />
              <Field label="Email" value={form.email} onChange={(v) => field("email", v)} required type="email" />
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section icon={School} title="Établissement concerné">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="font-bold text-[#0a0a0a]">{establishment.name}</p>
              <p className="text-sm text-slate-500">{establishment.city}</p>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Ce n&apos;est pas votre établissement ?{" "}
              <Link href="/" className="text-emerald-700 font-semibold">Retourner à l&apos;annuaire</Link>.
            </p>
          </Section>
        )}

        {step === 3 && (
          <Section icon={FileText} title="Documents justificatifs">
            <p className="text-xs text-slate-500 mb-4">
              Tout document prouvant votre lien avec l&apos;établissement (autorisation d&apos;ouverture,
              registre de commerce, carte professionnelle…). Optionnel mais accélère la validation.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-slate-300 transition-colors">
              <Upload size={20} className="text-slate-300" />
              <span className="text-sm text-slate-400">Cliquez pour ajouter un fichier</span>
              <input type="file" className="hidden" onChange={handleFiles} multiple accept=".pdf,.jpg,.jpeg,.png" />
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} aria-label={`Retirer ${f.name}`} className="text-slate-400 hover:text-red-500 shrink-0 ml-2">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {step === 4 && (
          <Section icon={CheckCircle2} title="Récapitulatif">
            <div className="space-y-3 text-sm">
              <Row label="Nom" value={`${form.first_name} ${form.last_name}`} />
              <Row label="Fonction" value={form.role_title} />
              <Row label="Téléphone" value={form.phone} />
              <Row label="Email" value={form.email} />
              <Row label="Documents" value={files.length > 0 ? `${files.length} fichier(s)` : "Aucun"} />
            </div>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Commentaire (optionnel)
              </label>
              <textarea
                value={form.comments}
                onChange={(e) => field("comments", e.target.value)}
                rows={3}
                placeholder="Toute précision utile pour l'équipe Écoles237…"
                className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none"
              />
            </div>
          </Section>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3 mt-6">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 border border-[#ddd] text-slate-600 py-3 rounded-xl text-sm font-semibold hover:border-[#aaa] transition-colors"
            >
              Précédent
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 && !step1Valid}
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 flex items-center justify-center gap-2 bg-[#0a0a0a] text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              Continuer
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {submitting ? "Envoi…" : "Envoyer la demande"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
      <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
        <Icon size={15} className="text-slate-400" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder = "",
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors placeholder-slate-400"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-[#0a0a0a]">{value}</span>
    </div>
  );
}
