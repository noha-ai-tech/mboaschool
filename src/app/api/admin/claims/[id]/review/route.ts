// POST /api/admin/claims/[id]/review
// Fait passer une demande de "new" à "in_review" (Phase 5-6 de la mission
// School Onboarding). Réservé à platform_admin.
//
// Utilise le client service role pour écrire sur `establishments`, car la
// policy RLS platform_admin sur cette table est préparée mais non exécutée
// (voir supabase/migrations/0007_production_security_reconciliation.sql).
// L'autorisation réelle est vérifiée ici, côté serveur, avant tout accès —
// voir docs/onboarding/SECURITY.md.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchClaimNotification } from "@/lib/notifications/claimNotifications";

export async function POST(
  _req: NextRequest,
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

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("establishment_claims")
    .select("id, establishment_id, status, first_name, last_name, email, establishments(name)")
    .eq("id", claimId)
    .single();

  if (!claim) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (claim.status !== "new") {
    return NextResponse.json(
      { error: `Cette demande n'est plus au statut "nouvelle" (statut actuel : ${claim.status})` },
      { status: 409 }
    );
  }

  const { error: claimError } = await admin
    .from("establishment_claims")
    .update({ status: "in_review", reviewed_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (claimError) {
    return NextResponse.json({ error: `Échec : ${claimError.message}` }, { status: 500 });
  }

  await admin
    .from("establishments")
    .update({ verification_status: "under_review" })
    .eq("id", claim.establishment_id);

  const establishmentName =
    (claim.establishments as unknown as { name: string } | null)?.name ?? "établissement";

  await dispatchClaimNotification({
    event: "claim_in_review",
    claimId,
    establishmentId: claim.establishment_id,
    requesterEmail: claim.email,
    requesterName: `${claim.first_name} ${claim.last_name}`,
    establishmentName,
  });

  return NextResponse.json({ ok: true });
}
