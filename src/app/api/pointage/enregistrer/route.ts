// POST /api/pointage/enregistrer
// Body: { code_pointage: string, type: 'arrivee' | 'depart', photo: string (base64 data URL) }
//
// Sécurité : la session Supabase appartient au propriétaire de l'établissement (mode kiosque).
// Le code_pointage identifie quel enseignant pointe, il ne remplace pas l'authentification.

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
    capability: "attendance:manage",
  });
  if (!access.ok) return access.response;
  const etablissementId = access.establishment.id;

  const { code_pointage, type, photo } = body as {
    code_pointage?: string;
    type?: string;
    photo?: string;
  };

  if (!code_pointage || !type || !photo) {
    return NextResponse.json(
      { error: "Paramètres manquants : code_pointage, type et photo sont requis" },
      { status: 400 }
    );
  }
  if (!["arrivee", "depart"].includes(type)) {
    return NextResponse.json({ error: "Type invalide — doit être 'arrivee' ou 'depart'" }, { status: 400 });
  }

  // Identifier l'enseignant par son code de pointage dans cet établissement
  const { data: enseignant } = await supabase
    .from("enseignants")
    .select("id, nom, prenom")
    .eq("etablissement_id", etablissementId)
    .eq("code_pointage", code_pointage)
    .single();

  if (!enseignant) {
    return NextResponse.json(
      { error: "Code incorrect — aucun enseignant trouvé avec ce code" },
      { status: 404 }
    );
  }

  // Upload de la photo dans le bucket pointages-photos
  const now = new Date();
  const timestamp = now.getTime();
  const photoPath = `${etablissementId}/${enseignant.id}/${timestamp}.jpg`;

  const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
  const photoBuffer = Buffer.from(base64Data, "base64");

  const { error: uploadError } = await supabase.storage
    .from("pointages-photos")
    .upload(photoPath, photoBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Échec upload photo : ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Enregistrement du pointage
  const { error: insertError } = await supabase.from("pointages").insert({
    etablissement_id: etablissementId,
    enseignant_id: enseignant.id,
    type,
    photo_path: photoPath,
    horodatage: now.toISOString(),
  });

  if (insertError) {
    return NextResponse.json(
      { error: `Échec enregistrement : ${insertError.message}` },
      { status: 500 }
    );
  }

  const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const typeLabel = type === "arrivee" ? "arrivée" : "départ";

  return NextResponse.json({
    ok: true,
    enseignant: { nom: enseignant.nom, prenom: enseignant.prenom },
    message: `Bonjour ${enseignant.prenom} ${enseignant.nom}, ${typeLabel} enregistrée à ${heure}`,
  });
}
