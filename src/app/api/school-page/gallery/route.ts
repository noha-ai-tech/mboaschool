// POST/DELETE /api/school-page/gallery — CMS-C §6, CMS-F.6 Gallery Draft
// Lifecycle.
// Réutilise school_images + le bucket school-images existants.
// L'ancienne page dashboard/ecole/galerie écrivait directement client→DB ;
// elle redirige désormais vers l'éditeur CMS (CMS-F.6) pour ne laisser
// qu'UN SEUL chemin d'écriture, celui-ci.
//
// CMS-F.6 — upload et suppression sont désormais conscients du brouillon :
//   - POST insère toujours status='draft_pending_add' (jamais 'live'
//     directement) — la photo n'apparaît publiquement qu'après Publish
//     (publish_school_page promeut alors les lignes draft_pending_add).
//   - DELETE ne supprime réellement (Storage + DB) qu'une image
//     status='draft_pending_add' — elle n'a jamais été publique, rien à
//     préserver. Pour une image status='live', cette route REFUSE
//     (l'intention de suppression doit passer par
//     school_page_drafts.payload.gallery.remove_ids via un PATCH
//     /api/school-page/draft, jamais une suppression immédiate — voir le
//     tiroir Galerie de l'éditeur).
//
// La mutation passe par authorizeSchoolMutation (CMS-B.2 §6) : l'établissement
// actif est résolu et revérifié côté serveur, jamais accepté depuis le
// navigateur — la RLS de school_images/school-images (déjà correcte,
// multi-écoles par construction) reste une deuxième protection, jamais
// contournée.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const BUCKET = "school-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo — aligné sur la config documentée du bucket.
const MAX_CAPTION_LENGTH = 200;

// Extension dérivée du MIME type validé, jamais du nom de fichier fourni par
// le navigateur — élimine toute manipulation de chemin (`../`, extension
// usurpée) dès la source.
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
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
      { error: "Type de fichier non autorisé (JPG, PNG, WEBP ou GIF uniquement)" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_BYTES / 1024 / 1024} Mo)` }, { status: 400 });
  }

  const rawCaption = form.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption.trim().slice(0, MAX_CAPTION_LENGTH) : null;

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
    .from("school_images")
    .insert({
      establishment_id: context.establishmentId,
      url: publicUrlData.publicUrl,
      storage_path: path,
      caption: caption || null,
      // CMS-F.6 — jamais 'live' directement : la photo reste en attente
      // de publication jusqu'à Publish (publish_school_page la promeut).
      status: "draft_pending_add",
    })
    .select("id, url, storage_path, caption, created_at, status")
    .single();

  if (dbError) {
    // Le fichier est déjà en Storage mais la ligne DB a échoué — on retire
    // l'orphelin plutôt que de laisser un fichier facturé mais invisible.
    await context.supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: `Échec de l'enregistrement : ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, image: row });
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

  // Re-scope explicite par l'établissement actif résolu côté serveur — un id
  // de photo seul n'est jamais une autorisation, même si la RLS bloquerait
  // déjà une tentative sur l'école d'un autre propriétaire.
  const { data: image } = await context.supabase
    .from("school_images")
    .select("id, storage_path, status")
    .eq("id", id)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  if (!image) {
    return NextResponse.json({ error: "Photo introuvable pour cet établissement" }, { status: 404 });
  }

  // CMS-F.6 — une image status='live' a déjà été publiée : sa suppression
  // ne peut jamais être immédiate ici, elle doit passer par
  // gallery.remove_ids (PATCH /api/school-page/draft), pour rester visible
  // publiquement jusqu'au prochain Publish. Refus explicite plutôt qu'un
  // silence qui laisserait croire à une suppression immédiate.
  if (image.status !== "draft_pending_add") {
    return NextResponse.json(
      {
        error:
          "Cette photo est déjà publiée — utilisez l'action « Supprimer » du brouillon (elle restera visible publiquement jusqu'à la prochaine publication).",
        error_code: "LIVE_IMAGE_NOT_DELETABLE",
      },
      { status: 409 }
    );
  }

  // status='draft_pending_add' : cette photo n'a jamais été publique, rien
  // à préserver — suppression réelle immédiate. Storage d'abord, puis DB
  // (CMS-F.6 §8) : si la suppression DB échoue après un Storage réussi, la
  // ligne peut rester avec une URL cassée et nécessiter un nettoyage
  // manuel — signalé honnêtement ci-dessous, jamais masqué.
  const { error: storageError } = await context.supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: `Échec de la suppression du fichier : ${storageError.message}` }, { status: 500 });
  }

  const { error: deleteError } = await context.supabase.from("school_images").delete().eq("id", image.id);

  if (deleteError) {
    return NextResponse.json(
      {
        error: `Le fichier a été supprimé mais l'enregistrement n'a pas pu être retiré (${deleteError.message}) — signalez ceci, un nettoyage manuel de la ligne peut être nécessaire.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
