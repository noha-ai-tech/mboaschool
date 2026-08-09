// POST /api/admin/ecoles/[id]/suspendre (Mission 08, Phase 4)
// Suspension = changement de statut, jamais de suppression physique.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_schools");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

  const admin = createAdminClient();
  const { data: school } = await admin.from("establishments").select("id, name, verification_status").eq("id", id).single();
  if (!school) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });

  if (school.verification_status === "suspended") {
    return NextResponse.json({ error: "Cet établissement est déjà suspendu" }, { status: 409 });
  }

  const { error } = await admin
    .from("establishments")
    .update({ verification_status: "suspended" })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.rpc("log_platform_action", {
    p_action: "school_suspended",
    p_target_type: "establishment",
    p_target_id: id,
    p_metadata: { previous_status: school.verification_status, name: school.name, reason },
  });

  return NextResponse.json({ ok: true });
}
