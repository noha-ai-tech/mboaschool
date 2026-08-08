// POST /api/claims
// Soumission d'une demande de revendication d'établissement (Mission 02,
// Phase 4). Réservé aux utilisateurs authentifiés — voir docs/onboarding/SECURITY.md
// sur le choix d'exiger un compte avant de pouvoir soumettre une demande.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchClaimNotification } from "@/lib/notifications/claimNotifications";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { establishment_id, first_name, last_name, role_title, phone, email, comments } = body as {
    establishment_id?: string;
    first_name?: string;
    last_name?: string;
    role_title?: string;
    phone?: string;
    email?: string;
    comments?: string;
  };

  if (!establishment_id || !first_name?.trim() || !last_name?.trim() || !role_title?.trim() || !phone?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Nom, prénom, fonction, téléphone et email sont requis" },
      { status: 400 }
    );
  }

  // Vérification préalable (message clair) — la garantie réelle reste la
  // policy RLS "requester creates own claim" (0008_school_onboarding.sql),
  // qui revérifie indépendamment ces deux conditions au moment de l'insert.
  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, owner_id")
    .eq("id", establishment_id)
    .single();

  if (!establishment) {
    return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });
  }
  if (establishment.owner_id) {
    return NextResponse.json(
      { error: "Cet établissement a déjà un propriétaire — la revendication n'est plus possible" },
      { status: 409 }
    );
  }

  const { data: existingClaim } = await supabase
    .from("establishment_claims")
    .select("id")
    .eq("establishment_id", establishment_id)
    .in("status", ["new", "in_review"])
    .maybeSingle();

  if (existingClaim) {
    return NextResponse.json(
      { error: "Une demande de revendication est déjà en cours pour cet établissement" },
      { status: 409 }
    );
  }

  const { data: claim, error } = await supabase
    .from("establishment_claims")
    .insert({
      establishment_id,
      requester_user_id: user.id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      role_title: role_title.trim(),
      phone: phone.trim(),
      email: email.trim(),
      comments: comments?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !claim) {
    return NextResponse.json(
      { error: `Échec de l'envoi de la demande : ${error?.message ?? "erreur inconnue"}` },
      { status: 500 }
    );
  }

  // L'établissement passe automatiquement à `claim_requested` via le trigger
  // `establishment_claims_after_insert` (0008_school_onboarding.sql) — pas
  // besoin de mise à jour manuelle ici, et surtout pas via le client RLS du
  // demandeur qui n'a pas le droit d'écrire sur `establishments` (voir
  // docs/onboarding/SECURITY.md).

  await dispatchClaimNotification({
    event: "claim_received",
    claimId: claim.id,
    establishmentId: establishment_id,
    requesterEmail: email.trim(),
    requesterName: `${first_name.trim()} ${last_name.trim()}`,
    establishmentName: establishment.name,
  });

  return NextResponse.json({ ok: true, claimId: claim.id });
}
