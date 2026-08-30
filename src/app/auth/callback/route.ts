import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearTargetedInvitationCookie,
  secureInvitationResponse,
  TARGETED_INVITATION_COOKIE,
} from "@/lib/invitations/targetedInvitation";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return clearTargetedInvitationCookie(secureInvitationResponse(
        NextResponse.redirect(new URL("/auth/connexion", origin))
      ));
    }

    // Récupérer le rôle pour rediriger vers le bon dashboard
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cookieStore.has(TARGETED_INVITATION_COOKIE)) {
        const consumeUrl = new URL("/auth/consommer-invitation", origin);
        return secureInvitationResponse(NextResponse.redirect(consumeUrl));
      }

      if (profile?.role === "platform_admin") {
        return secureInvitationResponse(
          NextResponse.redirect(new URL("/dashboard/admin", origin))
        );
      }
      if (profile?.role === "teacher") {
        return secureInvitationResponse(
          NextResponse.redirect(new URL("/enseignant/mon-espace", origin))
        );
      }
      return secureInvitationResponse(
        NextResponse.redirect(new URL("/dashboard/ecole", origin))
      );
    }
  }

  return clearTargetedInvitationCookie(secureInvitationResponse(
    NextResponse.redirect(new URL("/auth/connexion", origin))
  ));
}
