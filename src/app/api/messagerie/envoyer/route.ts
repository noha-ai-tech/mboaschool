import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const access = await authorizeEstablishmentRoute({
    supabase,
    requestedEstablishmentId: body.requestedEstablishmentId,
    capability: "messaging:manage",
  });
  if (!access.ok) return access.response;
  const { establishment: etablissement, user } = access;

  const { titre, contenu, canal, departement_disciplinaire } = body as {
    titre?: string;
    contenu?: string;
    canal?: string;
    departement_disciplinaire?: string;
  };

  if (!titre?.trim() || !contenu?.trim()) {
    return NextResponse.json({ error: "Titre et contenu sont requis" }, { status: 400 });
  }
  if (!canal || !["global", "departement"].includes(canal)) {
    return NextResponse.json({ error: "Canal invalide — doit être 'global' ou 'departement'" }, { status: 400 });
  }
  if (canal === "departement" && !departement_disciplinaire?.trim()) {
    return NextResponse.json(
      { error: "Le département disciplinaire est requis pour un message ciblé" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("messages").insert({
    etablissement_id:          etablissement.id,
    auteur_id:                 user.id,
    canal,
    departement_disciplinaire: canal === "departement" ? departement_disciplinaire!.trim() : null,
    titre:                     titre.trim(),
    contenu:                   contenu.trim(),
  });

  if (error) {
    return NextResponse.json({ error: `Échec d'enregistrement : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
