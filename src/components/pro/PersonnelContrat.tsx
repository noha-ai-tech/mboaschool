"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";

type Contract = { id: string; type: string; salaire: number | null; taux_horaire: number | null; volume_hebdomadaire: number | null; date_debut: string; date_fin: string | null; statut: string };

export function PersonnelContrat({ staffMemberId, current }: { staffMemberId: string; current: Contract | null }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ type: "temps_plein", salaire: "", taux_horaire: "", volume_hebdomadaire: "", date_debut: new Date().toISOString().slice(0, 10) });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    const { error: insertError } = await supabase.from("staff_contracts").insert({
      staff_member_id: staffMemberId, type: form.type,
      salaire: form.salaire ? Number(form.salaire) : null,
      taux_horaire: form.taux_horaire ? Number(form.taux_horaire) : null,
      volume_hebdomadaire: form.volume_hebdomadaire ? Number(form.volume_hebdomadaire) : null,
      date_debut: form.date_debut, statut: "actif",
    });
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setShowForm(false); router.refresh();
  }

  return <div className="space-y-4">
    {current ? <dl className="grid gap-4 sm:grid-cols-2"><Info label="Type" value={current.type} />{current.salaire ? <Info label="Salaire mensuel" value={`${current.salaire.toLocaleString("fr-FR")} FCFA`} /> : null}{current.taux_horaire ? <Info label="Taux horaire" value={`${current.taux_horaire.toLocaleString("fr-FR")} FCFA/h`} /> : null}{current.volume_hebdomadaire ? <Info label="Volume hebdomadaire" value={`${current.volume_hebdomadaire} h`} /> : null}<Info label="Début" value={new Date(current.date_debut).toLocaleDateString("fr-FR")} /><div><dt className="text-xs text-[var(--school-admin-text-soft)]">Statut</dt><dd className="mt-1"><SchoolAdminStatusBadge tone={current.statut === "actif" ? "success" : "neutral"} label={current.statut === "actif" ? "Actif" : "Terminé"} /></dd></div></dl> : <p className="text-sm text-[var(--school-admin-text-muted)]">Aucun contrat actif enregistré.</p>}
    <SchoolAdminButton variant="outline" size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus size={14} aria-hidden="true" />}>{current ? "Nouveau contrat" : "Ajouter un contrat"}</SchoolAdminButton>
    <SchoolAdminDialog open={showForm} onClose={() => setShowForm(false)} title={current ? "Nouveau contrat" : "Ajouter un contrat"} description="Renseignez uniquement les informations contractuelles disponibles.">
    <form onSubmit={save} className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <SchoolAdminFormField id="contract-type" label="Type de contrat" required><SchoolAdminSelect value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="temps_plein">Temps plein</option><option value="temps_partiel">Temps partiel</option><option value="vacataire">Vacataire</option></SchoolAdminSelect></SchoolAdminFormField>
      <SchoolAdminFormField id="contract-start" label="Date de début" required><SchoolAdminInput type="date" value={form.date_debut} onChange={(event) => setForm({ ...form, date_debut: event.target.value })} /></SchoolAdminFormField>
      <SchoolAdminFormField id="contract-salary" label="Salaire mensuel (FCFA)"><SchoolAdminInput type="number" min="0" inputMode="numeric" value={form.salaire} onChange={(event) => setForm({ ...form, salaire: event.target.value })} /></SchoolAdminFormField>
      <SchoolAdminFormField id="contract-hourly-rate" label="Taux horaire (FCFA)"><SchoolAdminInput type="number" min="0" inputMode="numeric" value={form.taux_horaire} onChange={(event) => setForm({ ...form, taux_horaire: event.target.value })} /></SchoolAdminFormField>
      <SchoolAdminFormField id="contract-weekly-hours" label="Volume hebdomadaire (h)"><SchoolAdminInput type="number" min="0" inputMode="numeric" value={form.volume_hebdomadaire} onChange={(event) => setForm({ ...form, volume_hebdomadaire: event.target.value })} /></SchoolAdminFormField>
    </div>
    {error && <SchoolAdminAlert tone="danger" title="Enregistrement impossible">{error}</SchoolAdminAlert>}
    <div className="flex flex-wrap gap-2"><SchoolAdminButton type="submit" loading={saving} leadingIcon={<Save size={15} aria-hidden="true" />}>Enregistrer</SchoolAdminButton><SchoolAdminButton variant="ghost" onClick={() => setShowForm(false)}>Annuler</SchoolAdminButton></div>
    </form>
    </SchoolAdminDialog>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-[var(--school-admin-text-soft)]">{label}</dt><dd className="mt-1 font-semibold text-[var(--school-admin-text)]">{value}</dd></div>; }
