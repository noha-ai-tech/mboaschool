"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight,
  CheckCircle2,
  School,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { ClaimBranding } from "@/components/claim/ClaimBranding";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";

const CLAIM_BRANDING_PROPS = {
  title: "Votre établissement est déjà sur Écoles237.",
  subtitle: "Activez votre page pour la gérer vous-même et rester en contact avec les familles.",
};

type EstablishmentSummary = {
  id: string;
  name: string;
  city: string | null;
  owner_id: string | null;
  main_category: string | null;
  is_verified: boolean;
  image: string | null;
};

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  role_title: "",
  phone: "",
  email: "",
  comments: "",
};

const ROLE_OPTIONS = [
  "Promoteur",
  "Directeur",
  "Proviseur",
  "Principal",
  "Censeur",
  "Responsable administratif",
  "Autre",
];

const STEPS = [
  { id: 1, label: "Votre identité" },
  { id: 2, label: "Votre fonction" },
  { id: 3, label: "Établissement" },
  { id: 4, label: "Justificatifs" },
  { id: 5, label: "Confirmation" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const tickerItems = useSiteTickerItems();
  return (
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />
      <div className="flex-1 flex flex-col lg:flex-row">
        <ClaimBranding {...CLAIM_BRANDING_PROPS} />
        <div className="flex-1 flex items-center justify-center px-6 py-12">{children}</div>
      </div>
      <SiteFooter />
    </div>
  );
}

export default function RevendiquerPage() {
  const params = useParams() as { id: string };
  const tickerItems = useSiteTickerItems();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [establishment, setEstablishment] = useState<EstablishmentSummary | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customRole, setCustomRole] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [claimId, setClaimId] = useState<string | null>(null);

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
      .select("id, name, city, owner_id, main_category, is_verified, cover_image_url, school_images(url)")
      // CMS-F.6 — défense en profondeur avec la policy RLS publique
      // (migration 0029, PRÉPARÉE NON EXÉCUTÉE).
      .eq("school_images.status", "live")
      .eq("id", params.id)
      .single()
      .then(({ data }) => {
        const raw = data as any;
        setEstablishment(
          raw
            ? {
                id: raw.id,
                name: raw.name,
                city: raw.city,
                owner_id: raw.owner_id,
                main_category: raw.main_category ?? null,
                is_verified: raw.is_verified ?? false,
                image: raw.school_images?.[0]?.url ?? raw.cover_image_url ?? null,
              }
            : null
        );
        setLoadingSchool(false);
      });
  }, [params.id]);

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const picked = Array.from(list);
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

    const newClaimId = body.claimId as string;
    setClaimId(newClaimId ?? null);

    // Upload des documents justificatifs — chemin {claim_id}/... requis par
    // la policy Storage (voir supabase/migrations/0008_school_onboarding.sql).
    for (const file of files) {
      const path = `${newClaimId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("claim-documents")
        .upload(path, file, { upsert: false });

      if (!uploadError) {
        await supabase.from("establishment_claim_documents").insert({
          claim_id: newClaimId,
          file_name: file.name,
          storage_path: path,
        });
      }
    }

    setSubmitting(false);
    setSuccess(true);
  }

  if (checkingAuth || loadingSchool) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!establishment) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-text-secondary font-semibold">Établissement introuvable.</p>
          <Link href="/" className="text-sm text-primary font-semibold mt-3 block">← Retour à l&apos;accueil</Link>
        </div>
      </Shell>
    );
  }

  if (establishment.owner_id) {
    return (
      <Shell>
        <div className="max-w-sm w-full text-center">
          <p className="font-bold text-text-primary mb-2">Cette page est déjà gérée</p>
          <p className="text-sm text-text-secondary mb-6">
            {establishment.name} a déjà un compte associé sur Écoles237.
          </p>
          <Link href={`/ecole/${establishment.id}`} className="text-sm text-primary font-semibold">
            ← Retour à la fiche
          </Link>
        </div>
      </Shell>
    );
  }

  if (!isAuthenticated) {
    return (
      <Shell>
        <div className="max-w-sm w-full text-center bg-white rounded-[24px] shadow-elevation-2 p-8">
          <School size={26} className="mx-auto text-text-secondary/40 mb-4" />
          <h1 className="font-bold text-text-primary mb-2">Connectez-vous pour continuer</h1>
          <p className="text-sm text-text-secondary mb-6">
            Pour revendiquer la page de {establishment.name}, vous devez d&apos;abord créer un compte ou vous connecter.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/auth/inscription"
              className="w-full h-11 flex items-center justify-center rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-1 transition-all duration-base"
            >
              Créer un compte
            </Link>
            <Link
              href="/auth/connexion"
              className="w-full h-11 flex items-center justify-center rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
            >
              Se connecter
            </Link>
          </div>
          <p className="text-xs text-text-secondary mt-4">
            Revenez ensuite sur cette page pour finaliser votre demande.
          </p>
        </div>
      </Shell>
    );
  }

  if (success) {
    return (
      <Shell>
        <div className="max-w-md w-full text-center bg-white rounded-[24px] shadow-elevation-2 p-8">
          <div className="w-14 h-14 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={26} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Demande envoyée</h1>
          <p className="text-text-secondary text-sm leading-relaxed mb-6">
            Votre demande de revendication pour {establishment.name} a bien été reçue.
            L&apos;équipe Écoles237 va analyser vos justificatifs et vous recontactera par email.
          </p>

          <div className="bg-muted rounded-[14px] p-4 text-left space-y-2 mb-6">
            <Row label="Établissement" value={joinWithSeparator(establishment.name, establishment.city) ?? establishment.name} />
            {claimId && <Row label="N° de demande" value={claimId} mono />}
            <Row label="Statut" value="En vérification" />
          </div>

          <Link
            href={`/ecole/${establishment.id}`}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-1 transition-all duration-base"
          >
            Retour à la fiche
          </Link>
        </div>
      </Shell>
    );
  }

  const step1Valid = form.first_name.trim() && form.last_name.trim() && form.phone.trim() && form.email.trim();
  const step2Valid = form.role_title.trim().length > 0;
  const canContinue = step === 1 ? step1Valid : step === 2 ? step2Valid : true;

  return (
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />
      <div className="flex-1 flex flex-col lg:flex-row">
      <ClaimBranding {...CLAIM_BRANDING_PROPS} />

      <div className="flex-1 flex flex-col items-center px-6 py-10 lg:py-14 overflow-y-auto">
        <div className="w-full max-w-lg">
          <Link
            href={`/ecole/${establishment.id}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
          >
            ← {establishment.name}
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            Activer mon établissement
          </h1>
          <p className="text-sm text-text-secondary mb-7">
            Quelques informations suffisent pour commencer.
          </p>

          {/* Stepper — horizontal desktop, "Étape X sur 5" mobile. Vert/gris/blanc uniquement. */}
          <div className="mb-8">
            <p className="sm:hidden text-xs font-semibold text-text-secondary mb-2">
              Étape {step} sur {STEPS.length} — {STEPS[step - 1].label}
            </p>
            <div className="hidden sm:flex items-center">
              {STEPS.map((s) => (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border ${
                        s.id < step
                          ? "bg-primary border-primary text-white"
                          : s.id === step
                          ? "bg-primary border-primary text-white"
                          : "bg-white border-border text-text-secondary"
                      }`}
                    >
                      {s.id < step ? <CheckCircle2 size={12} /> : s.id}
                    </div>
                    <span className={`text-[10px] font-semibold text-center whitespace-nowrap ${s.id <= step ? "text-text-primary" : "text-text-secondary"}`}>
                      {s.label}
                    </span>
                  </div>
                  {s.id < STEPS.length && (
                    <div className={`flex-1 h-px mx-2 mb-4 ${s.id < step ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-5">
              {error}
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Prénom" value={form.first_name} onChange={(v) => field("first_name", v)} required />
                <Field label="Nom" value={form.last_name} onChange={(v) => field("last_name", v)} required />
                <Field label="Téléphone" value={form.phone} onChange={(v) => field("phone", v)} required placeholder="+237 6XX XXX XXX" />
                <Field label="Email" value={form.email} onChange={(v) => field("email", v)} required type="email" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label htmlFor="role_title" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Votre fonction dans l&apos;établissement
              </label>
              <select
                id="role_title"
                value={customRole ? "Autre" : form.role_title}
                onChange={(e) => {
                  if (e.target.value === "Autre") {
                    setCustomRole(true);
                    field("role_title", "");
                  } else {
                    setCustomRole(false);
                    field("role_title", e.target.value);
                  }
                }}
                className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
              >
                <option value="" disabled>Sélectionnez votre fonction</option>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {customRole && (
                <input
                  type="text"
                  value={form.role_title}
                  onChange={(e) => field("role_title", e.target.value)}
                  placeholder="Précisez votre fonction"
                  required
                  className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base mt-3"
                />
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-4 bg-muted rounded-[14px] p-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shrink-0 relative">
                  {establishment.image ? (
                    <Image src={establishment.image} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary/30 font-black text-xs">237</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-text-primary truncate">{establishment.name}</p>
                  <p className="text-sm text-text-secondary">
                    {joinWithSeparator(establishment.city, establishment.main_category)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] font-semibold bg-white text-text-secondary border border-border px-2 py-0.5 rounded-full">
                      Non revendiquée
                    </span>
                    {establishment.is_verified && (
                      <span className="text-[10px] font-semibold bg-primary-light text-primary px-2 py-0.5 rounded-full">
                        {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-3">
                Ce n&apos;est pas votre établissement ?{" "}
                <Link href="/" className="text-primary font-semibold">Retourner à l&apos;annuaire</Link>.
              </p>
            </div>
          )}

          {step === 4 && (
            <div>
              <p className="text-xs text-text-secondary mb-4 leading-relaxed">
                Tout document prouvant votre lien avec l&apos;établissement (autorisation d&apos;ouverture,
                registre de commerce, carte professionnelle…). Optionnel mais accélère la validation.
              </p>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-[16px] py-10 cursor-pointer transition-colors duration-base ${
                  dragOver ? "border-primary bg-primary-light" : "border-border hover:border-text-secondary"
                }`}
              >
                <Upload size={20} className="text-text-secondary" />
                <span className="text-sm text-text-secondary">Glissez vos fichiers ici ou cliquez pour en choisir</span>
                <span className="text-xs text-text-secondary/70">Formats acceptés : PDF, JPG, PNG</span>
                <input type="file" className="hidden" onChange={(e) => addFiles(e.target.files)} multiple accept=".pdf,.jpg,.jpeg,.png" />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between bg-muted rounded-[10px] px-3 py-2 text-sm">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} aria-label={`Retirer ${f.name}`} className="text-text-secondary hover:text-danger shrink-0 ml-2 p-1">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-text-secondary mt-4">
                Les documents sont utilisés uniquement pour vérifier votre lien avec l&apos;établissement.
              </p>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="space-y-3 text-sm">
                <Row label="Nom" value={`${form.first_name} ${form.last_name}`} />
                <Row label="Fonction" value={form.role_title} />
                <Row label="Téléphone" value={form.phone} />
                <Row label="Email" value={form.email} />
                <Row label="Documents" value={files.length > 0 ? `${files.length} fichier(s)` : "Aucun"} />
              </div>
              <div className="mt-5">
                <label htmlFor="comments" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Commentaire (optionnel)
                </label>
                <textarea
                  id="comments"
                  value={form.comments}
                  onChange={(e) => field("comments", e.target.value)}
                  rows={3}
                  placeholder="Toute précision utile pour l'équipe Écoles237…"
                  className="w-full border border-border rounded-card px-4 py-3 text-sm bg-white outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base resize-none"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="h-[52px] px-6 rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base sm:flex-none flex-1"
              >
                Retour
              </button>
            )}
            {step < STEPS.length ? (
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 flex items-center justify-center gap-2 h-[52px] rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-40 disabled:hover:translate-y-0"
              >
                Continuer
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="flex-1 flex items-center justify-center gap-2 h-[52px] rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {submitting ? "Envoi…" : "Envoyer ma demande"}
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      <SiteFooter />
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
      <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
      />
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
      <span className="text-text-secondary shrink-0">{label}</span>
      <span className={`font-semibold text-text-primary text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
