"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

const CATEGORIES = [
  { value: "direction", label: "Direction" }, { value: "teacher", label: "Enseignant" },
  { value: "admin", label: "Personnel administratif" }, { value: "support", label: "Personnel de soutien" },
];
const ROLES_BY_CATEGORY: Record<string, { value: string; label: string }[]> = {
  direction: [
    { value: "admin_principal", label: "Administrateur principal" }, { value: "directeur", label: "Directeur" },
    { value: "proviseur", label: "Proviseur" }, { value: "principal", label: "Principal" }, { value: "censeur", label: "Censeur" },
  ],
  teacher: [{ value: "enseignant", label: "Enseignant" }],
  admin: [{ value: "secretaire", label: "Secrétariat" }, { value: "comptable", label: "Comptable" }],
  support: [{ value: "assistant", label: "Assistant" }],
};
const EMPLOYMENT_TYPES = [
  { value: "temps_plein", label: "Temps plein" }, { value: "temps_partiel", label: "Temps partiel" }, { value: "vacataire", label: "Vacataire" },
];

export function FormulaireNouveauPersonnel({ establishmentId }: { establishmentId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", category: "teacher", role: "enseignant", employment_type: "temps_plein", date_entree: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function field(key: keyof typeof form, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "category") next.role = ROLES_BY_CATEGORY[value]?.[0]?.value ?? "";
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/personnel/creer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, requestedEstablishmentId: establishmentId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error ?? "Échec de la création"); return; }
      router.push(withEstablishmentQuery(`/pro/personnel/${body.staffMemberId}`, establishmentId));
    } catch {
      setError("Impossible de créer la fiche pour le moment. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <SchoolAdminSectionCard title="Identité et contact" description="Renseignez uniquement les coordonnées disponibles.">
      <div className="grid gap-5 sm:grid-cols-2">
        <SchoolAdminFormField id="staff-first-name" label="Prénom" required><SchoolAdminInput value={form.first_name} onChange={(event) => field("first_name", event.target.value)} autoComplete="given-name" /></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-last-name" label="Nom" required><SchoolAdminInput value={form.last_name} onChange={(event) => field("last_name", event.target.value)} autoComplete="family-name" /></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-email" label="Email" description="L’invitation de compte reste indisponible, mais l’adresse peut être conservée dans la fiche."><SchoolAdminInput type="email" value={form.email} onChange={(event) => field("email", event.target.value)} placeholder="contact@monecole.cm" autoComplete="email" /></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-phone" label="Téléphone"><SchoolAdminInput type="tel" value={form.phone} onChange={(event) => field("phone", event.target.value)} placeholder="+237 6XX XXX XXX" autoComplete="tel" /></SchoolAdminFormField>
      </div>
    </SchoolAdminSectionCard>
    <SchoolAdminSectionCard title="Fonction et contrat" description="La catégorie détermine les fonctions réellement disponibles dans le formulaire.">
      <div className="grid gap-5 sm:grid-cols-2">
        <SchoolAdminFormField id="staff-category" label="Catégorie" required><SchoolAdminSelect value={form.category} onChange={(event) => field("category", event.target.value)}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</SchoolAdminSelect></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-role" label="Fonction" required><SchoolAdminSelect value={form.role} onChange={(event) => field("role", event.target.value)}>{(ROLES_BY_CATEGORY[form.category] ?? []).map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</SchoolAdminSelect></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-employment" label="Type de contrat"><SchoolAdminSelect value={form.employment_type} onChange={(event) => field("employment_type", event.target.value)}>{EMPLOYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</SchoolAdminSelect></SchoolAdminFormField>
        <SchoolAdminFormField id="staff-start-date" label="Date d’entrée"><SchoolAdminInput type="date" value={form.date_entree} onChange={(event) => field("date_entree", event.target.value)} /></SchoolAdminFormField>
      </div>
      {form.category === "teacher" && <SchoolAdminAlert tone="info" title="Profil enseignant lié">Un code de pointage à quatre chiffres sera généré automatiquement pour le kiosque de présence.</SchoolAdminAlert>}
    </SchoolAdminSectionCard>
    {error && <SchoolAdminAlert tone="danger" title="Création impossible">{error}</SchoolAdminAlert>}
    <div className="flex justify-end"><SchoolAdminButton type="submit" loading={saving} size="lg" leadingIcon={<Save size={17} aria-hidden="true" />}>Créer la fiche</SchoolAdminButton></div>
  </form>;
}
