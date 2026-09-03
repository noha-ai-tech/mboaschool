"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

export function FormulaireSalle({ etablissementId }: { etablissementId: string }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("");
  const [type, setType] = useState("classe");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nom.trim() || saving) return;
    setSaving(true); setError(""); setSuccess("");
    const { error: createError } = await supabase.from("salles").insert({ etablissement_id: etablissementId, nom: nom.trim(), capacite: capacite ? Number(capacite) : null, type });
    setSaving(false);
    if (createError) { setError(createError.message); return; }
    setNom(""); setCapacite(""); setSuccess("Salle ajoutée."); router.refresh();
  }

  return <form onSubmit={submit} className="space-y-4">
    {error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}
    {success && <SchoolAdminAlert tone="success">{success}</SchoolAdminAlert>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_13rem_auto] lg:items-end">
      <SchoolAdminFormField id="room-name" label="Nom" required><SchoolAdminInput value={nom} onChange={(event) => setNom(event.target.value)} placeholder="Salle 12" /></SchoolAdminFormField>
      <SchoolAdminFormField id="room-capacity" label="Capacité" description="Facultatif"><SchoolAdminInput type="number" min="1" value={capacite} onChange={(event) => setCapacite(event.target.value)} inputMode="numeric" /></SchoolAdminFormField>
      <SchoolAdminFormField id="room-type" label="Type"><SchoolAdminSelect value={type} onChange={(event) => setType(event.target.value)}><option value="classe">Classe</option><option value="laboratoire">Laboratoire</option><option value="informatique">Informatique</option><option value="sport">Sport</option></SchoolAdminSelect></SchoolAdminFormField>
      <SchoolAdminButton type="submit" loading={saving} leadingIcon={<Plus size={15} aria-hidden="true" />}>Ajouter</SchoolAdminButton>
    </div>
  </form>;
}
