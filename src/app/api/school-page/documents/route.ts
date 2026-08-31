// POST/DELETE /api/school-page/documents — CMS-E.
// Réutilise school_documents + le bucket school-documents existants (voir
// src/app/dashboard/ecole/documents/page.tsx pour le pattern d'origine,
// jusqu'ici en écriture directe client → RLS seule). Ici la mutation passe
// par authorizeSchoolMutation, même schéma que /api/school-page/gallery.
// Storage RLS déjà multi-écoles-safe (0022, EXISTS), aucune migration.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";
import { SCHOOL_DOCUMENT_TYPES } from "@/lib/schoolPage/documents";

const BUCKET = "school-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo — aligné sur la page dashboard existante.
const MAX_NAME_LENGTH = 200;
const DOC_TYPES = new Set<string>(SCHOOL_DOCUMENT_TYPES);

// Extension dérivée du MIME type validé, jamais du nom de fichier fourni
// par le navigateur — élimine toute manipulation de chemin.
const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export async function POST(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Type de fichier non autorisé (PDF, Word, Excel ou PowerPoint uniquement)" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_BYTES / 1024 / 1024} Mo)` }, { status: 400 });
  }

  const rawType = form.get("type");
  const type = typeof rawType === "string" && DOC_TYPES.has(rawType) ? rawType : "autre";

  const rawName = form.get("name");
  const name = typeof rawName === "string" && rawName.trim().length > 0
    ? rawName.trim().slice(0, MAX_NAME_LENGTH)
    : file.name.replace(/\.[^/.]+$/, "").slice(0, MAX_NAME_LENGTH) || "Document";
  const rawAcademicYear = form.get("academic_year");
  const academicYear = typeof rawAcademicYear === "string" && /^\d{4}-\d{4}$/.test(rawAcademicYear) ? rawAcademicYear : null;
  const rawDescription = form.get("description");
  const description = typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim().slice(0, 1000) : null;

  const { context } = auth;
  const path = `${context.establishmentId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await context.supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Échec de l'envoi : ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = context.supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data: row, error: dbError } = await context.supabase
    .from("school_documents")
    .insert({
      establishment_id: context.establishmentId,
      name,
      type,
      url: publicUrlData.publicUrl,
      storage_path: path,
      academic_year: academicYear,
      mime_type: file.type,
      description,
      is_public: true,
      status: "live",
    })
    .select("id, name, type, url, academic_year, mime_type, description, is_public, status, created_at")
    .single();

  if (dbError) {
    // Le fichier est déjà en Storage mais la ligne DB a échoué — retire
    // l'orphelin plutôt que de laisser un fichier facturé mais invisible.
    await context.supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: `Échec de l'enregistrement : ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: row });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const { context } = auth;

  // Re-scope explicite par l'établissement actif résolu côté serveur — un
  // id de document seul n'est jamais une autorisation, et le storage_path
  // réel vient de la ligne DB vérifiée, jamais d'un chemin fourni par le client.
  const { data: doc } = await context.supabase
    .from("school_documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document introuvable pour cet établissement" }, { status: 404 });
  }

  await context.supabase.storage.from(BUCKET).remove([doc.storage_path]);
  const { error: deleteError } = await context.supabase.from("school_documents").delete().eq("id", doc.id);

  if (deleteError) {
    return NextResponse.json({ error: `Échec de la suppression : ${deleteError.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
