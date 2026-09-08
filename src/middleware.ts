import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // ── /dashboard/* ──────────────────────────────────────────────────────────
  if (path.startsWith("/dashboard")) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/connexion", request.url));
    }
    if (path.startsWith("/dashboard/admin")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "platform_admin") {
        return NextResponse.redirect(new URL("/dashboard/ecole", request.url));
      }
    }
  }

  // ── /pro/* et API Pro ─────────────────────────────────────────────────────
  // La page /pro/acces-restreint est explicitement exclue (sinon boucle infinie).
  const isProPage =
    path.startsWith("/pro/") && path !== "/pro/acces-restreint";
  const isProApi =
    path.startsWith("/api/timetable/") ||
    path.startsWith("/api/pointage/") ||
    path.startsWith("/api/messagerie/") ||
    path.startsWith("/api/enseignants/");

  if (isProPage || isProApi) {
    if (!user) {
      if (isProApi) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/auth/connexion", request.url));
    }

    // Le middleware choisit uniquement une zone générale. L'établissement et
    // son forfait sont validés dans la couche serveur à partir de l'ID explicite.
  }

  // ── /auth/* si déjà connecté ──────────────────────────────────────────────
  const isInvitationCompletion =
    path === "/auth/callback" ||
    path === "/auth/preparer-invitation" ||
    path === "/auth/consommer-invitation" ||
    path === "/auth/enseignant-bienvenue";
  if (path.startsWith("/auth") && user && !isInvitationCompletion) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role === "platform_admin") {
      return NextResponse.redirect(new URL("/dashboard/admin", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard/ecole", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/:path*",
    "/pro/:path*",
    "/api/timetable/:path*",
    "/api/pointage/:path*",
    "/api/messagerie/:path*",
    "/api/enseignants/:path*",
  ],
};
