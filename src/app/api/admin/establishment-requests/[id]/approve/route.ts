// POST /api/admin/establishment-requests/[id]/approve
// Valide une proposition d'établissement absent (ONBOARDING-01 Phase 7) :
// crée l'établissement et le rattache au demandeur en une seule transaction
// atomique via approve_establishment_creation_request (SECURITY DEFINER),
// jamais via des écritures séparées depuis cette route — voir la migration
// pour le raisonnement (aucun état partiel possible : établissement sans
// owner, ou demande "approved" sans établissement réel).

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
  const adminComment = typeof body?.comment === "string" ? body.comment.trim() : null;

  // La fonction re-vérifie elle-même le rôle admin et le statut de la
  // demande à l'intérieur de sa propre transaction (voir la migration) —
  // cette vérification ici n'est qu'un premier filtre pour un message
  // d'erreur plus clair, jamais la seule garantie de sécurité.
  const { data: newEstablishmentId, error } = await supabase.rpc(
    "approve_establishment_creation_request",
    { p_request_id: requestId, p_admin_comment: adminComment }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("establishment_creation_requests")
    .select("requester_user_id, proposed_name, first_name, last_name")
    .eq("id", requestId)
    .single();

  if (request) {
    const { data: requesterAuth } = await admin.auth.admin.getUserById(request.requester_user_id);
    await dispatchClaimNotification({
      event: "claim_accepted",
      claimId: requestId,
      establishmentId: newEstablishmentId,
      requesterEmail: requesterAuth?.user?.email ?? "",
      requesterName: `${request.first_name} ${request.last_name}`,
      establishmentName: request.proposed_name,
    });
  }

  return NextResponse.json({ ok: true, establishmentId: newEstablishmentId });
}
