import { NextRequest, NextResponse } from "next/server";
import {
  clearTargetedInvitationCookie,
  isTargetedInvitationToken,
  secureInvitationResponse,
  setTargetedInvitationCookie,
} from "@/lib/invitations/targetedInvitation";
import { createClient } from "@/lib/supabase/server";

function invalidPreparation(request: NextRequest) {
  const destination = new URL("/auth/activer-invitation", request.url);
  destination.searchParams.set("status", "invalid");
  return clearTargetedInvitationCookie(
    secureInvitationResponse(NextResponse.redirect(destination, 303)),
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return invalidPreparation(request);
  }

  let token: FormDataEntryValue | null = null;
  try {
    const form = await request.formData();
    token = form.get("token");
  } catch {
    return invalidPreparation(request);
  }

  if (!isTargetedInvitationToken(token)) {
    return invalidPreparation(request);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const destination = new URL(
    user ? "/auth/consommer-invitation" : "/auth/connexion",
    request.url,
  );
  return setTargetedInvitationCookie(
    secureInvitationResponse(NextResponse.redirect(destination, 303)),
    token,
  );
}
