import { NextResponse } from "next/server";
import { InvitationRequestError } from "./issuerContracts.ts";

export function secureInvitationIssuerJson(
  body: Readonly<Record<string, string>>,
  status: number,
): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function secureInvitationIssuerResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function invitationRequestErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvitationRequestError) {
    return secureInvitationIssuerJson({ error: error.message, code: error.code }, 400);
  }
  return secureInvitationIssuerJson(
    { error: "Requête d'invitation invalide", code: "INVALID_BODY" },
    400,
  );
}

export function invitationIssuerLockedResponse(): NextResponse {
  return secureInvitationIssuerJson(
    {
      error: "Invitations temporairement suspendues",
      code: "TARGETED_INVITATIONS_NOT_DEPLOYED",
    },
    503,
  );
}
