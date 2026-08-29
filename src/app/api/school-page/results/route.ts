// POST/DELETE /api/school-page/results — PUBLIC-SITE-02 §3/§7. Exam
// results draft lifecycle, exact mirror of /api/school-page/gallery
// (school_images): POST always inserts status='draft_pending_add' (never
// 'live' directly — publish_school_page() promotes it), DELETE only ever
// removes a 'draft_pending_add' row (never a 'live' one — that intention
// goes through payload.results.remove_ids via PATCH /api/school-page/draft
// instead, so a published result stays visible until the next Publish).
//
// No in-place edit: correcting an already-published result means adding
// its replacement (POST, draft_pending_add) and listing the old row's id
// in payload.results.remove_ids — same UX as replacing a gallery photo,
// deliberately not a richer mechanism (PUBLIC-SITE-02 §4 — smallest clean
// extension, no page-builder-style edit-in-place).

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const MAX_EXAM_LENGTH = 60;
const CURRENT_YEAR = new Date().getFullYear();

function cleanNumber(value: unknown, min: number, max?: number): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || (max !== undefined && n > max)) return "invalid";
  return n;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { context } = auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const exam = typeof input.exam === "string" ? input.exam.trim() : "";
  if (!exam || exam.length > MAX_EXAM_LENGTH) {
    return NextResponse.json({ error: `exam requis (texte, max ${MAX_EXAM_LENGTH} caractères)` }, { status: 400 });
  }

  const academicYear = cleanNumber(input.academic_year, 1990, CURRENT_YEAR + 1);
  if (academicYear === "invalid" || academicYear === null) {
    return NextResponse.json({ error: `academic_year requis (entier entre 1990 et ${CURRENT_YEAR + 1})` }, { status: 400 });
  }

  const candidatesCount = cleanNumber(input.candidates_count, 0);
  if (candidatesCount === "invalid") {
    return NextResponse.json({ error: "candidates_count invalide (entier positif ou null)" }, { status: 400 });
  }
  const admittedCount = cleanNumber(input.admitted_count, 0);
  if (admittedCount === "invalid") {
    return NextResponse.json({ error: "admitted_count invalide (entier positif ou null)" }, { status: 400 });
  }
  if (candidatesCount !== null && admittedCount !== null && admittedCount > candidatesCount) {
    return NextResponse.json({ error: "admitted_count ne peut pas dépasser candidates_count" }, { status: 400 });
  }

  let successRate: number | null = null;
  if (input.success_rate_percent !== null && input.success_rate_percent !== undefined && input.success_rate_percent !== "") {
    const n = typeof input.success_rate_percent === "number" ? input.success_rate_percent : Number(input.success_rate_percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "success_rate_percent invalide (nombre entre 0 et 100, ou null)" }, { status: 400 });
    }
    successRate = Math.round(n * 100) / 100;
  }

  const { data: row, error: dbError } = await context.supabase
    .from("school_exam_results")
    .insert({
      establishment_id: context.establishmentId,
      exam,
      academic_year: academicYear,
      candidates_count: candidatesCount,
      admitted_count: admittedCount,
      success_rate_percent: successRate,
      // Jamais 'live' directement — reste en attente jusqu'au Publish
      // (publish_school_page promeut les lignes draft_pending_add).
      status: "draft_pending_add",
    })
    .select("id, exam, academic_year, candidates_count, admitted_count, success_rate_percent, status, created_at")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: row });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { context } = auth;

  const body = await req.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const { data: result } = await context.supabase
    .from("school_exam_results")
    .select("id, status")
    .eq("id", id)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  if (!result) {
    return NextResponse.json({ error: "Résultat introuvable pour cet établissement" }, { status: 404 });
  }

  if (result.status !== "draft_pending_add") {
    return NextResponse.json(
      {
        error:
          "Ce résultat est déjà publié — utilisez l'action « Supprimer » du brouillon (il restera visible publiquement jusqu'à la prochaine publication).",
        error_code: "LIVE_RESULT_NOT_DELETABLE",
      },
      { status: 409 }
    );
  }

  const { error: deleteError } = await context.supabase.from("school_exam_results").delete().eq("id", result.id);
  if (deleteError) {
    return NextResponse.json({ error: `Échec de la suppression : ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
