import { DeterministicInvitationDeliveryProvider } from "./deterministicDeliveryProvider.ts";
import {
  hasCompleteDedicatedDatabaseConfiguration,
} from "./dedicatedPostgresExecutor.ts";
import { createUnavailableInvitationIssuer } from "./internalIssuer.ts";

export type InvitationIssuerActivationState = "locked" | "enabled";

/**
 * Source-controlled kill switch. It is intentionally not derived from an
 * environment variable: a missing/mistyped variable can never enable issuance.
 */
const ACTIVATION: Readonly<{ state: InvitationIssuerActivationState }> = Object.freeze({
  state: "locked",
});

export function isInvitationIssuerExplicitlyEnabled(): boolean {
  return ACTIVATION.state === "enabled";
}

export type InvitationIssuerActivationReadiness = Readonly<{
  sourceApproved: boolean;
  serverConfigurationValid: boolean;
  realProviderConfigured: boolean;
  ready: boolean;
}>;

export function inspectInvitationIssuerActivationReadiness(
  environment: NodeJS.ProcessEnv = process.env,
): InvitationIssuerActivationReadiness {
  const sourceApproved = isInvitationIssuerExplicitlyEnabled();
  const serverConfigurationValid = hasCompleteDedicatedDatabaseConfiguration(environment);
  // PRO-03.3.2 deliberately contains no real delivery provider implementation.
  const realProviderConfigured = false;
  return Object.freeze({
    sourceApproved,
    serverConfigurationValid,
    realProviderConfigured,
    ready: sourceApproved && serverConfigurationValid && realProviderConfigured,
  });
}

export function isInvitationIssuerActivationReady(): boolean {
  return inspectInvitationIssuerActivationReadiness().ready;
}

/**
 * Prepared-only wiring: even a mistaken switch change cannot reach PostgreSQL.
 * Activation requires a separate reviewed change replacing this unavailable
 * adapter with the dedicated-role executor.
 */
export function getPreparedInvitationIssuerDependencies() {
  return {
    issuer: createUnavailableInvitationIssuer(),
    deliveryProvider: new DeterministicInvitationDeliveryProvider("success"),
  };
}
