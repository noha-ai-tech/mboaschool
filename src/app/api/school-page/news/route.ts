// POST/PATCH/DELETE /api/school-page/news — CMS-E.
// Réutilise school_announcements tel quel. RLS déjà multi-écoles-safe
// (exists(...owner_id=auth.uid()), auth-setup.sql), aucune migration. Même
// autorisation que le reste du CMS (authorizeSchoolMutation), jamais
// d'establishment_id accepté du client comme preuve.
//
// Colonnes réelles confirmées par sonde en production (pas seulement par
// le fichier de migration — dérive réelle constatée) :
//   id, establishment_id, title, content, is_important, created_at,
//   class_id, type. `published_at` N'EXISTE PAS en production malgré
// auth-setup.sql — jamais sélectionné ici. `content` est NOT NULL en
// production (contrairement au texte de la migration) — donc requis au
// même titre que `title`, jamais mis à NULL.

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 4000;
const ANNOUNCEMENT_TYPES = new Set(["announcement", "homework", "event", "reminder"]);
// PUBLIC-SITE-04 — event_date/event_start_time (migration 0036): optional,
// null for an ordinary announcement, populated for a real calendar event.
// Same immediate-live path as every other field on this table — never
// routed through school_page_drafts (school_announcements' lifecycle is
// unchanged, see PUBLIC-SITE-03/04).
const CREATE_FIELDS = new Set(["title", "content", "is_important", "type", "event_date", "event_start_time"]);
const UPDATE_FIELDS = new Set(["id", "title", "content", "is_important", "type", "event_date", "event_start_time"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}(:\d{2})?$/;

function cleanEventDate(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_DATE.test(raw) || Number.isNaN(new Date(raw).getTime())) {
    return { ok: false, error: "event_date invalide (AAAA-MM-JJ attendu, ou null)" };
  }
  return { ok: true, value: raw };
}

function cleanEventTime(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_TIME.test(raw)) {
    return { ok: false, error: "event_start_time invalide (HH:MM attendu, ou null)" };
  }
  return { ok: true, value: raw };
}

function cleanRequiredText(raw: unknown, label: string, maxLength: number): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: `${label} requis` };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: `${label} requis` };
  if (trimmed.length > maxLength) return { ok: false, error: `${label} trop long (max ${maxLength} caractères)` };
  return { ok: true, value: trimmed };
}

export async function POST(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }
  const rejected = Object.keys(body).filter((k) => !CREATE_FIELDS.has(k));
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Champ(s) non autorisé(s) : ${rejected.join(", ")}` }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const title = cleanRequiredText(input.title, "title", MAX_TITLE_LENGTH);
  if ("error" in title) return NextResponse.json({ error: title.error }, { status: 400 });
  const content = cleanRequiredText(input.content, "content", MAX_CONTENT_LENGTH);
  if ("error" in content) return NextResponse.json({ error: content.error }, { status: 400 });

  const is_important = "is_important" in input ? input.is_important : false;
  if (typeof is_important !== "boolean") {
    return NextResponse.json({ error: "is_important doit être un booléen" }, { status: 400 });
  }

  const type = "type" in input ? input.type : "announcement";
  if (typeof type !== "string" || !ANNOUNCEMENT_TYPES.has(type)) {
    return NextResponse.json({ error: "type invalide" }, { status: 400 });
  }

  const eventDate = cleanEventDate(input.event_date);
  if ("error" in eventDate) return NextResponse.json({ error: eventDate.error }, { status: 400 });
  const eventStartTime = cleanEventTime(input.event_start_time);
  if ("error" in eventStartTime) return NextResponse.json({ error: eventStartTime.error }, { status: 400 });
  if (eventStartTime.value && !eventDate.value) {
    return NextResponse.json({ error: "event_start_time nécessite event_date" }, { status: 400 });
  }

  const { context } = auth;
  const { data, error } = await context.supabase
    .from("school_announcements")
    .insert({
      establishment_id: context.establishmentId,
      title: title.value,
      content: content.value,
      is_important,
      type,
      event_date: eventDate.value,
      event_start_time: eventStartTime.value,
    })
    .select("id, title, content, is_important, type, event_date, event_start_time, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, announcement: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }
  const rejected = Object.keys(body).filter((k) => !UPDATE_FIELDS.has(k));
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Champ(s) non autorisé(s) : ${rejected.join(", ")}` }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (typeof input.id !== "string" || input.id.length === 0) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const { context } = auth;

  // Charge la ressource scopée par l'établissement ACTIF avant toute
  // mutation — un id d'annonce seul n'est jamais une autorisation.
  const { data: existing } = await context.supabase
    .from("school_announcements")
    .select("id")
    .eq("id", input.id)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Annonce introuvable pour cet établissement" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if ("title" in input) {
    const title = cleanRequiredText(input.title, "title", MAX_TITLE_LENGTH);
    if ("error" in title) return NextResponse.json({ error: title.error }, { status: 400 });
    update.title = title.value;
  }
  if ("content" in input) {
    const content = cleanRequiredText(input.content, "content", MAX_CONTENT_LENGTH);
    if ("error" in content) return NextResponse.json({ error: content.error }, { status: 400 });
    update.content = content.value;
  }
  if ("is_important" in input) {
    if (typeof input.is_important !== "boolean") {
      return NextResponse.json({ error: "is_important doit être un booléen" }, { status: 400 });
    }
    update.is_important = input.is_important;
  }
  if ("type" in input) {
    if (typeof input.type !== "string" || !ANNOUNCEMENT_TYPES.has(input.type)) {
      return NextResponse.json({ error: "type invalide" }, { status: 400 });
    }
    update.type = input.type;
  }
  if ("event_date" in input) {
    const eventDate = cleanEventDate(input.event_date);
    if ("error" in eventDate) return NextResponse.json({ error: eventDate.error }, { status: 400 });
    update.event_date = eventDate.value;
  }
  if ("event_start_time" in input) {
    const eventStartTime = cleanEventTime(input.event_start_time);
    if ("error" in eventStartTime) return NextResponse.json({ error: eventStartTime.error }, { status: 400 });
    update.event_start_time = eventStartTime.value;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("school_announcements")
    .update(update)
    .eq("id", existing.id)
    .select("id, title, content, is_important, type, event_date, event_start_time, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: `Échec de l'enregistrement : ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, announcement: data });
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
  const { data: existing } = await context.supabase
    .from("school_announcements")
    .select("id")
    .eq("id", id)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Annonce introuvable pour cet établissement" }, { status: 404 });
  }

  const { error } = await context.supabase.from("school_announcements").delete().eq("id", existing.id);
  if (error) {
    return NextResponse.json({ error: `Échec de la suppression : ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
