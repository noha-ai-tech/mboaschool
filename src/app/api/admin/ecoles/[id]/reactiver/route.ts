// POST /api/admin/ecoles/[id]/reactiver (Mission 08, Phase 4)
// Restaure l'état précédent la suspension : 'active' si un Administrateur
// Principal est déjà lié (owner_id), sinon 'verified'.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_schools");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data: school } = await admin.from("establishments").select("id, name, verification_status, owner_id").eq("id", id).single();
  if (!school) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });

  if (school.verification_status !== "suspended") {
    return NextResponse.json({ error: "Cet établissement n'est pas suspendu" }, { status: 409 });
  }

  const restoredStatus = school.owner_id ? "active" : "verified";

  const { error } = await admin
    .from("establishments")
    .update({ verification_status: restoredStatus })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.rpc("log_platform_action", {
    p_action: "school_reactivated",
    p_target_type: "establishment",
    p_target_id: id,
    p_metadata: { restored_status: restoredStatus, name: school.name },
  });

  return NextResponse.json({ ok: true });
}
