"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WandSparkles } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

export function BoutonGenerer({ anneeScolaire, establishmentId }: { anneeScolaire: string; establishmentId: string }) {
  const router = useRouter(); const [enCours, setEnCours] = useState(false); const [erreur, setErreur] = useState<string | null>(null); const [open, setOpen] = useState(false);
  async function generer() { if (enCours) return; setEnCours(true); setErreur(null); try { const res = await fetch("/api/timetable/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anneeScolaire, requestedEstablishmentId: establishmentId }) }); const data = await res.json(); if (!res.ok) { setErreur(data.error ?? "Échec de la génération"); return; } setOpen(false); router.refresh(); } catch { setErreur("Erreur réseau — vérifiez votre connexion et réessayez"); } finally { setEnCours(false); } }
  return <><SchoolAdminButton onClick={() => setOpen(true)} leadingIcon={<WandSparkles size={16} aria-hidden="true" />}>Générer</SchoolAdminButton><SchoolAdminDialog open={open} onClose={() => !enCours && setOpen(false)} closeOnBackdrop={!enCours} title="Générer l’emploi du temps ?" description="La génération existante créera un brouillon à partir des contraintes déjà configurées.">{erreur && <div className="mb-4"><SchoolAdminAlert tone="danger">{erreur}</SchoolAdminAlert></div>}<p className="text-sm text-[var(--school-admin-text-muted)]">La version actuellement publiée reste inchangée tant que le brouillon n’est pas publié.</p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setOpen(false)} disabled={enCours}>Annuler</SchoolAdminButton><SchoolAdminButton onClick={generer} loading={enCours}>Confirmer la génération</SchoolAdminButton></div></SchoolAdminDialog></>;
}
