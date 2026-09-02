"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { BookOpen, FlaskConical, Monitor, Dumbbell, Utensils, BedDouble, Bus, ShieldCheck, Wifi, HeartPulse } from "lucide-react";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminAlert, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

const INFRA_FIELDS = [
  { key: "library", label: "Bibliothèque", icon: BookOpen }, { key: "laboratory", label: "Laboratoire", icon: FlaskConical },
  { key: "computer_room", label: "Salle informatique", icon: Monitor }, { key: "sports_field", label: "Terrain de sport", icon: Dumbbell },
  { key: "canteen", label: "Cantine scolaire", icon: Utensils }, { key: "boarding", label: "Internat", icon: BedDouble },
  { key: "transport", label: "Transport scolaire", icon: Bus }, { key: "security", label: "Sécurité", icon: ShieldCheck },
  { key: "wifi", label: "Connexion Wi-Fi", icon: Wifi }, { key: "infirmary", label: "Infirmerie", icon: HeartPulse },
] as const;
type InfraForm = Record<(typeof INFRA_FIELDS)[number]["key"], boolean>;
const EMPTY_FORM = Object.fromEntries(INFRA_FIELDS.map(({ key }) => [key, false])) as InfraForm;

export default function InfrastructurePage() {
  const { school, loading: schoolLoading } = useSchool();
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false); const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null); const [hasRecord, setHasRecord] = useState(false);
  const [form, setForm] = useState<InfraForm>(EMPTY_FORM);

  useEffect(() => {
    if (!school) { setLoading(false); return; }
    let current = true; setLoading(true); setError(null);
    supabase.from("infrastructures").select("*").eq("establishment_id", school.id).maybeSingle().then(({ data, error: readError }) => {
      if (!current) return;
      if (readError) setError("Impossible de charger les infrastructures de cet établissement.");
      if (data) { setExistingId(data.id); setHasRecord(true); setForm(Object.fromEntries(INFRA_FIELDS.map(({ key }) => [key, Boolean(data[key])])) as InfraForm); }
      else { setExistingId(null); setHasRecord(false); setForm(EMPTY_FORM); }
      setLoading(false);
    });
    return () => { current = false; };
  }, [school]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!school || saving) return; setSaving(true); setSaved(false); setError(null);
    const result = existingId
      ? await supabase.from("infrastructures").update(form).eq("id", existingId)
      : await supabase.from("infrastructures").insert({ establishment_id: school.id, ...form }).select("id").single();
    if (result.error) setError("La sauvegarde a échoué. Vérifiez votre connexion puis réessayez.");
    else { if (!existingId && result.data && "id" in result.data) { setExistingId(result.data.id); setHasRecord(true); } setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  }

  if (schoolLoading || loading) return <SchoolAdminLoadingState label="Chargement des infrastructures" />;
  const checked = Object.values(form).filter(Boolean).length;
  return <div className="mx-auto max-w-4xl">
    <SchoolAdminPageHeader eyebrow="Configuration" title="Infrastructures" description="Indiquez uniquement les équipements réellement disponibles dans l’établissement." context={<SchoolAdminStatusBadge label={hasRecord ? `${checked} équipement${checked > 1 ? "s" : ""} actif${checked > 1 ? "s" : ""}` : "Configuration non renseignée"} tone={hasRecord ? "info" : "neutral"} />} />
    {error ? <div className="mb-4"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div> : null}
    {saved ? <div className="mb-4"><SchoolAdminAlert tone="success">Infrastructures sauvegardées.</SchoolAdminAlert></div> : null}
    <form onSubmit={save}>
      <SchoolAdminSectionCard title="Équipements de l’établissement" description="Chaque option indique explicitement si l’équipement est actif ou inactif.">
        <div className="grid gap-3 sm:grid-cols-2">
          {INFRA_FIELDS.map(({ key, label, icon: Icon }) => { const active = form[key]; return <button key={key} type="button" role="switch" aria-checked={active} onClick={() => setForm((value) => ({ ...value, [key]: !value[key] }))} className="flex min-h-16 items-center gap-3 rounded-[var(--school-admin-radius-control)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4 text-left transition hover:border-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] motion-reduce:transition-none">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--school-admin-primary-soft)] text-[var(--school-admin-primary)]"><Icon size={18} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 text-sm font-bold text-[var(--school-admin-text)]">{label}</span><SchoolAdminStatusBadge label={active ? "Actif" : "Inactif"} tone={active ? "success" : "neutral"} />
          </button>; })}
        </div>
        <div className="mt-6 flex justify-end"><SchoolAdminButton type="submit" loading={saving}>Enregistrer les infrastructures</SchoolAdminButton></div>
      </SchoolAdminSectionCard>
    </form>
  </div>;
}
