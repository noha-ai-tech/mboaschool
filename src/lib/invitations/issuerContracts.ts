const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVATION_CODE_PATTERN = /^[0-9a-f]{64}$/;
const EPHEMERAL_SECRET_VALUES = new WeakMap<EphemeralInvitationSecret, string>();

const ALLOWED_REQUEST_FIELDS = new Set([
  "requestedEstablishmentId",
  "idempotencyKey",
  "retryOf",
]);

export const FORBIDDEN_CLIENT_IDENTITY_FIELDS = Object.freeze([
  "actor_id",
  "actorId",
  "owner_id",
  "ownerId",
  "created_by",
  "createdBy",
]);

export type InvitationResourceType = "teacher" | "staff_member";
export type InvitationDeliveryState = "pending" | "delivered" | "failed" | "revoked";

export class InvitationRequestError extends Error {
  readonly code: "INVALID_BODY" | "CLIENT_IDENTITY_FORBIDDEN" | "INVALID_IDEMPOTENCY";

  constructor(
    code: "INVALID_BODY" | "CLIENT_IDENTITY_FORBIDDEN" | "INVALID_IDEMPOTENCY",
    message: string,
  ) {
    super(message);
    this.name = "InvitationRequestError";
    this.code = code;
  }
}

export type ParsedInvitationRequest = {
  requestedEstablishmentId: unknown;
  idempotencyKey: string | null;
  retryOf: string | null;
};

export function parseInvitationIssuerRequest(value: unknown): ParsedInvitationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvitationRequestError("INVALID_BODY", "Corps invalide");
  }

  const body = value as Record<string, unknown>;
  for (const field of FORBIDDEN_CLIENT_IDENTITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      throw new InvitationRequestError(
        "CLIENT_IDENTITY_FORBIDDEN",
        "L'identité du créateur ne peut pas être fournie par le client",
      );
    }
  }

  for (const field of Object.keys(body)) {
    if (!ALLOWED_REQUEST_FIELDS.has(field)) {
      throw new InvitationRequestError("INVALID_BODY", "Champ de requête non autorisé");
    }
  }

  const idempotencyKey = body.idempotencyKey ?? null;
  const retryOf = body.retryOf ?? null;
  if (idempotencyKey !== null && !isInvitationUuid(idempotencyKey)) {
    throw new InvitationRequestError("INVALID_IDEMPOTENCY", "Clé d'idempotence invalide");
  }
  if (retryOf !== null && !isInvitationUuid(retryOf)) {
    throw new InvitationRequestError("INVALID_IDEMPOTENCY", "Référence de retry invalide");
  }

  return {
    requestedEstablishmentId: body.requestedEstablishmentId,
    idempotencyKey: idempotencyKey as string | null,
    retryOf: retryOf as string | null,
  };
}

export function requireIssuerIdempotencyKey(request: ParsedInvitationRequest): string {
  if (!request.idempotencyKey) {
    throw new InvitationRequestError(
      "INVALID_IDEMPOTENCY",
      "Une clé d'idempotence UUID est requise",
    );
  }
  return request.idempotencyKey;
}

export function normalizeStoredInvitationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 3 && normalized.length <= 320 ? normalized : null;
}

export function isInvitationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Opaque in-memory wrapper. JSON/string coercion is always redacted; only a
 * delivery adapter can deliberately unwrap the value for its outbound call.
 */
export class EphemeralInvitationSecret {
  private constructor(value: string) {
    EPHEMERAL_SECRET_VALUES.set(this, value);
  }

  static fromInternalBoundary(value: string): EphemeralInvitationSecret {
    if (!ACTIVATION_CODE_PATTERN.test(value)) {
      throw new Error("Invalid internal invitation secret");
    }
    return new EphemeralInvitationSecret(value);
  }

  revealForDelivery<T>(deliver: (value: string) => T): T {
    const value = EPHEMERAL_SECRET_VALUES.get(this);
    if (!value) throw new Error("Invitation secret is unavailable");
    return deliver(value);
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}

export type IssueInvitationInput = {
  actorId: string;
  establishmentId: string;
  resourceType: InvitationResourceType;
  resourceId: string;
  recipientEmail: string;
  idempotencyKey: string;
  retryOf: string | null;
};

export type InternalIssueResult = {
  invitationId: string;
  attemptId: string;
  deliveryStatus: InvitationDeliveryState;
  created: boolean;
  secret: EphemeralInvitationSecret | null;
};

export interface InternalInvitationIssuer {
  issue(input: IssueInvitationInput): Promise<InternalIssueResult>;
  markDelivered(input: {
    actorId: string;
    attemptId: string;
    providerMessageId: string;
  }): Promise<boolean>;
  markConfirmedFailure(input: {
    actorId: string;
    attemptId: string;
    failureCode: string;
  }): Promise<boolean>;
}

export type DeliveryRequest = {
  recipientEmail: string;
  idempotencyKey: string;
  message: Readonly<{
    activationCode: EphemeralInvitationSecret;
    activationUrl: "/auth/activer-invitation";
  }>;
};

export type DeliveryResult =
  | { kind: "delivered"; providerMessageId: string }
  | { kind: "confirmed_failure"; failureCode: string }
  | { kind: "ambiguous" }
  | { kind: "timeout" };

export interface InvitationDeliveryProvider {
  readonly kind: "simulated" | "real";
  deliver(input: DeliveryRequest): Promise<DeliveryResult>;
}
