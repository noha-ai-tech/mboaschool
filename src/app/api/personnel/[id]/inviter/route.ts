// POST /api/personnel/[id]/inviter
// Invitation par email (Phase 4, mode "email") — généralise
// /api/enseignants/[id]/inviter à tout membre du personnel, pas seulement
// aux enseignants. Si le membre est un enseignant (staff_members.enseignant_id
// non nul), le rôle "teacher" est affecté comme avant ; sinon, la personne
// obtient un compte "parent" au sens système (aucun rôle organisationnel
// dédié dans `user_role` — voir docs/pro/03_ROLES.md sur ce choix).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffMemberId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { data: member } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, email, user_id, enseignant_id")
    .eq("id", staffMemberId)
    .eq("etablissement_id", etablissement.id)
    .single();

  if (!member) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
  if (!member.email) {
    return NextResponse.json({ error: "Aucun email renseigné pour cette personne" }, { status: 400 });
  }
  if (member.user_id) {
    return NextResponse.json({ error: "Cette personne a déjà un compte actif" }, { status: 409 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = createAdminClient();

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(member.email, {
    data: { role: member.enseignant_id ? "teacher" : undefined },
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteError) {
    if (inviteError.message?.includes("already been registered")) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Échec de l'invitation : ${inviteError.message}` }, { status: 500 });
  }

  await supabase
    .from("staff_members")
    .update({ invite_envoyee_le: new Date().toISOString(), access_mode: "email" })
    .eq("id", staffMemberId);

  return NextResponse.json({
    ok: true,
    message: `Invitation envoyée à ${member.first_name} ${member.last_name} (${member.email})`,
  });
}
