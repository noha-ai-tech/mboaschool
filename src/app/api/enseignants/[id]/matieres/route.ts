import { NextRequest, NextResponse } from "next/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";
import { isValidEstablishmentId } from "@/lib/school/establishmentContext";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: enseignantId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !isValidEstablishmentId(enseignantId)) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const matiereIds = Array.isArray(body.matiereIds)
    ? Array.from(new Set<string>(body.matiereIds.filter(isValidEstablishmentId)))
    : null;
  if (!matiereIds || matiereIds.length !== body.matiereIds.length) {
    return NextResponse.json({ error: "Liste de matières invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const access = await authorizeEstablishmentRoute({
    supabase,
    requestedEstablishmentId: body.requestedEstablishmentId,
    capability: "teachers:manage",
  });
  if (!access.ok) return access.response;

  const { data: enseignant, error: enseignantError } = await supabase
    .from("enseignants")
    .select("id")
    .eq("id", enseignantId)
    .eq("etablissement_id", access.establishment.id)
    .maybeSingle();

  if (enseignantError || !enseignant) {
    return NextResponse.json({ error: "Enseignant introuvable dans cet établissement" }, { status: 404 });
  }

  if (matiereIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const { data: matieres, error: matieresError } = await supabase
    .from("matieres")
    .select("id")
    .eq("etablissement_id", access.establishment.id)
    .in("id", matiereIds);

  if (matieresError || matieres?.length !== matiereIds.length) {
    return NextResponse.json(
      { error: "Une matière n'appartient pas à cet établissement" },
      { status: 403 },
    );
  }

  const { error: insertError } = await supabase.from("enseignant_matieres").insert(
    matiereIds.map((matiereId) => ({
      enseignant_id: enseignantId,
      matiere_id: matiereId,
    })),
  );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: matiereIds.length });
}
