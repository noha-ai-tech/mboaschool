import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";
import {
  isInvitationUuid,
  normalizeStoredInvitationEmail,
  parseInvitationIssuerRequest,
  requireIssuerIdempotencyKey,
} from "@/lib/invitations/issuerContracts";
import { issueAndDeliverInvitation } from "@/lib/invitations/issuerFlow";
import {
  getPreparedInvitationIssuerDependencies,
  isInvitationIssuerActivationReady,
  isInvitationIssuerExplicitlyEnabled,
} from "@/lib/invitations/issuerServerWiring";
import {
  invitationIssuerLockedResponse,
  invitationRequestErrorResponse,
  secureInvitationIssuerJson,
  secureInvitationIssuerResponse,
} from "@/lib/invitations/issuerHttp";
import { InvitationIssuerUnavailableError } from "@/lib/invitations/internalIssuer";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teacherId } = await params;
  if (!isInvitationUuid(teacherId)) {
    return secureInvitationIssuerJson(
      { error: "Enseignant introuvable", code: "RESOURCE_NOT_FOUND" },
      404,
    );
  }

  const body = await req.json().catch(() => null);
  let request;
  try {
    request = parseInvitationIssuerRequest(body);
  } catch (error) {
    return invitationRequestErrorResponse(error);
  }

  const supabase = await createClient();
  const access = await authorizeEstablishmentRoute({
    supabase,
    requestedEstablishmentId: request.requestedEstablishmentId,
    capability: "teachers:manage",
  });
  if (!access.ok) return secureInvitationIssuerResponse(access.response);

  const { data: teacher, error: resourceError } = await supabase
    .from("enseignants")
    .select("id, email, user_id")
    .eq("id", teacherId)
    .eq("etablissement_id", access.establishment.id)
    .maybeSingle();

  if (resourceError) {
    return secureInvitationIssuerJson(
      { error: "Impossible de vérifier la ressource", code: "RESOURCE_LOOKUP_FAILED" },
      500,
    );
  }
  if (!teacher) {
    return secureInvitationIssuerJson(
      { error: "Enseignant introuvable", code: "RESOURCE_NOT_FOUND" },
      404,
    );
  }
  if (teacher.user_id) {
    return secureInvitationIssuerJson(
      { error: "Compte déjà actif", code: "RESOURCE_ALREADY_LINKED" },
      409,
    );
  }
  const recipientEmail = normalizeStoredInvitationEmail(teacher.email);
  if (!recipientEmail) {
    return secureInvitationIssuerJson(
      { error: "Aucun e-mail valide enregistré", code: "RESOURCE_EMAIL_REQUIRED" },
      400,
    );
  }

  // Source-controlled lock: no environment value can implicitly enable this.
  if (
    !isInvitationIssuerExplicitlyEnabled() ||
    !isInvitationIssuerActivationReady()
  ) return invitationIssuerLockedResponse();

  try {
    const idempotencyKey = requireIssuerIdempotencyKey(request);
    const result = await issueAndDeliverInvitation(
      {
        actorId: access.user.id,
        establishmentId: access.establishment.id,
        resourceType: "teacher",
        resourceId: teacher.id,
        recipientEmail,
        idempotencyKey,
        retryOf: request.retryOf,
      },
      getPreparedInvitationIssuerDependencies(),
    );

    if (result.outcome === "failed") {
      return secureInvitationIssuerJson(
        { error: "Livraison refusée", code: "INVITATION_DELIVERY_FAILED" },
        502,
      );
    }
    return secureInvitationIssuerJson(
      { message: "Demande d'invitation traitée", status: result.outcome },
      202,
    );
  } catch (error) {
    if (error instanceof InvitationIssuerUnavailableError) {
      return invitationIssuerLockedResponse();
    }
    return secureInvitationIssuerJson(
      { error: "Émission indisponible", code: "INVITATION_ISSUER_UNAVAILABLE" },
      503,
    );
  }
}
