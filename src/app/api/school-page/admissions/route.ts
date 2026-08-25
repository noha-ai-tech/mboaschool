// PATCH /api/school-page/admissions — CMS-F.8.1 P1-A.
// Réutilise authorizeSchoolMutation() — même autorisation que le reste du
// CMS. N'importe, ne lit ni n'écrit JAMAIS `public.applications` (dossiers
// individuels privés) : cette route ne connaît que
// `admissions_config.is_open`.
//
// CMS-F.8.1 — cette route ne mute plus QUE is_open. Les champs descriptifs
// (levels, conditions, required_documents, period_start, period_end,
// additional_info) sont désormais exclusivement des domaines GLOBAL DRAFT
// (Draft PATCH -> Preview -> Publish, voir CMS-F.2/F.3) : les accepter ici
// serait un contournement direct-live du cycle de vie approuvé (l'ancien
// comportement, fermé par ce sprint — voir le rapport CMS-F.8 pour l'audit
// qui l'a trouvé). is_open reste la SEULE exception immediate-live
// documentée depuis CMS-F.3 §11 — jamais déplacée dans le brouillon.

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

export async function PATCH(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const keys = Object.keys(body as Record<string, unknown>);
  const rejected = keys.filter((k) => k !== "is_open");
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Champ(s) non autorisé(s) : ${rejected.join(", ")}` }, { status: 400 });
  }

  const isOpen = (body as { is_open?: unknown }).is_open;
  if (typeof isOpen !== "boolean") {
    return NextResponse.json({ error: "is_open doit être un booléen" }, { status: 400 });
  }

  const { context } = auth;
  const { data: existing } = await context.supabase
    .from("admissions_config")
    .select("id")
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  const { error } = existing
    ? await context.supabase.from("admissions_config").update({ is_open: isOpen }).eq("id", existing.id)
    : await context.supabase.from("admissions_config").insert({ establishment_id: context.establishmentId, is_open: isOpen });

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, is_open: isOpen });
}
