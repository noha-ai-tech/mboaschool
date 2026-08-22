// POST /api/admin/claims/[id]/approve
// Valide une demande de revendication (Phase 6 de la mission School
// Onboarding) : lie automatiquement utilisateur → établissement → dashboard,
// en attribuant le demandeur comme Administrateur Principal (owner_id).
//
// Sécurité (Phase 8) : revérifie ATOMIQUEMENT, au moment de l'approbation
// (pas seulement à la soumission), qu'aucun autre owner n'a été attribué
// entre-temps — empêche qu'une école soit revendiquée deux fois en cas de
// double approbation concurrente. Voir docs/onboarding/SECURITY.md.

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

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("establishment_claims")
    .select("id, establishment_id, status, requester_user_id, first_name, last_name, email, establishments(name, owner_id)")
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

  const establishment = claim.establishments as unknown as { name: string; owner_id: string | null } | null;

  // Vérification atomique — voir l'en-tête de ce fichier.
  if (establishment?.owner_id) {
    return NextResponse.json(
      { error: "Cet établissement a déjà un propriétaire — impossible d'approuver cette demande" },
      { status: 409 }
    );
  }

  // SPRINT REGISTRY-NATIONAL-A.1 §10 — AUDIT DOCUMENTÉ (comportement
  // préexistant, INCHANGÉ ce sprint) : l'approbation d'une revendication
  // (identité/contact du demandeur revue par un admin) positionne aussi
  // is_verified=true. C'est une décision produit antérieure (Mission 02),
  // pas une action de l'owner — l'owner ne peut jamais déclencher cette
  // écriture lui-même (seul un platform_admin appelle cette route). Ce
  // is_verified=true reste PLATFORM_VERIFIED uniquement (vérification
  // d'identité du demandeur), JAMAIS OFFICIALLY_VERIFIED — voir
  // src/lib/trust/resolveEstablishmentTrustState.ts, qui ne dérive jamais
  // official_verification depuis claim_status/is_verified. Le badge public
  // affiché reste donc "Vérifié par Écoles237", jamais "Vérification
  // officielle".
  const { error: linkError } = await admin
    .from("establishments")
    .update({
      owner_id: claim.requester_user_id,
      verification_status: "active",
      is_claimed: true,
      is_verified: true,
    })
    .eq("id", claim.establishment_id)
    .is("owner_id", null); // garde-fou supplémentaire au niveau requête elle-même

  if (linkError) {
    return NextResponse.json({ error: `Échec de la liaison : ${linkError.message}` }, { status: 500 });
  }

  const { error: claimError } = await admin
    .from("establishment_claims")
    .update({
      status: "accepted",
      admin_comment: adminComment,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (claimError) {
    return NextResponse.json({ error: `Échec de mise à jour de la demande : ${claimError.message}` }, { status: 500 });
  }

  // Referme automatiquement toute autre demande concurrente restée en
  // attente pour ce même établissement — il n'y a plus qu'un seul
  // Administrateur Principal possible désormais.
  await admin
    .from("establishment_claims")
    .update({
      status: "rejected",
      admin_comment: "Une autre demande a été approuvée pour cet établissement.",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("establishment_id", claim.establishment_id)
    .in("status", ["new", "in_review"])
    .neq("id", claimId);

  await dispatchClaimNotification({
    event: "claim_accepted",
    claimId,
    establishmentId: claim.establishment_id,
    requesterEmail: claim.email,
    requesterName: `${claim.first_name} ${claim.last_name}`,
    establishmentName: establishment?.name ?? "établissement",
  });

  return NextResponse.json({ ok: true });
}
