"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Crown, CreditCard, UserCog, Users, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminAlert, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect, SchoolAdminTextarea } from "@/components/school-admin/ui/FormControls";

const CATEGORIES = ["garderie", "primaire", "secondaire", "superieur", "autres"];
const EMPTY_FORM = { name: "", city: "", neighborhood: "", phone: "", email: "", whatsapp: "", website: "", description: "", main_category: "", address: "" };
type SettingsForm = typeof EMPTY_FORM;

export default function ParametresPage() {
  const { school, loading } = useSchool(); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null); const [form, setForm] = useState<SettingsForm>(EMPTY_FORM); const [initial, setInitial] = useState<SettingsForm>(EMPTY_FORM);
  useEffect(() => { if (!school) return; const value = { name: school.name ?? "", city: school.city ?? "", neighborhood: school.neighborhood ?? "", phone: school.phone ?? "", email: school.email ?? "", whatsapp: school.whatsapp ?? "", website: school.website ?? "", description: school.description ?? "", main_category: school.main_category ?? "", address: school.address ?? "" }; setForm(value); setInitial(value); }, [school]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!dirty || saving) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, saving]);
  function field(key: keyof SettingsForm, value: string) { setForm((current) => ({ ...current, [key]: value })); setSaved(false); }
  async function save(event: React.FormEvent) { event.preventDefault(); if (!school || saving) return; setSaving(true); setSaved(false); setError(null); const result = await supabase.from("establishments").update(form).eq("id", school.id); if (result.error) setError("La sauvegarde a échoué. Vérifiez les informations puis réessayez."); else { setInitial(form); setSaved(true); setTimeout(() => setSaved(false), 3000); } setSaving(false); }
  if (loading) return <SchoolAdminLoadingState label="Chargement des paramètres de l’établissement" />; if (!school) return null;
  const publicHref = `/ecole/${school.id}`; const paymentsHref = withEstablishmentQuery("/dashboard/ecole/paiements", school.id);
  return <div className="mx-auto max-w-4xl">
    <SchoolAdminPageHeader eyebrow="Configuration" title="Paramètres de l’établissement" description="Mettez à jour les informations générales et publiques de l’établissement." context={dirty ? <SchoolAdminStatusBadge label="Modifications non enregistrées" tone="warning" /> : <SchoolAdminStatusBadge label="Informations à jour" tone="success" />} actions={<Link href={publicHref} target="_blank" rel="noreferrer"><SchoolAdminButton variant="outline" leadingIcon={<ExternalLink size={16} aria-hidden="true" />}>Voir la fiche publique</SchoolAdminButton></Link>} />
    {error ? <div className="mb-4"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div> : null}{saved ? <div className="mb-4"><SchoolAdminAlert tone="success">Modifications sauvegardées.</SchoolAdminAlert></div> : null}
    <form onSubmit={save} className="space-y-5">
      <SchoolAdminSectionCard title="Informations générales" description="Identité, catégorie et présentation publique."><div className="grid gap-4 sm:grid-cols-2">
        <SchoolAdminFormField id="school-name" label="Nom de l’établissement" required><SchoolAdminInput value={form.name} onChange={(e) => field("name", e.target.value)} /></SchoolAdminFormField>
        <SchoolAdminFormField id="school-category" label="Catégorie"><SchoolAdminSelect value={form.main_category} onChange={(e) => field("main_category", e.target.value)}><option value="">— Choisir —</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category.charAt(0).toUpperCase() + category.slice(1)}</option>)}</SchoolAdminSelect></SchoolAdminFormField>
        <div className="sm:col-span-2"><SchoolAdminFormField id="school-description" label="Présentation"><SchoolAdminTextarea value={form.description} onChange={(e) => field("description", e.target.value)} placeholder="Présentation de l’établissement, valeurs, pédagogie…" /></SchoolAdminFormField></div>
      </div></SchoolAdminSectionCard>
      <SchoolAdminSectionCard title="Localisation" description="Adresse utilisée pour présenter et retrouver l’établissement."><div className="grid gap-4 sm:grid-cols-2">
        <SchoolAdminFormField id="school-city" label="Ville"><SchoolAdminInput value={form.city} onChange={(e) => field("city", e.target.value)} placeholder="Yaoundé, Douala…" /></SchoolAdminFormField><SchoolAdminFormField id="school-neighborhood" label="Quartier"><SchoolAdminInput value={form.neighborhood} onChange={(e) => field("neighborhood", e.target.value)} /></SchoolAdminFormField><div className="sm:col-span-2"><SchoolAdminFormField id="school-address" label="Adresse"><SchoolAdminInput value={form.address} onChange={(e) => field("address", e.target.value)} /></SchoolAdminFormField></div>
      </div></SchoolAdminSectionCard>
      <SchoolAdminSectionCard title="Coordonnées" description="Moyens de contact affichés selon le comportement actuel de la fiche."><div className="grid gap-4 sm:grid-cols-2">
        <SchoolAdminFormField id="school-phone" label="Téléphone principal"><SchoolAdminInput type="tel" value={form.phone} onChange={(e) => field("phone", e.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="school-whatsapp" label="WhatsApp"><SchoolAdminInput type="tel" value={form.whatsapp} onChange={(e) => field("whatsapp", e.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="school-email" label="Email"><SchoolAdminInput type="email" value={form.email} onChange={(e) => field("email", e.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="school-website" label="Site web"><SchoolAdminInput type="url" value={form.website} onChange={(e) => field("website", e.target.value)} /></SchoolAdminFormField>
      </div></SchoolAdminSectionCard>
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end"><span className="text-sm text-[var(--school-admin-text-muted)]" role="status">{dirty ? "Des modifications restent à enregistrer." : "Aucune modification en attente."}</span><SchoolAdminButton type="submit" loading={saving} disabled={!dirty}>Enregistrer les paramètres</SchoolAdminButton></div>
    </form>
    <div className="mt-8 space-y-4"><SchoolAdminSectionCard title="Forfait actuel" description="Le forfait est affiché à titre informatif et ne peut pas être modifié ici."><div className="flex items-center gap-3"><Crown size={20} className="text-[var(--school-admin-primary)]" aria-hidden="true" /><SchoolAdminStatusBadge label={school.forfait === "pro" ? "Pro" : school.forfait === "gere" ? "Géré" : "Gratuit"} tone="info" /></div></SchoolAdminSectionCard>
      <Link href={paymentsHref} className="block rounded-[var(--school-admin-radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><SchoolAdminSectionCard title="Paiements" description="Suivi des règlements — bientôt disponible."><CreditCard size={20} aria-hidden="true" /></SchoolAdminSectionCard></Link>
      {[{ icon: UserCog, title: "Responsables", text: "Désigner d’autres responsables — bientôt disponible." }, { icon: Users, title: "Utilisateurs", text: "Gestion des accès multi-utilisateurs — bientôt disponible." }, { icon: ShieldCheck, title: "Sécurité", text: "Paramètres de sécurité avancés — bientôt disponible." }].map(({ icon: Icon, title, text }) => <SchoolAdminSectionCard key={title} title={title} description={text} className="opacity-80"><div className="flex items-center gap-3 text-[var(--school-admin-text-muted)]"><Icon size={20} aria-hidden="true" /><SchoolAdminStatusBadge label="Indisponible" /></div></SchoolAdminSectionCard>)}
    </div>
  </div>;
}
