// POST /api/personnel/[id]/code-acces
// Génère un code d'accès personnel — mode "sans email" (Phase 4), adapté au
// contexte camerounais où une partie du personnel n'a pas d'adresse email
// utilisable au quotidien.
//
// PÉRIMÈTRE HONNÊTE : cette route génère et enregistre un code unique par
// établissement (même principe que `enseignants.code_pointage`, déjà en
// production pour le pointage kiosque). Le directeur communique ce code
// directement (oralement, par SMS personnel, sur papier) au membre du
// personnel. Ce code N'EST PAS ENCORE relié à un mécanisme de connexion
// Supabase Auth complet (Supabase Auth ne propose pas nativement de
// connexion par code seul — il faudrait soit un email synthétique avec mot
// de passe dérivé, soit un pont d'authentification personnalisé, deux choix
// avec des implications de sécurité qui méritent une validation explicite
// avant d'être construits). Voir docs/pro/04_CONTRACTS.md et
// docs/pro/05_SECURITY.md pour le détail de cette limite assumée.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffMemberId } = await params;
  const supabase = await createClient();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  const access = await authorizeEstablishmentRoute({
    supabase,
    requestedEstablishmentId: body.requestedEstablishmentId,
    capability: "personnel:manage",
  });
  if (!access.ok) return access.response;
  const etablissement = access.establishment;

  const { data: member } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name")
    .eq("id", staffMemberId)
    .eq("etablissement_id", etablissement.id)
    .single();
  if (!member) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

  const { data: existingCodes } = await supabase
    .from("staff_members")
    .select("access_code")
    .eq("etablissement_id", etablissement.id)
    .not("access_code", "is", null);

  const used = new Set((existingCodes ?? []).map((s) => s.access_code));
  let code = "";
  for (let i = 0; i < 200; i++) {
    const candidate = Math.floor(100000 + Math.random() * 900000).toString();
    if (!used.has(candidate)) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
  }

  const { error } = await supabase
    .from("staff_members")
    .update({ access_mode: "code", access_code: code })
    .eq("id", staffMemberId)
    .eq("etablissement_id", etablissement.id);

  if (error) {
    return NextResponse.json({ error: `Échec : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    code,
    message: `Code généré pour ${member.first_name} ${member.last_name} — à communiquer directement.`,
  });
}
