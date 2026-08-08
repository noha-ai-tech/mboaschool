// POST /api/payroll/[id]/valider-rh
// Etape 2 du workflow (Phase 7) : Brouillon -> Validation RH.
//
// LIMITE ASSUMEE : cette route est accessible au proprietaire de
// l'etablissement (meme frontiere que le reste du module Pro), pas
// specifiquement a un compte avec staff_role='comptable'/'secretaire' - les
// permissions par role organisationnel restent non appliquees en RLS
// (voir docs/pro/03_ROLES.md, Mission 04). "Validation RH" et "Validation
// Direction" sont deux etapes historisees distinctes du workflow, pas
// deux frontieres d'acces techniquement differentes dans cette version.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bulletinId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifie" }, { status: 401 });

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) return NextResponse.json({ error: "Acces refuse" }, { status: 403 });

  const { data: bulletin } = await supabase
    .from("bulletins_paie")
    .select("id, statut")
    .eq("id", bulletinId)
    .eq("etablissement_id", etablissement.id)
    .single();
  if (!bulletin) return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });
  if (bulletin.statut !== "brouillon") {
    return NextResponse.json({ error: `Statut actuel invalide pour cette action : ${bulletin.statut}` }, { status: 409 });
  }

  const { error } = await supabase
    .from("bulletins_paie")
    .update({ statut: "valide_rh", valide_rh_le: new Date().toISOString(), valide_rh_par: user.id, updated_at: new Date().toISOString() })
    .eq("id", bulletinId);
  if (error) return NextResponse.json({ error: `Echec : ${error.message}` }, { status: 500 });

  await supabase.from("bulletin_paie_historique").insert({
    bulletin_id: bulletinId,
    statut_precedent: "brouillon",
    statut_nouveau: "valide_rh",
    change_par: user.id,
  });

  return NextResponse.json({ ok: true });
}
