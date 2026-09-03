import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearTargetedInvitationCookie,
  secureInvitationResponse,
  TARGETED_INVITATION_COOKIE,
} from "@/lib/invitations/targetedInvitation";
import { listAccessibleEstablishments } from "@/lib/school/establishmentAccess";

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

      // AMÉLIORATION 1 — même logique d'accès que le dashboard/SchoolContext
      // (src/app/api/establishments/accessible) : un compte "école" sans
      // établissement lié (ni propriétaire, ni membre du staff) atterrit sur
      // le formulaire de liaison/inscription plutôt que sur un dashboard
      // vide. En cas d'échec de la vérification, on ne bloque jamais la
      // connexion : repli sur le dashboard existant.
      const { establishments } = await listAccessibleEstablishments({
        supabase,
        userId: user.id,
      }).catch(() => ({ establishments: [] as Awaited<ReturnType<typeof listAccessibleEstablishments>>["establishments"] }));

      if (establishments.length === 0) {
        return secureInvitationResponse(
          NextResponse.redirect(new URL("/revendiquer", origin))
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
