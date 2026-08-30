// POST /api/personnel/creer
// Crée un membre du personnel (Mission 04, Phase 2/3). Si category='teacher',
// crée également la fiche `enseignants` correspondante (avec code_pointage),
// pour que la personne reste pleinement utilisable par le module Pro existant
// (matières, emplois du temps, pointage) — voir docs/pro/01_ARCHITECTURE.md.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";

const VALID_CATEGORIES = ["teacher", "admin", "direction", "support"];
const VALID_ROLES = [
  "admin_principal", "directeur", "proviseur", "principal", "censeur",
  "secretaire", "comptable", "enseignant", "assistant",
];

export async function POST(req: NextRequest) {
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

  const { first_name, last_name, email, phone, category, role, employment_type, date_entree } = body as {
    first_name?: string; last_name?: string; email?: string; phone?: string;
    category?: string; role?: string; employment_type?: string; date_entree?: string;
  };

  if (!first_name?.trim() || !last_name?.trim()) {
    return NextResponse.json({ error: "Nom et prénom sont requis" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  let enseignantId: string | null = null;

  if (category === "teacher") {
    // Génère un code_pointage à 4 chiffres unique — même logique que
    // /api/enseignants/creer, dupliquée volontairement ici plutôt que
    // partagée, pour ne pas modifier la route existante (hors périmètre).
    const { data: existingCodes } = await supabase
      .from("enseignants")
      .select("code_pointage")
      .eq("etablissement_id", etablissement.id)
      .not("code_pointage", "is", null);

    const used = new Set((existingCodes ?? []).map((e) => e.code_pointage));
    let code = "";
    for (let i = 0; i < 200; i++) {
      const candidate = Math.floor(1000 + Math.random() * 9000).toString();
      if (!used.has(candidate)) { code = candidate; break; }
    }

    const { data: enseignant, error: enseignantError } = await supabase
      .from("enseignants")
      .insert({
        etablissement_id: etablissement.id,
        nom: last_name.trim(),
        prenom: first_name.trim(),
        email: email?.trim() || null,
        code_pointage: code || null,
      })
      .select("id")
      .single();

    if (enseignantError || !enseignant) {
      return NextResponse.json(
        { error: `Échec de création de la fiche enseignant : ${enseignantError?.message ?? "erreur inconnue"}` },
        { status: 500 }
      );
    }
    enseignantId = enseignant.id;
  }

  const { data: staffMember, error } = await supabase
    .from("staff_members")
    .insert({
      etablissement_id: etablissement.id,
      enseignant_id: enseignantId,
      category,
      role,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      employment_type: employment_type || null,
      date_entree: date_entree || null,
    })
    .select("id")
    .single();

  if (error || !staffMember) {
    return NextResponse.json(
      { error: `Échec de création : ${error?.message ?? "erreur inconnue"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, staffMemberId: staffMember.id });
}
