// PATCH /api/school-page/presentation — CMS-B.2 §7.
// Whitelist stricte : uniquement `description`. Ne peut jamais toucher
// official_id / source_ministry / is_verified / forfait / owner_id, etc.

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const MAX_DESCRIPTION_LENGTH = 4000;
const ALLOWED_FIELDS = new Set(["description"]);

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

  const { description } = body as { description?: unknown };
  if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: "Description invalide" }, { status: 400 });
  }

  const { context } = auth;
  const { error } = await context.supabase
    .from("establishments")
    .update({ description })
    .eq("id", context.establishmentId)
    .eq("owner_id", context.userId);

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, description });
}
