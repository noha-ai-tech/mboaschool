// Architecture de notifications pour le parcours de revendication d'établissement.
//
// Aucun fournisseur d'email n'est connecté (mission 02, Phase 7 : "créer
// uniquement l'architecture"). Chaque événement est déclenché au bon endroit
// dans les routes API du parcours (submission, review, approve, reject) —
// il suffit de remplacer `deliver()` par un appel réel (Resend, Postmark,
// SES...) le jour où un fournisseur est branché. Rien d'autre à changer.

export type ClaimNotificationEvent =
  | "claim_received"
  | "claim_in_review"
  | "claim_accepted"
  | "claim_rejected";

export interface ClaimNotificationPayload {
  event: ClaimNotificationEvent;
  claimId: string;
  establishmentId: string;
  requesterEmail: string;
  requesterName: string;
  establishmentName: string;
  /** Renseigné uniquement pour l'événement claim_rejected. */
  reason?: string;
}

const EVENT_LABELS: Record<ClaimNotificationEvent, string> = {
  claim_received: "Demande reçue",
  claim_in_review: "Demande en cours d'analyse",
  claim_accepted: "Demande acceptée",
  claim_rejected: "Demande refusée",
};

/**
 * Point d'intégration unique pour l'envoi réel (email, SMS...).
 * Aujourd'hui : no-op délibéré, journalise seulement. Ne throw jamais —
 * un échec de notification ne doit jamais faire échouer l'action métier
 * qui l'a déclenché (approbation, refus...).
 */
async function deliver(payload: ClaimNotificationPayload): Promise<void> {
  // TODO : brancher un fournisseur d'email ici (ex. Resend).
  // Exemple futur :
  //   await resend.emails.send({
  //     to: payload.requesterEmail,
  //     subject: EVENT_LABELS[payload.event],
  //     react: ClaimEmailTemplate(payload),
  //   });
  console.log(
    `[notification:${payload.event}] ${EVENT_LABELS[payload.event]} — demande ${payload.claimId} (${payload.establishmentName})`
  );
}

export async function dispatchClaimNotification(payload: ClaimNotificationPayload): Promise<void> {
  try {
    await deliver(payload);
  } catch {
    // Volontairement silencieux — voir la note sur deliver() ci-dessus.
  }
}
