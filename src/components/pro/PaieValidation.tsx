"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

type Step = "valider-rh" | "valider-direction";
export function PaieValidation({ bulletinId, statut, establishmentId }: { bulletinId: string; statut: string; establishmentId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [step, setStep] = useState<Step | null>(null);
  async function valider() { if (!step || busy) return; setBusy(true); setError(""); try { const res = await fetch(`/api/payroll/${bulletinId}/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestedEstablishmentId: establishmentId }) }); const body = await res.json().catch(() => ({})); if (!res.ok) { setError(body.error ?? "Échec de la validation"); return; } setStep(null); router.refresh(); } catch { setError("Impossible de valider ce bulletin pour le moment."); } finally { setBusy(false); } }
  if (statut === "paie_validee") return <SchoolAdminAlert tone="success" title="Paie validée"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" />Le bulletin est visible par l’enseignant selon les règles existantes.</span></SchoolAdminAlert>;
  const next: Step | null = statut === "brouillon" ? "valider-rh" : statut === "valide_rh" ? "valider-direction" : null; if (!next) return <SchoolAdminAlert tone="info">Aucune action disponible pour le statut actuel.</SchoolAdminAlert>;
  return <><SchoolAdminButton onClick={() => setStep(next)}>{next === "valider-rh" ? "Valider RH" : "Valider Direction"}</SchoolAdminButton><SchoolAdminDialog open={Boolean(step)} onClose={() => !busy && setStep(null)} closeOnBackdrop={!busy} title={step === "valider-rh" ? "Confirmer la validation RH ?" : "Confirmer la validation Direction ?"} description={step === "valider-direction" ? "Cette action publie le bulletin à l’enseignant selon le flux actuel." : "Cette action fait passer le bulletin à l’étape suivante."}>{error && <div className="mb-4"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div>}<p className="text-sm text-[var(--school-admin-text-muted)]">Cette validation utilise les permissions et transitions existantes.</p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" disabled={busy} onClick={() => setStep(null)}>Annuler</SchoolAdminButton><SchoolAdminButton loading={busy} onClick={valider}>Confirmer</SchoolAdminButton></div></SchoolAdminDialog></>;
}
