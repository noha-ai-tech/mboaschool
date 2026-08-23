// PATCH /api/school-page/contact — CMS-B.2 §8.
// Whitelist stricte : phone, email, website, address, city — confirmés
// owner-editable par la matrice DATA OWNERSHIP de CMS-A. Les champs
// registre (official_id, source_ministry, source_reference, verification
// status...) ne sont jamais dans cette liste, donc jamais modifiables ici,
// quel que soit le contenu du payload envoyé.

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const ALLOWED_FIELDS = new Set(["phone", "email", "website", "address", "city"]);
const MAX_FIELD_LENGTH = 320;

export async function PATCH(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  // "error" in auth (plutôt que !auth.ok) : sous strict:false (config du
  // projet), le rétrécissement de cette union discriminée sur !auth.ok ne
  // fonctionne pas de façon fiable avec TypeScript 6 — vérifié isolément.
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const rejected = Object.keys(body).filter((k) => !ALLOWED_FIELDS.has(k));
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Champ(s) non autorisé(s) : ${rejected.join(", ")}` }, { status: 400 });
  }

  const update: Record<string, string> = {};
  for (const key of Array.from(ALLOWED_FIELDS)) {
    if (key in body) {
      const value = (body as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: `Champ invalide : ${key}` }, { status: 400 });
      }
      update[key] = value;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const { context } = auth;
  const { error } = await context.supabase
    .from("establishments")
    .update(update)
    .eq("id", context.establishmentId)
    .eq("owner_id", context.userId);

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...update });
}
