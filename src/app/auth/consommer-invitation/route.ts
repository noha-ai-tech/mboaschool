import { NextRequest, NextResponse } from "next/server";
import {
  clearTargetedInvitationCookie,
  isTargetedInvitationToken,
  secureInvitationResponse,
  TARGETED_INVITATION_COOKIE,
} from "@/lib/invitations/targetedInvitation";
import { createClient } from "@/lib/supabase/server";

type ConsumptionResult = {
  resource_type: "teacher" | "staff_member";
  resource_id: string;
  establishment_id: string;
  linked_teacher_id?: string | null;
};

function completionResponse(
  request: NextRequest,
  status: "success" | "invalid",
  result?: ConsumptionResult,
) {
  const destination = new URL("/auth/enseignant-bienvenue", request.url);
  destination.searchParams.set("invitation_status", status);
  if (status === "success" && result) {
    destination.searchParams.set("resource_type", result.resource_type);
    destination.searchParams.set("resource_id", result.resource_id);
    destination.searchParams.set("school", result.establishment_id);
  }

  return clearTargetedInvitationCookie(
    secureInvitationResponse(NextResponse.redirect(destination, 303)),
  );
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(TARGETED_INVITATION_COOKIE)?.value;
  if (!isTargetedInvitationToken(token)) {
    return completionResponse(request, "invalid");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return secureInvitationResponse(
      NextResponse.redirect(new URL("/auth/connexion", request.url)),
    );
  }

  return secureInvitationResponse(new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmer l’invitation</title></head><body><main><h1>Confirmer l’invitation</h1><p>Cette action rattachera votre compte à la ressource prévue.</p><form method="post" action="/auth/consommer-invitation"><button type="submit">Confirmer</button></form></main></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  ));
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return completionResponse(request, "invalid");
  }

  const token = request.cookies.get(TARGETED_INVITATION_COOKIE)?.value;
  if (!isTargetedInvitationToken(token)) {
    return completionResponse(request, "invalid");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return completionResponse(request, "invalid");
  }

  // POST-only, session-scoped RPC. The raw token is never logged, echoed, placed in
  // an error message or passed to a service_role client.
  const { data, error } = await supabase.rpc("consume_targeted_invitation", {
    p_token: token,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    return completionResponse(request, "invalid");
  }

  const result = data[0] as Partial<ConsumptionResult>;
  if (
    (result.resource_type !== "teacher" && result.resource_type !== "staff_member") ||
    typeof result.resource_id !== "string" ||
    typeof result.establishment_id !== "string"
  ) {
    return completionResponse(request, "invalid");
  }

  return completionResponse(request, "success", result as ConsumptionResult);
}
