// POST /api/admin/ecoles/[id]/plan (Mission 08, Phase 6)
// Enregistre un nouvel abonnement commercial (subscriptions — RLS
// platform_admin réelle, migration 0013) et, uniquement pour l'offre
// "pro", synchronise establishments.forfait (colonne technique de gating,
// migration 0005, déjà en production) via le client admin. Les offres
// "decouverte"/"verifiee" n'écrivent jamais sur `forfait` — elles ne
// modifient pas l'accès aux fonctionnalités Pro existantes.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/platform/requireAdmin";

const PLANS = ["decouverte", "verifiee", "pro"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("manage_subscriptions");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan;
  const expiresAt = typeof body?.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;

  if (!PLANS.includes(plan)) {
    return NextResponse.json({ error: "Offre invalide" }, { status: 400 });
  }

  const { data: subscription, error: subError } = await auth.supabase
    .from("subscriptions")
    .insert({
      establishment_id: id,
      plan,
      expires_at: expiresAt,
      created_by: auth.user!.id,
    })
    .select("id")
    .single();

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });

  if (plan === "pro") {
    const admin = createAdminClient();
    await admin.from("establishments").update({ forfait: "pro" }).eq("id", id);
  }

  await auth.supabase.rpc("log_platform_action", {
    p_action: "subscription_changed",
    p_target_type: "establishment",
    p_target_id: id,
    p_metadata: { plan, subscription_id: subscription?.id },
  });

  return NextResponse.json({ ok: true });
}
