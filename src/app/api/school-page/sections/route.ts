// PUT /api/school-page/sections — CMS-B.2 §9/§11/§12.
// Reçoit systématiquement l'ordre complet des 8 clés autorisées (jamais un
// reorder incrémental) et fait un upsert groupé en une seule requête —
// jamais une requête par mouvement. Rejette toute section_key étrangère et
// toute duplication avant d'écrire quoi que ce soit.
//
// Dépend de la table `school_page_sections` (migration 0021, préparée mais
// NON exécutée) — tant qu'elle n'existe pas en production, cette route
// répond 500 de façon prévisible (voir CMS-B.2 §14 : erreur honnête, jamais
// de faux "Enregistré").

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const ALLOWED_SECTION_KEYS = [
  "presentation", "admissions", "gallery", "news",
  "documents", "infrastructure", "pricing", "contact",
] as const;
type SectionKey = typeof ALLOWED_SECTION_KEYS[number];

type SectionInput = { section_key: string; position: number; is_visible: boolean };

export async function PUT(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  // "error" in auth (plutôt que !auth.ok) : sous strict:false (config du
  // projet), le rétrécissement de cette union discriminée sur !auth.ok ne
  // fonctionne pas de façon fiable avec TypeScript 6 — vérifié isolément.
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const sections = (body as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections) || sections.length !== ALLOWED_SECTION_KEYS.length) {
    return NextResponse.json({ error: "L'ordre complet des 8 sections est requis" }, { status: 400 });
  }

  const seen = new Set<string>();
  for (const raw of sections) {
    const s = raw as Partial<SectionInput>;
    if (typeof s.section_key !== "string" || !ALLOWED_SECTION_KEYS.includes(s.section_key as SectionKey)) {
      return NextResponse.json({ error: `section_key invalide : ${String(s.section_key)}` }, { status: 400 });
    }
    if (seen.has(s.section_key)) {
      return NextResponse.json({ error: `section_key dupliquée : ${s.section_key}` }, { status: 400 });
    }
    seen.add(s.section_key);
    if (typeof s.position !== "number" || !Number.isInteger(s.position) || s.position < 0) {
      return NextResponse.json({ error: `position invalide pour ${s.section_key}` }, { status: 400 });
    }
    if (typeof s.is_visible !== "boolean") {
      return NextResponse.json({ error: `is_visible invalide pour ${s.section_key}` }, { status: 400 });
    }
  }
  if (seen.size !== ALLOWED_SECTION_KEYS.length) {
    return NextResponse.json({ error: "Toutes les sections doivent être présentes exactement une fois" }, { status: 400 });
  }

  const { context } = auth;
  const rows = (sections as SectionInput[]).map((s) => ({
    establishment_id: context.establishmentId,
    section_key: s.section_key,
    position: s.position,
    is_visible: s.is_visible,
  }));

  const { error } = await context.supabase
    .from("school_page_sections")
    .upsert(rows, { onConflict: "establishment_id,section_key" });

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
