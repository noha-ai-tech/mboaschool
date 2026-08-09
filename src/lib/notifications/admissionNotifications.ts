// Architecture de notifications pour le parcours d'admission (Mission 07,
// Phase 16). Aucun fournisseur SMS/WhatsApp/email n'est connecté — "créer
// uniquement l'architecture, pas d'intégration payante dans cette mission".
// Même pattern que src/lib/notifications/claimNotifications.ts (Mission 02) :
// il suffira de remplacer deliver() par un appel réel le jour venu.

export type AdmissionNotificationEvent =
  | "admission_submitted"
  | "admission_in_review"
  | "admission_documents_required"
  | "admission_interview"
  | "admission_accepted"
  | "admission_waitlisted"
  | "admission_rejected";

export interface AdmissionNotificationPayload {
  event: AdmissionNotificationEvent;
  applicationId: string;
  establishmentName: string;
  studentName: string;
  parentPhone: string;
  /** Renseigné pour les événements où l'école a laissé un message public. */
  parentMessage?: string;
}

const EVENT_LABELS: Record<AdmissionNotificationEvent, string> = {
  admission_submitted: "Demande reçue",
  admission_in_review: "Demande en cours d'analyse",
  admission_documents_required: "Documents requis",
  admission_interview: "Entretien programmé",
  admission_accepted: "Demande acceptée",
  admission_waitlisted: "Demande en liste d'attente",
  admission_rejected: "Demande refusée",
};

/**
 * Point d'intégration unique pour l'envoi réel (SMS, WhatsApp, email...).
 * Aujourd'hui : no-op délibéré, journalise seulement. Ne throw jamais — un
 * échec de notification ne doit jamais faire échouer l'action métier qui
 * l'a déclenché (soumission, changement de statut...).
 */
async function deliver(payload: AdmissionNotificationPayload): Promise<void> {
  // TODO : brancher un fournisseur SMS/WhatsApp ici (ex. Twilio, WhatsApp
  // Business API) une fois le choix fait avec Eddy — hors périmètre de
  // cette mission (Phase 16 : architecture uniquement).
  console.log(
    `[notification:${payload.event}] ${EVENT_LABELS[payload.event]} — dossier ${payload.applicationId} (${payload.establishmentName})`
  );
}

export async function dispatchAdmissionNotification(payload: AdmissionNotificationPayload): Promise<void> {
  try {
    await deliver(payload);
  } catch {
    // Volontairement silencieux — voir la note sur deliver() ci-dessus.
  }
}
