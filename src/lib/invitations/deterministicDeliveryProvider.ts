import type {
  DeliveryRequest,
  DeliveryResult,
  InvitationDeliveryProvider,
} from "./issuerContracts.ts";

export type DeterministicDeliveryMode =
  | "success"
  | "confirmed_failure"
  | "ambiguous"
  | "timeout";

/**
 * Local-only deterministic provider. It performs no network I/O, sends no
 * message, writes no file, and caches only secret-free outcomes by idempotency
 * key. The activation secret is intentionally never unwrapped or retained.
 */
export class DeterministicInvitationDeliveryProvider
  implements InvitationDeliveryProvider
{
  readonly kind = "simulated" as const;
  private readonly mode: DeterministicDeliveryMode;
  private readonly results = new Map<string, DeliveryResult>();
  private deliveryAttemptCount = 0;

  constructor(mode: DeterministicDeliveryMode) {
    this.mode = mode;
  }

  get deliveryAttempts(): number {
    return this.deliveryAttemptCount;
  }

  async deliver(input: DeliveryRequest): Promise<DeliveryResult> {
    if (input.message.activationUrl !== "/auth/activer-invitation") {
      throw new Error("Invalid non-secret activation destination");
    }

    const previous = this.results.get(input.idempotencyKey);
    if (previous) return previous;

    this.deliveryAttemptCount += 1;
    const result = deterministicResult(this.mode, input.idempotencyKey);
    this.results.set(input.idempotencyKey, result);
    return result;
  }
}

function deterministicResult(
  mode: DeterministicDeliveryMode,
  idempotencyKey: string,
): DeliveryResult {
  switch (mode) {
    case "success":
      return {
        kind: "delivered",
        providerMessageId: `simulation-${idempotencyKey}`,
      };
    case "confirmed_failure":
      return { kind: "confirmed_failure", failureCode: "SIMULATED_REJECTION" };
    case "ambiguous":
      return { kind: "ambiguous" };
    case "timeout":
      return { kind: "timeout" };
  }
}
