"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

const FEE_FIELDS = [
  { key: "registration_fee", label: "Frais d’inscription", placeholder: "25000" },
  { key: "tuition_fee", label: "Frais de scolarité", placeholder: "185000" },
  { key: "transport_fee", label: "Transport scolaire", placeholder: "30000" },
  { key: "canteen_fee", label: "Cantine", placeholder: "15000" },
  { key: "uniform_fee", label: "Uniforme", placeholder: "20000" },
  { key: "exam_fee", label: "Examens officiels", placeholder: "10000" },
  { key: "other_fees", label: "Autres frais", placeholder: "0" },
];
type FeeForm = Record<string, string>;

export default function FraisPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState<FeeForm>(() => Object.fromEntries(FEE_FIELDS.map((field) => [field.key, ""])));

  useEffect(() => {
    if (!school) return;
    supabase.from("fees").select("*").eq("establishment_id", school.id).maybeSingle().then(({ data, error: loadError }) => {
      if (loadError) { setError(loadError.message); return; }
      if (data) {
        setExistingId(data.id);
        setForm(Object.fromEntries(FEE_FIELDS.map((field) => [field.key, data[field.key] ? String(data[field.key]) : ""])));
      }
    });
  }, [school]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school || saving) return;
    setSaving(true); setSaved(false); setError("");
    const payload = Object.fromEntries(FEE_FIELDS.map((field) => [field.key, form[field.key] ? Number(form[field.key]) : 0]));
    if (existingId) {
      const { error: updateError } = await supabase.from("fees").update(payload).eq("id", existingId);
      if (updateError) setError(updateError.message); else setSaved(true);
    } else {
      const { data, error: insertError } = await supabase.from("fees").insert({ establishment_id: school.id, ...payload }).select("id").single();
      if (insertError) setError(insertError.message); else { if (data) setExistingId(data.id); setSaved(true); }
    }
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  if (schoolLoading) return <SchoolAdminLoadingState label="Chargement des frais scolaires" />;
  if (!school) return <SchoolAdminEmptyState title="Aucun établissement actif" description="Sélectionnez un établissement avant de modifier les frais." />;
  return <div className="mx-auto max-w-5xl">
    <SchoolAdminPageHeader eyebrow="Paie et frais" title="Frais scolaires" description="Renseignez les montants réellement applicables, en FCFA, pour l’établissement actif." />
    {error && <div className="mb-5"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div>}
    {saved && <div className="mb-5"><SchoolAdminAlert tone="success">Frais enregistrés.</SchoolAdminAlert></div>}
    <SchoolAdminSectionCard title="Grille des frais" description="Une valeur de 0 signifie que le frais n’est pas applicable et il ne sera pas affiché publiquement.">
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">{FEE_FIELDS.map((field) => <SchoolAdminFormField key={field.key} id={`fee-${field.key}`} label={field.label} description="Montant en FCFA"><SchoolAdminInput type="number" min="0" value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /></SchoolAdminFormField>)}</div>
        <SchoolAdminAlert tone="info" title="Comportement de la valeur 0">Laissez à 0 les frais non applicables : ils sont conservés comme tels et ne sont pas affichés sur la fiche publique.</SchoolAdminAlert>
        <div className="flex justify-end"><SchoolAdminButton type="submit" loading={saving} leadingIcon={<Save size={16} aria-hidden="true" />}>Enregistrer les frais</SchoolAdminButton></div>
      </form>
    </SchoolAdminSectionCard>
  </div>;
}
