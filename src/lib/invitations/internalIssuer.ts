import {
  EphemeralInvitationSecret,
  type InternalInvitationIssuer,
  type IssueInvitationInput,
  type InvitationDeliveryState,
} from "./issuerContracts.ts";

export const PRIVATE_INVITATION_FUNCTIONS = Object.freeze({
  issue: "private.issue_targeted_invitation",
  complete: "private.complete_targeted_invitation_delivery",
  fail: "private.fail_targeted_invitation_delivery",
  revoke: "private.revoke_issued_targeted_invitation",
  stale: "private.revoke_stale_targeted_invitation_delivery",
} as const);

export type PrivateInvitationFunction =
  (typeof PRIVATE_INVITATION_FUNCTIONS)[keyof typeof PRIVATE_INVITATION_FUNCTIONS];

/**
 * Future direct-Postgres implementation contract. Its implementation must open
 * a short transaction, SET LOCAL ROLE invitation_issuer, call exactly one
 * allow-listed private function with parameters, then commit/rollback.
 */
export interface DedicatedInvitationRoleExecutor {
  execute<T>(
    functionName: PrivateInvitationFunction,
    parameters: Readonly<Record<string, string | null>>,
  ): Promise<T>;
}

type PrivateIssueRow = {
  invitation_id: string;
  attempt_id: string;
  delivery_status: InvitationDeliveryState;
  created: boolean;
  activation_code: string | null;
};

export function createInternalInvitationIssuer(
  executor: DedicatedInvitationRoleExecutor,
): InternalInvitationIssuer {
  return {
    async issue(input: IssueInvitationInput) {
      const row = await executor.execute<PrivateIssueRow>(PRIVATE_INVITATION_FUNCTIONS.issue, {
        p_actor_id: input.actorId,
        p_establishment_id: input.establishmentId,
        p_resource_type: input.resourceType,
        p_resource_id: input.resourceId,
        p_recipient_email: input.recipientEmail,
        p_idempotency_key: input.idempotencyKey,
        p_retry_of: input.retryOf,
      });

      return {
        invitationId: row.invitation_id,
        attemptId: row.attempt_id,
        deliveryStatus: row.delivery_status,
        created: row.created,
        secret: row.activation_code
          ? EphemeralInvitationSecret.fromInternalBoundary(row.activation_code)
          : null,
      };
    },

    markDelivered(input) {
      return executor.execute<boolean>(PRIVATE_INVITATION_FUNCTIONS.complete, {
        p_actor_id: input.actorId,
        p_attempt_id: input.attemptId,
        p_provider_message_id: input.providerMessageId,
      });
    },

    markConfirmedFailure(input) {
      return executor.execute<boolean>(PRIVATE_INVITATION_FUNCTIONS.fail, {
        p_actor_id: input.actorId,
        p_attempt_id: input.attemptId,
        p_failure_code: input.failureCode,
      });
    },
  };
}

export class InvitationIssuerUnavailableError extends Error {
  constructor() {
    super("Invitation issuer is not configured");
    this.name = "InvitationIssuerUnavailableError";
  }
}

export function createUnavailableInvitationIssuer(): InternalInvitationIssuer {
  const unavailable = async (): Promise<never> => {
    throw new InvitationIssuerUnavailableError();
  };
  return {
    issue: unavailable,
    markDelivered: unavailable,
    markConfirmedFailure: unavailable,
  };
}

