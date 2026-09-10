// POST /api/admin/establishment-requests/[id]/reject
// Refuse une proposition d'établissement absent (doublon confirmé,
// informations invalides, etc.). Aucun établissement public n'est jamais
// créé pour une demande refusée — voir approve/route.ts pour la seule
// voie de création (transaction atomique).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchClaimNotification } from "@/lib/notifications/claimNotifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "platform_admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.trim() : null;
  const asDuplicate = body?.duplicate === true;

  const admin = createAdminClient();

  const { data: request } = await admin
    .from("establishment_creation_requests")
    .select("id, status, requester_user_id, proposed_name, first_name, last_name")
    .eq("id", requestId)
    .single();

  if (!request) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (!["pending", "under_review"].includes(request.status)) {
    return NextResponse.json(
      { error: `Cette demande a déjà été traitée (statut actuel : ${request.status})` },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("establishment_creation_requests")
    .update({
      status: asDuplicate ? "duplicate" : "rejected",
      admin_comment: reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: requesterAuth } = await admin.auth.admin.getUserById(request.requester_user_id);
  await dispatchClaimNotification({
    event: "claim_rejected",
    claimId: requestId,
    establishmentId: "",
    requesterEmail: requesterAuth?.user?.email ?? "",
    requesterName: `${request.first_name} ${request.last_name}`,
    establishmentName: request.proposed_name,
    reason: reason ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
