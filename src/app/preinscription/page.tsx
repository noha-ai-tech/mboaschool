"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { dispatchAdmissionNotification } from "@/lib/notifications/admissionNotifications";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Check, MapPin } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SchoolSiteHeader } from "@/components/school/SchoolSiteHeader";
import { SchoolSiteFooter } from "@/components/school/SchoolSiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";
import { ensureReadableColor, hexToRgba } from "@/lib/schoolColor";

type SchoolOption = {
  id: string;
  name: string;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  category: string | null;
  verified: boolean;
  images: string[];
  couleurPrimaire: string | null;
  couleurSecondaire: string | null;
  logoUrl: string | null;
  motto: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
};


const STEPS = [
  { id: 1, label: "Enfant" },
  { id: 2, label: "Responsable" },
  { id: 3, label: "Demande" },
];

const SCHOOL_OPTION_COLUMNS =
  "id, name, city, neighborhood, address, main_category, is_verified, cover_image_url, couleur_primaire, couleur_secondaire, logo_url, motto, description, phone, whatsapp, email, website, school_images(url, status)";

function mapSchoolRow(s: any): SchoolOption {
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    neighborhood: s.neighborhood ?? null,
    address: s.address ?? null,
    category: s.main_category ?? null,
    verified: s.is_verified ?? false,
    couleurPrimaire: s.couleur_primaire ?? null,
    couleurSecondaire: s.couleur_secondaire ?? null,
    logoUrl: s.logo_url ?? null,
    motto: s.motto ?? null,
    description: s.description ?? null,
    phone: s.phone ?? null,
    whatsapp: s.whatsapp ?? null,
    email: s.email ?? null,
    website: s.website ?? null,
    images: [
      ...(s.school_images ?? []).filter((img: any) => img.status === "live").map((img: any) => img.url).filter(Boolean),
      ...(s.cover_image_url ? [s.cover_image_url] : []),
    ].filter((url: string, i: number, arr: string[]) => arr.indexOf(url) === i).slice(0, 5),
  };
}

const EMPTY_FORM = {
  establishment_id: "",
  annee_scolaire_id: "",
  parent_name: "",
  parent_phone: "",
  parent_email: "",
  student_first_name: "",
  student_last_name: "",
  student_birth_date: "",
  student_age: "",
  desired_level: "",
  previous_school: "",
  message: "",
};

