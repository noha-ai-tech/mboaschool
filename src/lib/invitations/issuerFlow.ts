import type {
  InternalInvitationIssuer,
  InvitationDeliveryProvider,
  IssueInvitationInput,
} from "./issuerContracts.ts";

export type InvitationIssuerOutcome =
  | "delivered"
  | "failed"
  | "pending"
  | "idempotent_replay";

export type InvitationIssuerPublicResult = Readonly<{
  outcome: InvitationIssuerOutcome;
}>;

export async function issueAndDeliverInvitation(
  input: IssueInvitationInput,
  dependencies: {
    issuer: InternalInvitationIssuer;
    deliveryProvider: InvitationDeliveryProvider;
  },
): Promise<InvitationIssuerPublicResult> {
  const issued = await dependencies.issuer.issue(input);

  if (!issued.created) {
    return Object.freeze({ outcome: "idempotent_replay" });
  }
  if (!issued.secret) {
    throw new Error("Invitation issuer returned no ephemeral secret");
  }

  let delivery;
  try {
    delivery = await dependencies.deliveryProvider.deliver({
      recipientEmail: input.recipientEmail,
      idempotencyKey: input.idempotencyKey,
      message: Object.freeze({
        activationCode: issued.secret,
        activationUrl: "/auth/activer-invitation",
      }),
    });
  } catch {
    // Unknown provider outcome is deliberately left pending. A controlled
    // reconciler will stale-revoke it; guessing failure could cause a resend.
    return Object.freeze({ outcome: "pending" });
  }

  if (delivery.kind === "delivered") {
    try {
      const completed = await dependencies.issuer.markDelivered({
        actorId: input.actorId,
        attemptId: issued.attemptId,
        providerMessageId: delivery.providerMessageId,
      });
      return Object.freeze({ outcome: completed ? "delivered" : "pending" });
    } catch {
      // Delivery may have happened. Keep the invitation pending and therefore
      // non-consumable until a controlled reconciliation confirms or revokes it.
      return Object.freeze({ outcome: "pending" });
    }
  }

  if (delivery.kind === "confirmed_failure") {
    try {
      const compensated = await dependencies.issuer.markConfirmedFailure({
        actorId: input.actorId,
        attemptId: issued.attemptId,
        failureCode: delivery.failureCode,
      });
      return Object.freeze({ outcome: compensated ? "failed" : "pending" });
    } catch {
      return Object.freeze({ outcome: "pending" });
    }
  }

  return Object.freeze({ outcome: "pending" });
}
