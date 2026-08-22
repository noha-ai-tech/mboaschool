// POST /api/admin/ecoles/[id]/verifier (Mission 08, Phase 4)
// Écrit sur establishments.verification_status via le client admin, car
// aucune policy RLS UPDATE platform_admin n'existe encore sur cette table
// (préparée, migration 0007, non exécutée) — même contournement que
// /api/admin/claims/[id]/approve (Mission 02).
//
// SPRINT REGISTRY-NATIONAL-A.1 §9 — SÉMANTIQUE AUDITÉE ET CLARIFIÉE : cette
// route ne vérifie AUCUNE preuve ministérielle/officielle. Elle marque
// uniquement une vérification interne PLATEFORME (PLATFORM_VERIFIED dans
// src/lib/trust/resolveEstablishmentTrustState.ts) — jamais
// OFFICIALLY_VERIFIED. Le bouton admin correspondant a été renommé
// "Marquer vérifié par Écoles237" (jamais "Vérifier officiellement") pour
// refléter exactement cet effet. Ne PAS étendre cette route pour qu'elle
// affecte official_verification sans preuve documentaire réelle au niveau
// establishment_registry_identifiers.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_schools");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data: school } = await admin.from("establishments").select("id, name, verification_status").eq("id", id).single();
  if (!school) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });

  const { error } = await admin
    .from("establishments")
    .update({ verification_status: "verified", is_verified: true })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.rpc("log_platform_action", {
    p_action: "school_verified",
    p_target_type: "establishment",
    p_target_id: id,
    p_metadata: { previous_status: school.verification_status, name: school.name },
  });

  return NextResponse.json({ ok: true });
}
