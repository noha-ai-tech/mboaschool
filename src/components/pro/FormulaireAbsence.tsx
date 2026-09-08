"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

export function FormulaireAbsence({ staffMembers }: { staffMembers: { id: string; nom: string }[] }) {
  const router = useRouter(); const [staffMemberId, setStaffMemberId] = useState(staffMembers[0]?.id ?? ""); const [type, setType] = useState("absence"); const [dateDebut, setDateDebut] = useState(""); const [dateFin, setDateFin] = useState(""); const [motif, setMotif] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!staffMemberId || !dateDebut || !dateFin || saving) return;
    setSaving(true); setError(""); setSuccess("");
    const { error: createError } = await supabase.from("absences").insert({ staff_member_id: staffMemberId, type, date_debut: dateDebut, date_fin: dateFin, motif: motif || null });
    setSaving(false); if (createError) { setError(createError.message); return; }
    setMotif(""); setSuccess("Période déclarée."); router.refresh();
  }
  return <form onSubmit={submit} className="space-y-4">{error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}{success && <SchoolAdminAlert tone="success">{success}</SchoolAdminAlert>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SchoolAdminFormField id="absence-staff" label="Personnel" required><SchoolAdminSelect value={staffMemberId} onChange={(event) => setStaffMemberId(event.target.value)}>{staffMembers.map((staff) => <option key={staff.id} value={staff.id}>{staff.nom}</option>)}</SchoolAdminSelect></SchoolAdminFormField><SchoolAdminFormField id="absence-type" label="Type" required><SchoolAdminSelect value={type} onChange={(event) => setType(event.target.value)}><option value="absence">Absence</option><option value="conge">Congé</option><option value="mission">Mission</option></SchoolAdminSelect></SchoolAdminFormField><SchoolAdminFormField id="absence-start" label="Début" required><SchoolAdminInput type="date" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="absence-end" label="Fin" required><SchoolAdminInput type="date" value={dateFin} onChange={(event) => setDateFin(event.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="absence-reason" label="Motif" description="Facultatif"><SchoolAdminInput value={motif} onChange={(event) => setMotif(event.target.value)} /></SchoolAdminFormField></div><div className="flex justify-end"><SchoolAdminButton type="submit" loading={saving} leadingIcon={<Plus size={15} aria-hidden="true" />}>Déclarer</SchoolAdminButton></div></form>;
}
