// POST /api/establishment-requests
// Soumission d'une proposition d'établissement absent du registre
// (ONBOARDING-01). Réservé aux utilisateurs authentifiés, même garde que
// /api/claims — voir docs/onboarding/SECURITY.md.
//
// Ne crée JAMAIS l'établissement lui-même : la demande reste `pending`
// jusqu'à l'approbation admin (approve_establishment_creation_request),
// qui seule crée la fiche publique et rattache le propriétaire.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const {
    proposed_name,
    proposed_main_category,
    proposed_city,
    proposed_neighborhood,
    proposed_address,
    proposed_phone,
    proposed_email,
    proposed_website,
    first_name,
    last_name,
    role_title,
    comments,
    possible_duplicate_of,
  } = body as {
    proposed_name?: string;
    proposed_main_category?: string;
    proposed_city?: string;
    proposed_neighborhood?: string;
    proposed_address?: string;
    proposed_phone?: string;
    proposed_email?: string;
    proposed_website?: string;
    first_name?: string;
    last_name?: string;
    role_title?: string;
    comments?: string;
    possible_duplicate_of?: string | null;
  };

  if (
    !proposed_name?.trim() ||
    !proposed_phone?.trim() ||
    !proposed_email?.trim() ||
    !first_name?.trim() ||
    !last_name?.trim() ||
    !role_title?.trim()
  ) {
    return NextResponse.json(
      { error: "Nom de l'établissement, téléphone, email, prénom, nom et fonction sont requis" },
      { status: 400 }
    );
  }

  const { data: request, error } = await supabase
    .from("establishment_creation_requests")
    .insert({
      requester_user_id: user.id,
      proposed_name: proposed_name.trim(),
      proposed_main_category: proposed_main_category?.trim() || null,
      proposed_city: proposed_city?.trim() || null,
      proposed_neighborhood: proposed_neighborhood?.trim() || null,
      proposed_address: proposed_address?.trim() || null,
      proposed_phone: proposed_phone.trim(),
      proposed_email: proposed_email.trim(),
      proposed_website: proposed_website?.trim() || null,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      role_title: role_title.trim(),
      comments: comments?.trim() || null,
      possible_duplicate_of: possible_duplicate_of || null,
    })
    .select("id")
    .single();

  if (error || !request) {
    return NextResponse.json(
      { error: `Échec de l'envoi de la demande : ${error?.message ?? "erreur inconnue"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, requestId: request.id });
}
