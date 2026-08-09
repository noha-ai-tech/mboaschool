// GET  /api/admin/administrateurs — liste des administrateurs plateforme
// POST /api/admin/administrateurs — promeut un utilisateur existant
//
// Mission 08, Phase 2. profiles n'a aucune policy RLS permettant à un
// platform_admin de lire/modifier le profil d'un AUTRE utilisateur (RLS =
// self-only, schema.sql) — passage obligé par le client admin, comme pour
// tous les contournements déjà en place dans ce dépôt (Mission 02/04).
// "Aucun email codé en dur" (Phase 2) : la recherche se fait par email saisi
// à l'exécution, jamais une valeur fixe dans le code.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

export async function GET() {
  const auth = await requireAdmin("manage_admins");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, admin_role, created_at")
    .eq("role", "platform_admin")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Emails non stockés dans profiles — récupérés via l'API Auth admin.
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email]));

  const admins = (profiles ?? []).map((p) => ({ ...p, email: emailById.get(p.id) ?? null }));
  return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin("manage_admins");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const adminRole = body?.adminRole;
  if (!email || !["super_admin", "platform_admin", "operations_admin"].includes(adminRole)) {
    return NextResponse.json({ error: "Email et rôle valides requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const targetUser = usersData?.users.find((u: any) => u.email?.toLowerCase() === email);
  if (!targetUser) {
    return NextResponse.json({ error: "Aucun compte existant avec cet email — l'utilisateur doit d'abord s'inscrire sur Écoles237" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: "platform_admin", admin_role: adminRole })
    .eq("id", targetUser.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.rpc("log_platform_action", {
    p_action: "admin_created",
    p_target_type: "profile",
    p_target_id: targetUser.id,
    p_metadata: { email, admin_role: adminRole },
  });

  return NextResponse.json({ ok: true });
}
