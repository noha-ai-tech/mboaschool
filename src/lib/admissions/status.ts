// Statuts d'admission (Mission 07, Phase 3). Correspondance avec l'ancien
// enum application_status (pending/reviewed/accepted/rejected) maintenue
// côté base par le trigger sync_legacy_application_status (migration 0012).
export type AdmissionStatus =
  | "submitted"
  | "in_review"
  | "documents_required"
  | "interview"
  | "waitlisted"
  | "accepted"
  | "rejected"
  | "cancelled";

export const ADMISSION_STATUSES: { value: AdmissionStatus; label: string; cls: string }[] = [
  { value: "submitted",           label: "Nouvelle",          cls: "text-slate-700 bg-slate-100 border-slate-200" },
  { value: "in_review",           label: "En analyse",        cls: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "documents_required",  label: "Documents requis",  cls: "text-orange-700 bg-orange-50 border-orange-200" },
  { value: "interview",           label: "Entretien",         cls: "text-purple-700 bg-purple-50 border-purple-200" },
  { value: "waitlisted",          label: "Liste d'attente",   cls: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "accepted",            label: "Acceptée",          cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "rejected",            label: "Refusée",           cls: "text-red-700 bg-red-50 border-red-200" },
  { value: "cancelled",           label: "Annulée",           cls: "text-slate-500 bg-slate-50 border-slate-200" },
];

export function admissionStatusConfig(status: string) {
  return (
    ADMISSION_STATUSES.find((s) => s.value === status) ??
    { value: status as AdmissionStatus, label: status, cls: "text-slate-600 bg-slate-50 border-slate-200" }
  );
}

// Transitions autorisées depuis le tableau de bord établissement (Phase 8).
// "cancelled" est accessible depuis n'importe quel statut actif (annulation
// possible tant que le dossier n'est pas déjà clos).
export const ADMISSION_ACTIONS: { from: AdmissionStatus[]; to: AdmissionStatus; label: string }[] = [
  { from: ["submitted"], to: "in_review", label: "Passer en analyse" },
  { from: ["in_review"], to: "documents_required", label: "Demander des documents" },
  { from: ["in_review", "documents_required"], to: "interview", label: "Programmer un entretien" },
  { from: ["in_review", "documents_required", "interview"], to: "accepted", label: "Accepter" },
  { from: ["in_review", "documents_required", "interview"], to: "waitlisted", label: "Mettre en liste d'attente" },
  { from: ["waitlisted"], to: "accepted", label: "Accepter (depuis la liste d'attente)" },
  { from: ["submitted", "in_review", "documents_required", "interview", "waitlisted"], to: "rejected", label: "Refuser" },
  { from: ["submitted", "in_review", "documents_required", "interview", "waitlisted"], to: "cancelled", label: "Annuler" },
];

export function availableActions(current: AdmissionStatus) {
  return ADMISSION_ACTIONS.filter((a) => a.from.includes(current));
}
