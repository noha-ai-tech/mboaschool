// PATCH /api/admin/administrateurs/[id] — change le rôle d'un administrateur
// DELETE /api/admin/administrateurs/[id] — retire le statut d'administrateur
//   (jamais une suppression physique du profil — voir Phase 4 du POC :
//   "aucune suppression physique" s'applique aussi ici, seul le rôle change)
//
// Mission 08, Phase 2. Le trigger protect_last_super_admin (migration 0013)
// bloque, en base, toute tentative qui laisserait la plateforme sans aucun
// Super Admin — cette route ne fait que relayer l'erreur Postgres le cas
// échéant.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_admins");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const adminRole = body?.adminRole;
  if (!["super_admin", "platform_admin", "operations_admin"].includes(adminRole)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ admin_role: adminRole }).eq("id", id);
  if (error) {
    // Message Postgres du trigger protect_last_super_admin renvoyé tel quel.
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  await auth.supabase.rpc("log_platform_action", {
    p_action: "admin_role_changed",
    p_target_type: "profile",
    p_target_id: id,
    p_metadata: { new_admin_role: adminRole },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_admins");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: "parent", admin_role: null }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  await auth.supabase.rpc("log_platform_action", {
    p_action: "admin_role_changed",
    p_target_type: "profile",
    p_target_id: id,
    p_metadata: { removed: true },
  });

  return NextResponse.json({ ok: true });
}