function PreinscriptionForm() {
  const tickerItems = useSiteTickerItems();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("ecole") ?? "";

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [anneesScolaires, setAnneesScolaires] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, establishment_id: preselectedId });

  useEffect(() => {
    supabase
      .from("establishments")
      .select(SCHOOL_OPTION_COLUMNS)
      // BUGFIX — un .eq() sur une colonne d'une table jointe à plusieurs
      // (school_images) se comporte comme un inner join côté PostgREST : ça
      // excluait silencieusement toute école sans photo "live". Le statut
      // est filtré côté client (mapSchoolRow) à la place. Reste tout de
      // même plafonné aux ~1000 premières écoles (limite par défaut
      // PostgREST) — sans impact ici puisque l'école présélectionnée par
      // ?ecole= est récupérée séparément juste en dessous, quel que soit
      // son rang alphabétique.
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const mapped = data.map(mapSchoolRow);
        // Fusion (pas un remplacement) : que cette requête réponde avant ou
        // après celle de l'école présélectionnée ci-dessous, on ne doit
        // jamais perdre l'entrée que l'autre effet a pu déjà ajouter.
        setSchools((prev) => {
          const extra = prev.filter((s) => !mapped.some((m) => m.id === s.id));
          return [...mapped, ...extra];
        });
      });
  }, []);

  // L'école visée par ?ecole=<id> doit toujours être trouvée, même si elle
  // ne fait pas partie des ~1000 écoles chargées ci-dessus pour le
  // sélecteur — sinon l'en-tête/pied de page de SA page publique (ci-dessous)
  // retomberait à tort sur le chrome générique Écoles237.
  useEffect(() => {
    if (!preselectedId) return;
    supabase
      .from("establishments")
      .select(SCHOOL_OPTION_COLUMNS)
      .eq("id", preselectedId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const mapped = mapSchoolRow(data);
        setSchools((prev) => (prev.some((s) => s.id === mapped.id) ? prev : [...prev, mapped]));
      });
  }, [preselectedId]);

  useEffect(() => {
    if (!form.establishment_id) {
      setAnneesScolaires([]);
      return;
    }
    supabase
      .from("annees_scolaires")
      .select("id, libelle")
      .eq("etablissement_id", form.establishment_id)
      .eq("statut", "active")
      .order("date_debut", { ascending: false })
      .then(({ data }) => setAnneesScolaires(data ?? []));
  }, [form.establishment_id]);

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  }

  function validateStep(current: number): boolean {
    const next: Record<string, string> = {};
    if (current === 1) {
      if (!form.student_first_name.trim()) next.student_first_name = "Indiquez le prénom de l'enfant.";
      if (!form.student_last_name.trim()) next.student_last_name = "Indiquez le nom de l'enfant.";
      if (!form.desired_level.trim()) next.desired_level = "Indiquez le niveau ou la classe souhaitée.";
    }
    if (current === 2) {
      if (!form.parent_name.trim()) next.parent_name = "Indiquez votre nom complet.";
      if (!form.parent_phone.trim()) next.parent_phone = "Numéro de téléphone requis.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (validateStep(step)) setStep((s) => s + 1);
  }

  async function handleSubmit() {
    if (!form.establishment_id) return;
    setLoading(true);
    setSubmitError(null);
    const { data, error } = await supabase
      .from("applications")
      .insert({
        establishment_id: form.establishment_id,
        annee_scolaire_id: form.annee_scolaire_id || null,
        parent_name: form.parent_name,
        parent_phone: form.parent_phone,
        parent_email: form.parent_email || null,
        student_first_name: form.student_first_name,
        student_last_name: form.student_last_name,
        full_student_name: `${form.student_first_name} ${form.student_last_name}`,
        student_birth_date: form.student_birth_date || null,
        student_age: form.student_age ? Number(form.student_age) : null,
        desired_level: form.desired_level,
        previous_school: form.previous_school || null,
        message: form.message || null,
        status: "pending",
      })
      .select("id, tracking_code")
      .single();
    setLoading(false);
    if (!error) {
      setTrackingCode(data?.tracking_code ?? null);
      setSuccess(true);
      if (data?.id) {
        dispatchAdmissionNotification({
          event: "admission_submitted",
          applicationId: data.id,
          establishmentName: selectedSchool?.name ?? "établissement",
          studentName: `${form.student_first_name} ${form.student_last_name}`,
          parentPhone: form.parent_phone,
        });
      }
    } else {
      setSubmitError(
        error.message.includes("Trop de préinscriptions")
          ? error.message
          : "Une erreur est survenue. Merci de réessayer dans quelques instants."
      );
    }
  }

  const selectedSchool = schools.find((s) => s.id === form.establishment_id);

  // Dès qu'un établissement est connu (choisi ou déjà présent dans l'URL
  // ?ecole=), la page adopte la structure de SA page publique (même
  // en-tête/pied de page que src/app/ecole/[id], pas ceux d'Écoles237) —
  // seule l'étape "Quel établissement ?" (aucune école connue) garde le
  // chrome générique de la plateforme, faute de marque à afficher.
  const useSchoolChrome = !!form.establishment_id;

  // MODIFICATION 5 — couleurs de l'école (CMS) dès qu'un établissement est
  // connu. Repli sur EXACTEMENT le même bleu marine par défaut que
  // MiniSiteShell.tsx (#0F2A4A/#081A30) quand l'école n'a pas configuré ses
  // propres couleurs (ex. Guyskull) — jamais le vert Écoles237, pour rester
  // fidèle à la vraie page publique de cette école dont on reprend la
  // structure ici. À l'étape "Quel établissement ?" (chrome Écoles237
  // générique, aucune école connue), le vert plateforme reste le repli.
  const schoolPrimary = ensureReadableColor(selectedSchool?.couleurPrimaire, useSchoolChrome ? "#0F2A4A" : "#059669");
  const schoolPrimaryDark = ensureReadableColor(selectedSchool?.couleurSecondaire, useSchoolChrome ? "#081A30" : "#047857");
  const schoolThemeVars = {
    "--pf-primary": schoolPrimary,
    "--pf-primary-dark": schoolPrimaryDark,
    "--pf-primary-light": hexToRgba(schoolPrimary, 0.12),
    "--pf-primary-border": hexToRgba(schoolPrimary, 0.2),
    "--pf-primary-faded": hexToRgba(schoolPrimary, 0.3),
    // Mêmes noms de variables que MiniSiteShell — SchoolSiteHeader/Footer
    // (réutilisés tels quels ci-dessous) les lisent sous ce nom.
    "--school-primary": schoolPrimary,
    "--school-primary-dark": schoolPrimaryDark,
    "--school-accent-gold": "#C9A24B",
  } as React.CSSProperties;

  async function copyCode() {
    if (!trackingCode) return;
    await navigator.clipboard.writeText(trackingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (success) {
    return (
      <div className={`min-h-screen flex flex-col ${useSchoolChrome ? "bg-[#F4F4F2]" : "bg-[#FBF6F2]"}`} style={schoolThemeVars}>
        {useSchoolChrome ? (
          <SchoolSiteHeader
            logoUrl={selectedSchool?.logoUrl ?? null}
            name={selectedSchool?.name ?? ""}
            motto={selectedSchool?.motto}
            baseHref={`/ecole/${form.establishment_id}`}
            activeView={null}
            phone={selectedSchool?.phone ?? null}
          />
        ) : (
          <>
            <SiteHeader />
            <SiteHeaderSpacer />
            <AnnouncementTicker items={tickerItems} />
          </>
        )}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-md w-full text-center bg-white rounded-[24px] shadow-elevation-2 p-8">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: "var(--pf-primary-light)" }}>
              <CheckCircle2 size={26} style={{ color: "var(--pf-primary)" }} />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Demande enregistrée</h1>
            <p className="text-text-secondary text-sm leading-relaxed mb-6">
              L&apos;établissement va traiter votre dossier et vous contactera prochainement.
            </p>

            <div className="bg-muted rounded-[14px] p-4 text-left space-y-2 mb-6">
              {selectedSchool && <Row label="Établissement" value={selectedSchool.name} />}
              <Row label="Enfant" value={`${form.student_first_name} ${form.student_last_name}`} />
              <Row label="Niveau" value={form.desired_level} />
              <Row label="Date" value={new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} />
            </div>

            {trackingCode && (
              <div className="rounded-[16px] p-5 mb-6" style={{ backgroundColor: "var(--pf-primary-light)", border: "1px solid var(--pf-primary-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pf-primary)" }}>Code de suivi</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-2xl font-black text-text-primary tracking-widest font-mono">{trackingCode}</p>
                  <button
                    onClick={copyCode}
                    aria-label="Copier le code"
                    className="p-2 text-text-secondary hover:text-text-primary transition-colors duration-base"
                  >
                    {copied ? <Check size={16} style={{ color: "var(--pf-primary)" }} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-text-secondary mt-3">Conservez ce code pour suivre votre demande.</p>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {trackingCode && (
                <Link
                  href="/suivi-admission"
                  onClick={() => {
                    try {
                      window.sessionStorage.setItem(
                        "ecoles237.admission-tracking-code:v1",
                        trackingCode
                      );
                    } catch {
                      // The code remains visible and copyable for manual entry.
                    }
                  }}
                  className="w-full h-[48px] flex items-center justify-center rounded-card text-white text-sm font-bold hover:shadow-elevation-1 transition-all duration-base"
                  style={{ background: "linear-gradient(to right, var(--pf-primary), var(--pf-primary-dark))" }}
                >
                  Suivre ma demande
                </Link>
              )}
              <Link
                href={form.establishment_id ? `/ecole/${form.establishment_id}` : "/"}
                className="w-full h-[48px] flex items-center justify-center rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
              >
                Retour à l&apos;établissement
              </Link>
            </div>
          </div>
        </div>
        {useSchoolChrome ? (
          <SchoolSiteFooter
            name={selectedSchool?.name ?? ""}
            motto={selectedSchool?.motto}
            description={selectedSchool?.description ?? null}
            category={selectedSchool?.category ?? null}
            baseHref={`/ecole/${form.establishment_id}`}
            address={[selectedSchool?.address, selectedSchool?.neighborhood, selectedSchool?.city].filter(Boolean).join(", ") || null}
            phone={selectedSchool?.phone ?? null}
            whatsapp={selectedSchool?.whatsapp ?? null}
            email={selectedSchool?.email ?? null}
            website={selectedSchool?.website ?? null}
          />
        ) : (
          <SiteFooter />
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${useSchoolChrome ? "bg-[#F4F4F2]" : "bg-[#FBF6F2]"}`} style={schoolThemeVars}>
      {useSchoolChrome ? (
        <SchoolSiteHeader
          logoUrl={selectedSchool?.logoUrl ?? null}
          name={selectedSchool?.name ?? ""}
          motto={selectedSchool?.motto}
          baseHref={`/ecole/${form.establishment_id}`}
          activeView={null}
          phone={selectedSchool?.phone ?? null}
        />
      ) : (
        <>
          <SiteHeader />
          <SiteHeaderSpacer />
          <AnnouncementTicker items={tickerItems} />
        </>
      )}

      <div className="flex-1 px-6 py-10">
        <div className="max-w-[720px] mx-auto">
          <Link
            href={form.establishment_id ? `/ecole/${form.establishment_id}` : "/"}
            className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
          >
            <ArrowLeft size={15} />
            {selectedSchool ? selectedSchool.name : form.establishment_id ? "Retour à l'établissement" : "Annuaire"}
          </Link>

          {!form.establishment_id ? (
            <div className="bg-white rounded-[24px] shadow-elevation-2 p-6">
              <h1 className="text-xl font-bold text-text-primary mb-1.5">Quel établissement ?</h1>
              <p className="text-sm text-text-secondary mb-4">Choisissez l&apos;établissement pour lequel vous souhaitez préinscrire votre enfant.</p>
              <select
                value={form.establishment_id}
                onChange={(e) => field("establishment_id", e.target.value)}
                className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white outline-none focus:border-[var(--pf-primary)] focus:shadow-elevation-1 transition-all duration-base"
              >
                <option value="">— Choisir un établissement —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.city ? `${s.name} — ${s.city}` : s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              {/* Contexte établissement — compact, jamais un Hero */}
              {selectedSchool && (
                <div className="flex items-center gap-4 bg-white rounded-[18px] p-4 mb-6 shadow-elevation-1">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                    {selectedSchool.images[0] ? (
                      <Image src={selectedSchool.images[0]} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-xs" style={{ color: "var(--pf-primary-faded)" }}>237</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-text-primary truncate">{selectedSchool.name}</p>
                    <p className="text-sm text-text-secondary flex items-center gap-1">
                      <MapPin size={11} />
                      {joinWithSeparator(selectedSchool.city, selectedSchool.category)}
                    </p>
                  </div>
                  {selectedSchool.verified && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: "var(--pf-primary-light)", color: "var(--pf-primary)" }}>
                      <CheckCircle2 size={10} /> {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
                    </span>
                  )}
                </div>
              )}

              {/* Photos de contexte — pas de carousel artificiel si une seule image */}
              {selectedSchool && selectedSchool.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto mb-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {selectedSchool.images.map((url, i) => (
                    <div key={i} className="relative w-24 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                      <Image src={url} alt="" fill sizes="96px" className="object-cover" />
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white rounded-[24px] shadow-elevation-2 p-6 lg:p-8">
                {/* Stepper */}
                <div className="mb-7">
                  <p className="sm:hidden text-xs font-semibold text-text-secondary mb-2">
                    Étape {step} sur {STEPS.length} — {STEPS[step - 1].label}
                  </p>
                  <div className="hidden sm:flex items-center">
                    {STEPS.map((s) => (
                      <div key={s.id} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border ${
                              s.id <= step ? "text-white" : "bg-white border-border text-text-secondary"
                            }`}
                            style={s.id <= step ? { backgroundColor: "var(--pf-primary)", borderColor: "var(--pf-primary)" } : undefined}
                          >
                            {s.id < step ? <CheckCircle2 size={12} /> : s.id}
                          </div>
                          <span className={`text-[10px] font-semibold ${s.id <= step ? "text-text-primary" : "text-text-secondary"}`}>
                            {s.label}
                          </span>
                        </div>
                        {s.id < STEPS.length && (
                          <div className={`flex-1 h-px mx-2 mb-4 ${s.id >= step ? "bg-border" : ""}`} style={s.id < step ? { backgroundColor: "var(--pf-primary)" } : undefined} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-5">
                    {submitError}
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <h2 className="font-bold text-text-primary">L&apos;enfant</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Prénom" value={form.student_first_name} onChange={(v) => field("student_first_name", v)} error={errors.student_first_name} />
                      <Field label="Nom" value={form.student_last_name} onChange={(v) => field("student_last_name", v)} error={errors.student_last_name} />
                      <Field label="Date de naissance" type="date" value={form.student_birth_date} onChange={(v) => field("student_birth_date", v)} />
                      <Field label="Âge (optionnel)" type="number" value={form.student_age} onChange={(v) => field("student_age", v)} />
                      <Field label="Classe / niveau souhaité" value={form.desired_level} onChange={(v) => field("desired_level", v)} error={errors.desired_level} placeholder="Ex : CP, 6ème, Terminale…" />
                      <Field label="Ancienne école (optionnel)" value={form.previous_school} onChange={(v) => field("previous_school", v)} />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <h2 className="font-bold text-text-primary">Le responsable</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Nom complet" value={form.parent_name} onChange={(v) => field("parent_name", v)} error={errors.parent_name} />
                      <Field label="Téléphone" value={form.parent_phone} onChange={(v) => field("parent_phone", v)} error={errors.parent_phone} placeholder="+237 6XX XXX XXX" />
                      <Field label="Email (optionnel)" type="email" value={form.parent_email} onChange={(v) => field("parent_email", v)} />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-text-primary">La demande</h2>

                    <div className="bg-muted rounded-[14px] p-4 space-y-2">
                      {selectedSchool && <Row label="Établissement" value={selectedSchool.name} />}
                      <Row label="Enfant" value={`${form.student_first_name} ${form.student_last_name}`} />
                      <Row label="Niveau demandé" value={form.desired_level} />
                    </div>

                    {anneesScolaires.length > 0 && (
                      <div>
                        <label htmlFor="annee_scolaire_id" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                          Année scolaire
                        </label>
                        <select
                          id="annee_scolaire_id"
                          value={form.annee_scolaire_id}
                          onChange={(e) => field("annee_scolaire_id", e.target.value)}
                          className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white outline-none focus:border-[var(--pf-primary)] focus:shadow-elevation-1 transition-all duration-base"
                        >
                          <option value="">— Non précisée —</option>
                          {anneesScolaires.map((a) => (
                            <option key={a.id} value={a.id}>{a.libelle}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label htmlFor="message" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                        Message complémentaire (optionnel)
                      </label>
                      <textarea
                        id="message"
                        value={form.message}
                        onChange={(e) => field("message", e.target.value)}
                        rows={3}
                        placeholder="Besoins particuliers, questions, informations à préciser…"
                        className="w-full border border-border rounded-card px-4 py-3 text-sm bg-white outline-none focus:border-[var(--pf-primary)] focus:shadow-elevation-1 transition-all duration-base resize-none"
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
                      className="h-[52px] px-6 rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
                    >
                      Retour
                    </button>
                  )}
                  {step < STEPS.length ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="flex-1 flex items-center justify-center gap-2 h-[52px] rounded-card text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
                      style={{ background: "linear-gradient(to right, var(--pf-primary), var(--pf-primary-dark))" }}
                    >
                      Continuer
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleSubmit}
                      className="flex-1 flex items-center justify-center gap-2 h-[52px] rounded-card text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50"
                      style={{ background: "linear-gradient(to right, var(--pf-primary), var(--pf-primary-dark))" }}
                    >
                      {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {loading ? "Envoi…" : "Envoyer la demande"}
                    </button>
                  )}
                </div>

                {step === STEPS.length && (
                  <p className="text-center text-xs text-text-secondary mt-4">
                    Vos informations sont transmises uniquement à l&apos;établissement concerné.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {useSchoolChrome ? (
        <SchoolSiteFooter
          name={selectedSchool?.name ?? ""}
          motto={selectedSchool?.motto}
          description={selectedSchool?.description ?? null}
          category={selectedSchool?.category ?? null}
          baseHref={`/ecole/${form.establishment_id}`}
          address={[selectedSchool?.address, selectedSchool?.neighborhood, selectedSchool?.city].filter(Boolean).join(", ") || null}
          phone={selectedSchool?.phone ?? null}
          whatsapp={selectedSchool?.whatsapp ?? null}
          email={selectedSchool?.email ?? null}
          website={selectedSchool?.website ?? null}
        />
      ) : (
        <SiteFooter />
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder = "", error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: string;
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
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
        className={`w-full h-[52px] border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:shadow-elevation-1 transition-all duration-base ${
          error ? "border-danger focus:border-danger" : "border-border focus:border-[var(--pf-primary)]"
        }`}
      />
      {error && <p id={`${label}-error`} className="text-xs text-danger mt-1.5">{error}</p>}
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

export default function PreinscriptionPage() {
  return (
    <Suspense>
      <PreinscriptionForm />
    </Suspense>
  );
}
