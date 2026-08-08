// POST /api/payroll/[id]/valider-direction
// Etape 3 du workflow (Phase 7) : Validation RH -> Validation Direction ->
// Paie validee (les deux dernieres etapes sont fusionnees en une seule
// action explicite : une fois valide par la Direction, le bulletin est
// immediatement considere "paie_validee" et devient visible a l'enseignant
// concerne - voir la policy bulletins_self_read, migration 0011). Meme
// limite de frontiere d'acces que valider-rh (voir ce fichier).

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
  if (bulletin.statut !== "valide_rh") {
    return NextResponse.json({ error: `Statut actuel invalide pour cette action : ${bulletin.statut}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("bulletins_paie")
    .update({
      statut: "paie_validee",
      valide_direction_le: now,
      valide_direction_par: user.id,
      updated_at: now,
    })
    .eq("id", bulletinId);
  if (error) return NextResponse.json({ error: `Echec : ${error.message}` }, { status: 500 });

  await supabase.from("bulletin_paie_historique").insert([
    { bulletin_id: bulletinId, statut_precedent: "valide_rh", statut_nouveau: "valide_direction", change_par: user.id },
    { bulletin_id: bulletinId, statut_precedent: "valide_direction", statut_nouveau: "paie_validee", change_par: user.id, commentaire: "Validation direction et publication a l'enseignant" },
  ]);

  return NextResponse.json({ ok: true });
}
