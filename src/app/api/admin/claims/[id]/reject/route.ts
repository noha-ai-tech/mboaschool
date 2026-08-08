// POST /api/admin/claims/[id]/reject
// Refuse une demande de revendication. L'établissement redevient
// "referenced" (disponible pour une nouvelle revendication, y compris par
// quelqu'un d'autre) — voir docs/onboarding/STATES.md.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchClaimNotification } from "@/lib/notifications/claimNotifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;
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
  if (!adminComment) {
    return NextResponse.json({ error: "Un commentaire expliquant le refus est requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("establishment_claims")
    .select("id, establishment_id, status, first_name, last_name, email, establishments(name)")
    .eq("id", claimId)
    .single();

  if (!claim) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (!["new", "in_review"].includes(claim.status)) {
    return NextResponse.json(
      { error: `Cette demande a déjà été traitée (statut actuel : ${claim.status})` },
      { status: 409 }
    );
  }

  const { error: claimError } = await admin
    .from("establishment_claims")
    .update({
      status: "rejected",
      admin_comment: adminComment,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (claimError) {
    return NextResponse.json({ error: `Échec : ${claimError.message}` }, { status: 500 });
  }

  // L'établissement redevient disponible pour une nouvelle revendication,
  // uniquement s'il n'a pas déjà un propriétaire par ailleurs (garde-fou).
  await admin
    .from("establishments")
    .update({ verification_status: "referenced" })
    .eq("id", claim.establishment_id)
    .is("owner_id", null);

  const establishmentName =
    (claim.establishments as unknown as { name: string } | null)?.name ?? "établissement";

  await dispatchClaimNotification({
    event: "claim_rejected",
    claimId,
    establishmentId: claim.establishment_id,
    requesterEmail: claim.email,
    requesterName: `${claim.first_name} ${claim.last_name}`,
    establishmentName,
    reason: adminComment,
  });

  return NextResponse.json({ ok: true });
}
