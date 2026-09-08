"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { enqueueMutation } from "@/lib/offline/outbox";
import { triggerManualSync } from "@/lib/offline/syncEngine";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";
import { SyncStatus } from "@/components/offline/SyncStatus";

// OFFLINE-01 Phase 10 — pilote du moteur offline sur une mutation métier
// réelle et à faible risque déjà en production (déclaration d'absence,
// insert simple, sans photo). La saisie passe désormais par l'outbox
// locale plutôt que par un insert Supabase direct : hors-ligne, elle reste
// enregistrée sur l'appareil et se synchronise au retour réseau, jamais
// perdue silencieusement. En ligne, la synchronisation est déclenchée
// immédiatement — l'expérience reste celle d'un enregistrement instantané.
export function FormulaireAbsence({ staffMembers, establishmentId }: { staffMembers: { id: string; nom: string }[]; establishmentId: string }) {
  const router = useRouter(); const [staffMemberId, setStaffMemberId] = useState(staffMembers[0]?.id ?? ""); const [type, setType] = useState("absence"); const [dateDebut, setDateDebut] = useState(""); const [dateFin, setDateFin] = useState(""); const [motif, setMotif] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!staffMemberId || !dateDebut || !dateFin || saving || !userId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await enqueueMutation({
        entityType: "absence",
        operation: "create",
        entityId: null,
        payload: { staff_member_id: staffMemberId, type, date_debut: dateDebut, date_fin: dateFin, motif: motif || null },
        baseVersion: null,
        userId,
        establishmentId,
      });
    } catch (queueError) {
      setSaving(false);
      setError(queueError instanceof Error ? queueError.message : "Échec de l'enregistrement local");
      return;
    }
    setSaving(false); setMotif("");
    setSuccess(navigator.onLine ? "Période enregistrée — synchronisation en cours." : "Période enregistrée sur cet appareil — sera synchronisée au retour du réseau.");
    void triggerManualSync().finally(() => router.refresh());
  }
  return <form onSubmit={submit} className="space-y-4"><div className="flex justify-end"><SyncStatus /></div>{error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}{success && <SchoolAdminAlert tone="success">{success}</SchoolAdminAlert>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SchoolAdminFormField id="absence-staff" label="Personnel" required><SchoolAdminSelect value={staffMemberId} onChange={(event) => setStaffMemberId(event.target.value)}>{staffMembers.map((staff) => <option key={staff.id} value={staff.id}>{staff.nom}</option>)}</SchoolAdminSelect></SchoolAdminFormField><SchoolAdminFormField id="absence-type" label="Type" required><SchoolAdminSelect value={type} onChange={(event) => setType(event.target.value)}><option value="absence">Absence</option><option value="conge">Congé</option><option value="mission">Mission</option></SchoolAdminSelect></SchoolAdminFormField><SchoolAdminFormField id="absence-start" label="Début" required><SchoolAdminInput type="date" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="absence-end" label="Fin" required><SchoolAdminInput type="date" value={dateFin} onChange={(event) => setDateFin(event.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="absence-reason" label="Motif" description="Facultatif"><SchoolAdminInput value={motif} onChange={(event) => setMotif(event.target.value)} /></SchoolAdminFormField></div><div className="flex justify-end"><SchoolAdminButton type="submit" loading={saving} leadingIcon={<Plus size={15} aria-hidden="true" />}>Déclarer</SchoolAdminButton></div></form>;
}
