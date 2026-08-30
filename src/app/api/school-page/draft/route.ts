// GET/PATCH /api/school-page/draft — CMS-F.2 DRAFT READ / WRITE SERVICE.
//
// Service de brouillon isolé. N'écrit JAMAIS dans les tables live
// (establishments, fees, infrastructures, admissions_config,
// school_page_sections) — uniquement dans school_page_drafts (migration
// 0026, préparée mais NON exécutée ; tant qu'elle n'existe pas en
// production, cette route répond 500 de façon prévisible, même discipline
// que sections/hero/pricing/admissions).
//
// GET : sème un snapshot des valeurs live si aucun brouillon n'existe
// encore pour l'établissement actif, sinon renvoie le brouillon existant
// tel quel (jamais re-synchronisé avec le live après la première création
// — c'est tout l'intérêt d'un brouillon).
//
// PATCH : reçoit le payload COMPLET du brouillon (jamais une clé isolée),
// le valide intégralement, puis upsert dans school_page_drafts avec
// is_dirty=true. Ne touche jamais school_images.status (réservé à
// CMS-F.6) — gallery.remove_ids est seulement validé et stocké ici.
//
// admissions_config.is_open, school_announcements (News) et
// school_documents (Documents) restent IMMEDIATE LIVE — hors de ce
// payload, jamais lus ni écrits par cette route (CMS-F.0/F.1).

import { NextRequest, NextResponse } from "next/server";
import { authorizeSchoolMutation } from "@/lib/cms/authorizeSchoolMutation";
import { HERO_MODES, type HeroMode } from "@/lib/school/heroMode";
import { CANONICAL_SECTION_KEYS, type SchoolPageSectionKey } from "@/lib/schoolPage/sections";
import { FEE_KEYS } from "@/lib/schoolPage/pricing";
import { INFRASTRUCTURE_KEYS as INFRA_KEYS } from "@/lib/schoolPage/infrastructure";
import type { SchoolPageDraftPayload, SchoolPageDraftRow } from "@/lib/schoolPage/draftPayload";
import { buildLiveSnapshot } from "@/lib/schoolPage/snapshot";

// CMS-F.3 — l'ordre canonique des 8 sections vient désormais de
// src/lib/schoolPage/sections.ts (source unique — voir ce fichier pour
// l'historique de la dérive corrigée entre le rendu public et
// /api/school-page/sections, trouvée lors de l'audit CMS-F.2).
type DbSectionKey = SchoolPageSectionKey;
const CANONICAL_SECTION_KEY_SET = new Set<string>(CANONICAL_SECTION_KEYS);
const FEE_KEY_SET = new Set<string>(FEE_KEYS);
const INFRA_KEY_SET = new Set<string>(INFRA_KEYS);

const MAX_DESCRIPTION_LENGTH = 4000; // aligné sur presentation/route.ts
const MAX_FIELD_LENGTH = 320; // aligné sur contact/route.ts
const MAX_LEVELS = 20;
const MAX_LEVEL_LENGTH = 60;
const MAX_DOCUMENTS = 20;
const MAX_DOCUMENT_LENGTH = 100;
const MAX_TEXT_LENGTH = 2000; // aligné sur admissions/route.ts
const MAX_REMOVE_IDS = 100; // plafond défensif, pas une limite produit réelle
const HTML_CHARS = /[<>]/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CMS-F.3 — la forme du payload vit désormais dans
// src/lib/schoolPage/draftPayload.ts (source unique, réutilisée aussi par
// l'éditeur CMS) au lieu d'être déclarée localement. Non validée par la DB
// (jsonb libre + un check "c'est un objet") : cette route reste la seule
// source de vérité qui VALIDE effectivement cette forme.
type DraftRow = SchoolPageDraftRow;

const DRAFT_COLUMNS = "id, establishment_id, payload, is_dirty, created_at, updated_at";

export async function GET() {
  const auth = await authorizeSchoolMutation();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { context } = auth;

  const { data: existing, error: fetchError } = await context.supabase
    .from("school_page_drafts")
    .select(DRAFT_COLUMNS)
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: `Échec de lecture du brouillon : ${fetchError.message}` }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: true, draft: existing as unknown as DraftRow });
  }

  let payload: SchoolPageDraftPayload;
  try {
    payload = await buildLiveSnapshot(context.supabase, context.establishmentId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: `Échec de construction du snapshot live : ${message}` }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await context.supabase
    .from("school_page_drafts")
    .insert({ establishment_id: context.establishmentId, payload, is_dirty: false })
    .select(DRAFT_COLUMNS)
    .single();

  if (insertError) {
    // 23505 = violation de la contrainte UNIQUE(establishment_id) : un
    // autre GET concurrent a inséré la ligne entre notre lecture et notre
    // insert (double-clic, deux onglets...). On relit la ligne créée par
    // l'autre requête plutôt que d'échouer — idempotence course-safe.
    if (insertError.code === "23505") {
      const { data: raced, error: racedError } = await context.supabase
        .from("school_page_drafts")
        .select(DRAFT_COLUMNS)
        .eq("establishment_id", context.establishmentId)
        .single();
      if (!racedError && raced) {
        return NextResponse.json({ ok: true, draft: raced as unknown as DraftRow });
      }
    }
    return NextResponse.json({ error: `Échec de création du brouillon : ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft: inserted as unknown as DraftRow });
}

// ----------------------------------------------------------------------------
// Validation PATCH — payload complet obligatoire, whitelist stricte des 8
// clés de domaine (+ expected_updated_at optionnel, hors payload).
// ----------------------------------------------------------------------------
type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanStringArray(input: unknown, maxItems: number, maxLength: number): FieldResult<string[]> {
  if (!Array.isArray(input)) return { ok: false, error: "doit être une liste" };
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, error: "chaque élément doit être du texte" };
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > maxLength) return { ok: false, error: `élément trop long (max ${maxLength} caractères)` };
    if (HTML_CHARS.test(trimmed)) return { ok: false, error: "caractères non autorisés (< ou >)" };
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }
  if (cleaned.length > maxItems) return { ok: false, error: `trop d'éléments (max ${maxItems})` };
  return { ok: true, value: cleaned };
}

function cleanText(input: unknown, maxLength: number): FieldResult<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "doit être du texte" };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false, error: `texte trop long (max ${maxLength} caractères)` };
  if (HTML_CHARS.test(trimmed)) return { ok: false, error: "caractères non autorisés (< ou >)" };
  return { ok: true, value: trimmed };
}

function cleanDate(input: unknown): FieldResult<string | null> {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "string" || !ISO_DATE.test(input) || Number.isNaN(new Date(input).getTime())) {
    return { ok: false, error: "date invalide (AAAA-MM-JJ attendu)" };
  }
  return { ok: true, value: input };
}

function cleanContactField(input: unknown): FieldResult<string | null> {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "doit être du texte ou null" };
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_FIELD_LENGTH) return { ok: false, error: `trop long (max ${MAX_FIELD_LENGTH} caractères)` };
  return { ok: true, value: trimmed };
}

// PUBLIC-SITE-02 — motto/history/mission/vision are optional editorial
// text (nullable), unlike description (required, can be empty string but
// not absent) — same MAX_TEXT_LENGTH ceiling as admissions.conditions.
const MAX_MOTTO_LENGTH = 200;
const PRESENTATION_FIELDS = ["description", "motto", "history", "mission", "vision"] as const;

function validatePresentation(input: unknown): FieldResult<SchoolPageDraftPayload["presentation"]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "presentation doit être un objet" };
  const obj = input as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !(PRESENTATION_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, error: `presentation : champ(s) inconnu(s) ${unknown.join(", ")}` };
  const { description } = obj;
  if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `presentation.description invalide (texte, max ${MAX_DESCRIPTION_LENGTH} caractères)` };
  }
  const motto = cleanText(obj.motto, MAX_MOTTO_LENGTH);
  if ("error" in motto) return { ok: false, error: `presentation.motto : ${motto.error}` };
  const history = cleanText(obj.history, MAX_TEXT_LENGTH);
  if ("error" in history) return { ok: false, error: `presentation.history : ${history.error}` };
  const mission = cleanText(obj.mission, MAX_TEXT_LENGTH);
  if ("error" in mission) return { ok: false, error: `presentation.mission : ${mission.error}` };
  const vision = cleanText(obj.vision, MAX_TEXT_LENGTH);
  if ("error" in vision) return { ok: false, error: `presentation.vision : ${vision.error}` };
  return { ok: true, value: { description, motto: motto.value, history: history.value, mission: mission.value, vision: vision.value } };
}

const CURRENT_YEAR = new Date().getFullYear();

function validateYearField(input: unknown, label: string, min: number, max: number): FieldResult<number | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  const n = typeof input === "number" ? input : Number(input);
  if (typeof input !== "number" || !Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label} invalide (entier entre ${min} et ${max}, ou null)` };
  }
  return { ok: true, value: n };
}

function validateCountField(input: unknown, label: string): FieldResult<number | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  const n = typeof input === "number" ? input : Number(input);
  if (typeof input !== "number" || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${label} invalide (entier positif ou null)` };
  }
  return { ok: true, value: n };
}

function validateKeyNumbers(input: unknown): FieldResult<SchoolPageDraftPayload["key_numbers"]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "key_numbers doit être un objet" };
  const obj = input as Record<string, unknown>;
  const fields = ["founding_year", "student_count", "teacher_count"] as const;
  const unknown = Object.keys(obj).filter((k) => !(fields as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, error: `key_numbers : champ(s) inconnu(s) ${unknown.join(", ")}` };
  for (const field of fields) {
    if (!(field in obj)) return { ok: false, error: `key_numbers.${field} requis (nombre ou null)` };
  }
  const foundingYear = validateYearField(obj.founding_year, "key_numbers.founding_year", 1800, CURRENT_YEAR);
  if ("error" in foundingYear) return { ok: false, error: foundingYear.error };
  const studentCount = validateCountField(obj.student_count, "key_numbers.student_count");
  if ("error" in studentCount) return { ok: false, error: studentCount.error };
  const teacherCount = validateCountField(obj.teacher_count, "key_numbers.teacher_count");
  if ("error" in teacherCount) return { ok: false, error: teacherCount.error };
  return { ok: true, value: { founding_year: foundingYear.value, student_count: studentCount.value, teacher_count: teacherCount.value } };
}

const MAX_RANK_LENGTH = 60;
const MAX_SCOPE_LENGTH = 120;
const MAX_SOURCE_LENGTH = 120;
const MAX_URL_LENGTH = 500;

function validateRanking(input: unknown): FieldResult<SchoolPageDraftPayload["ranking"]> {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "object") return { ok: false, error: "ranking doit être un objet ou null" };
  const obj = input as Record<string, unknown>;
  const fields = ["year", "rank", "scope", "source", "source_url"] as const;
  const unknown = Object.keys(obj).filter((k) => !(fields as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, error: `ranking : champ(s) inconnu(s) ${unknown.join(", ")}` };

  // §6 — year/rank/scope/source are required TOGETHER: a ranking is never
  // half-configured. source_url alone is optional.
  const year = validateYearField(obj.year, "ranking.year", 1990, CURRENT_YEAR + 1);
  if ("error" in year || year.value === null) return { ok: false, error: "ranking.year requis (année)" };
  const rank = cleanText(obj.rank, MAX_RANK_LENGTH);
  if ("error" in rank || !rank.value) return { ok: false, error: "ranking.rank requis" };
  const scope = cleanText(obj.scope, MAX_SCOPE_LENGTH);
  if ("error" in scope || !scope.value) return { ok: false, error: "ranking.scope requis" };
  const source = cleanText(obj.source, MAX_SOURCE_LENGTH);
  if ("error" in source || !source.value) return { ok: false, error: "ranking.source requis" };
  const sourceUrl = cleanText(obj.source_url, MAX_URL_LENGTH);
  if ("error" in sourceUrl) return { ok: false, error: `ranking.source_url : ${sourceUrl.error}` };
  if (sourceUrl.value && !/^https?:\/\//i.test(sourceUrl.value)) {
    return { ok: false, error: "ranking.source_url doit commencer par http:// ou https://" };
  }

  return { ok: true, value: { year: year.value, rank: rank.value, scope: scope.value, source: source.value, source_url: sourceUrl.value } };
}

function validateResultsShape(input: unknown): FieldResult<string[]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "results doit être un objet" };
  const obj = input as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => k !== "remove_ids");
  if (unknown.length > 0) return { ok: false, error: `results : champ(s) inconnu(s) ${unknown.join(", ")}` };
  if (!("remove_ids" in obj)) return { ok: false, error: "results.remove_ids requis (liste)" };
  if (!Array.isArray(obj.remove_ids)) return { ok: false, error: "results.remove_ids doit être une liste" };
  const seen = new Set<string>();
  for (const raw of obj.remove_ids) {
    if (typeof raw !== "string" || !UUID.test(raw)) {
      return { ok: false, error: "results.remove_ids : identifiant invalide (uuid attendu)" };
    }
    seen.add(raw);
  }
  const deduped = Array.from(seen);
  if (deduped.length > MAX_REMOVE_IDS) {
    return { ok: false, error: `results.remove_ids : trop d'éléments (max ${MAX_REMOVE_IDS})` };
  }
  return { ok: true, value: deduped };
}

function validateContact(input: unknown): FieldResult<SchoolPageDraftPayload["contact"]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "contact doit être un objet" };
  const obj = input as Record<string, unknown>;
  const fields = ["phone", "email", "website", "address", "city"] as const;
  const unknown = Object.keys(obj).filter((k) => !(fields as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, error: `contact : champ(s) inconnu(s) ${unknown.join(", ")}` };
  const value: Partial<SchoolPageDraftPayload["contact"]> = {};
  for (const field of fields) {
    if (!(field in obj)) return { ok: false, error: `contact.${field} requis (texte ou null)` };
    const r = cleanContactField(obj[field]);
    if ("error" in r) return { ok: false, error: `contact.${field} : ${r.error}` };
    value[field] = r.value;
  }
  return { ok: true, value: value as SchoolPageDraftPayload["contact"] };
}

function validateHeroMode(input: unknown): FieldResult<HeroMode> {
  if (typeof input !== "string" || !HERO_MODES.includes(input as HeroMode)) {
    return { ok: false, error: `hero_mode invalide (attendu : ${HERO_MODES.join(", ")})` };
  }
  return { ok: true, value: input as HeroMode };
}

function validatePricing(input: unknown): FieldResult<Record<string, number | null>> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "pricing doit être un objet" };
  const obj = input as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !FEE_KEY_SET.has(k));
  if (unknown.length > 0) return { ok: false, error: `pricing : champ(s) inconnu(s) ${unknown.join(", ")}` };
  const value: Record<string, number | null> = {};
  for (const key of FEE_KEYS) {
    if (!(key in obj)) return { ok: false, error: `pricing.${key} requis (nombre ou null)` };
    const raw = obj[key];
    if (raw === null) {
      value[key] = null;
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (typeof raw !== "number" || !Number.isFinite(n) || n < 0) {
      return { ok: false, error: `pricing.${key} invalide (nombre positif ou null)` };
    }
    value[key] = Math.round(n);
  }
  return { ok: true, value };
}

function validateInfrastructure(input: unknown): FieldResult<Record<string, boolean>> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "infrastructure doit être un objet" };
  const obj = input as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !INFRA_KEY_SET.has(k));
  if (unknown.length > 0) return { ok: false, error: `infrastructure : champ(s) inconnu(s) ${unknown.join(", ")}` };
  const value: Record<string, boolean> = {};
  for (const key of INFRA_KEYS) {
    if (!(key in obj)) return { ok: false, error: `infrastructure.${key} requis (booléen)` };
    if (typeof obj[key] !== "boolean") return { ok: false, error: `infrastructure.${key} invalide (booléen attendu)` };
    value[key] = obj[key] as boolean;
  }
  return { ok: true, value };
}

function validateAdmissions(input: unknown): FieldResult<SchoolPageDraftPayload["admissions"]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "admissions doit être un objet" };
  const obj = input as Record<string, unknown>;
  if ("is_open" in obj) {
    return { ok: false, error: "admissions.is_open n'est jamais autorisé dans le brouillon (reste immediate-live sur admissions_config)" };
  }
  const fields = ["levels", "conditions", "required_documents", "period_start", "period_end", "additional_info"] as const;
  const unknown = Object.keys(obj).filter((k) => !(fields as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, error: `admissions : champ(s) inconnu(s) ${unknown.join(", ")}` };
  for (const field of fields) {
    if (!(field in obj)) return { ok: false, error: `admissions.${field} requis` };
  }

  const levels = cleanStringArray(obj.levels, MAX_LEVELS, MAX_LEVEL_LENGTH);
  if ("error" in levels) return { ok: false, error: `admissions.levels : ${levels.error}` };
  const requiredDocuments = cleanStringArray(obj.required_documents, MAX_DOCUMENTS, MAX_DOCUMENT_LENGTH);
  if ("error" in requiredDocuments) return { ok: false, error: `admissions.required_documents : ${requiredDocuments.error}` };
  const conditions = cleanText(obj.conditions, MAX_TEXT_LENGTH);
  if ("error" in conditions) return { ok: false, error: `admissions.conditions : ${conditions.error}` };
  const additionalInfo = cleanText(obj.additional_info, MAX_TEXT_LENGTH);
  if ("error" in additionalInfo) return { ok: false, error: `admissions.additional_info : ${additionalInfo.error}` };
  const periodStart = cleanDate(obj.period_start);
  if ("error" in periodStart) return { ok: false, error: `admissions.period_start : ${periodStart.error}` };
  const periodEnd = cleanDate(obj.period_end);
  if ("error" in periodEnd) return { ok: false, error: `admissions.period_end : ${periodEnd.error}` };
  if (periodStart.value && periodEnd.value && periodEnd.value < periodStart.value) {
    return { ok: false, error: "admissions : period_end doit être postérieure ou égale à period_start" };
  }

  return {
    ok: true,
    value: {
      levels: levels.value,
      conditions: conditions.value,
      required_documents: requiredDocuments.value,
      period_start: periodStart.value,
      period_end: periodEnd.value,
      additional_info: additionalInfo.value,
    },
  };
}

function validateSections(input: unknown): FieldResult<SchoolPageDraftPayload["sections"]> {
  if (!Array.isArray(input) || input.length !== CANONICAL_SECTION_KEYS.length) {
    return { ok: false, error: `sections : les ${CANONICAL_SECTION_KEYS.length} sections doivent être présentes exactement une fois` };
  }
  const seen = new Set<string>();
  const value: SchoolPageDraftPayload["sections"] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "sections : chaque élément doit être un objet" };
    const s = raw as Record<string, unknown>;
    const unknown = Object.keys(s).filter((k) => !["section_key", "position", "is_visible"].includes(k));
    if (unknown.length > 0) return { ok: false, error: `sections : champ(s) inconnu(s) ${unknown.join(", ")}` };
    if (typeof s.section_key !== "string" || !CANONICAL_SECTION_KEY_SET.has(s.section_key)) {
      return { ok: false, error: `sections : section_key invalide (${String(s.section_key)})` };
    }
    if (seen.has(s.section_key)) return { ok: false, error: `sections : section_key dupliquée (${s.section_key})` };
    seen.add(s.section_key);
    if (typeof s.position !== "number" || !Number.isInteger(s.position) || s.position < 0) {
      return { ok: false, error: `sections : position invalide pour ${s.section_key}` };
    }
    if (typeof s.is_visible !== "boolean") {
      return { ok: false, error: `sections : is_visible invalide pour ${s.section_key}` };
    }
    value.push({ section_key: s.section_key as DbSectionKey, position: s.position, is_visible: s.is_visible });
  }
  if (seen.size !== CANONICAL_SECTION_KEYS.length) {
    return { ok: false, error: "sections : toutes les sections doivent être présentes exactement une fois" };
  }
  return { ok: true, value };
}

function validateGalleryShape(input: unknown): FieldResult<string[]> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "gallery doit être un objet" };
  const obj = input as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => k !== "remove_ids");
  if (unknown.length > 0) return { ok: false, error: `gallery : champ(s) inconnu(s) ${unknown.join(", ")}` };
  if (!("remove_ids" in obj)) return { ok: false, error: "gallery.remove_ids requis (liste)" };
  if (!Array.isArray(obj.remove_ids)) return { ok: false, error: "gallery.remove_ids doit être une liste" };
  const seen = new Set<string>();
  for (const raw of obj.remove_ids) {
    if (typeof raw !== "string" || !UUID.test(raw)) {
      return { ok: false, error: "gallery.remove_ids : identifiant invalide (uuid attendu)" };
    }
    seen.add(raw);
  }
  const deduped = Array.from(seen);
  if (deduped.length > MAX_REMOVE_IDS) {
    return { ok: false, error: `gallery.remove_ids : trop d'éléments (max ${MAX_REMOVE_IDS})` };
  }
  return { ok: true, value: deduped };
}

const PAYLOAD_KEYS = ["presentation", "contact", "hero_mode", "pricing", "infrastructure", "admissions", "sections", "gallery", "key_numbers", "ranking", "results"] as const;

export async function PATCH(req: NextRequest) {
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

  const unknownTopLevel = Object.keys(input).filter((k) => k !== "expected_updated_at" && !(PAYLOAD_KEYS as readonly string[]).includes(k));
  if (unknownTopLevel.length > 0) {
    return NextResponse.json({ error: `Champ(s) non autorisé(s) : ${unknownTopLevel.join(", ")}` }, { status: 400 });
  }
  const missingTopLevel = PAYLOAD_KEYS.filter((k) => !(k in input));
  if (missingTopLevel.length > 0) {
    return NextResponse.json({ error: `Payload incomplet — champ(s) manquant(s) : ${missingTopLevel.join(", ")}` }, { status: 400 });
  }

  const presentation = validatePresentation(input.presentation);
  if ("error" in presentation) return NextResponse.json({ error: presentation.error }, { status: 400 });
  const contact = validateContact(input.contact);
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  const heroMode = validateHeroMode(input.hero_mode);
  if ("error" in heroMode) return NextResponse.json({ error: heroMode.error }, { status: 400 });
  const pricing = validatePricing(input.pricing);
  if ("error" in pricing) return NextResponse.json({ error: pricing.error }, { status: 400 });
  const infrastructure = validateInfrastructure(input.infrastructure);
  if ("error" in infrastructure) return NextResponse.json({ error: infrastructure.error }, { status: 400 });
  const admissions = validateAdmissions(input.admissions);
  if ("error" in admissions) return NextResponse.json({ error: admissions.error }, { status: 400 });
  const sections = validateSections(input.sections);
  if ("error" in sections) return NextResponse.json({ error: sections.error }, { status: 400 });
  const removeIds = validateGalleryShape(input.gallery);
  if ("error" in removeIds) return NextResponse.json({ error: removeIds.error }, { status: 400 });
  const keyNumbers = validateKeyNumbers(input.key_numbers);
  if ("error" in keyNumbers) return NextResponse.json({ error: keyNumbers.error }, { status: 400 });
  const ranking = validateRanking(input.ranking);
  if ("error" in ranking) return NextResponse.json({ error: ranking.error }, { status: 400 });
  const resultRemoveIds = validateResultsShape(input.results);
  if ("error" in resultRemoveIds) return NextResponse.json({ error: resultRemoveIds.error }, { status: 400 });

  // results.remove_ids : même garde anti-forgery que gallery.remove_ids —
  // un id étranger ne doit jamais pouvoir être mis en attente de
  // suppression via cette route.
  if (resultRemoveIds.value.length > 0) {
    const { data: owned, error: ownedError } = await context.supabase
      .from("school_exam_results")
      .select("id")
      .eq("establishment_id", context.establishmentId)
      .in("id", resultRemoveIds.value);
    if (ownedError) {
      return NextResponse.json({ error: `Échec de vérification de results.remove_ids : ${ownedError.message}` }, { status: 500 });
    }
    const ownedSet = new Set((owned ?? []).map((r) => r.id as string));
    const foreign = resultRemoveIds.value.filter((id) => !ownedSet.has(id));
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: `results.remove_ids contient des identifiants qui n'appartiennent pas à cet établissement : ${foreign.join(", ")}` },
        { status: 404 }
      );
    }
  }

  // gallery.remove_ids : vérifier que chaque id appartient réellement à
  // l'établissement actif — un id étranger ne doit jamais pouvoir être mis
  // en attente de suppression via cette route (protection anti-forgery,
  // même discipline que news/documents CMS-E). Aucune écriture sur
  // school_images.status ici — uniquement une vérification d'appartenance.
  if (removeIds.value.length > 0) {
    const { data: owned, error: ownedError } = await context.supabase
      .from("school_images")
      .select("id")
      .eq("establishment_id", context.establishmentId)
      .in("id", removeIds.value);
    if (ownedError) {
      return NextResponse.json({ error: `Échec de vérification de gallery.remove_ids : ${ownedError.message}` }, { status: 500 });
    }
    const ownedSet = new Set((owned ?? []).map((r) => r.id as string));
    const foreign = removeIds.value.filter((id) => !ownedSet.has(id));
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: `gallery.remove_ids contient des identifiants qui n'appartiennent pas à cet établissement : ${foreign.join(", ")}` },
        { status: 404 }
      );
    }
  }

  const payload: SchoolPageDraftPayload = {
    presentation: presentation.value,
    contact: contact.value,
    hero_mode: heroMode.value,
    pricing: pricing.value,
    infrastructure: infrastructure.value,
    admissions: admissions.value,
    sections: sections.value,
    gallery: { remove_ids: removeIds.value },
    key_numbers: keyNumbers.value,
    ranking: ranking.value,
    results: { remove_ids: resultRemoveIds.value },
  };

  const expectedUpdatedAt = typeof input.expected_updated_at === "string" ? input.expected_updated_at : undefined;
  if ("expected_updated_at" in input && expectedUpdatedAt === undefined) {
    return NextResponse.json({ error: "expected_updated_at doit être une chaîne (timestamp) si fourni" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await context.supabase
    .from("school_page_drafts")
    .select("id, updated_at")
    .eq("establishment_id", context.establishmentId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: `Échec de lecture du brouillon : ${existingError.message}` }, { status: 500 });
  }

  if (!existing) {
    // Aucun brouillon encore créé (PATCH appelé avant tout GET) :
    // expected_updated_at n'a pas de sens ici, il est ignoré — il n'y a
    // rien avec quoi entrer en conflit.
    const { data: inserted, error: insertError } = await context.supabase
      .from("school_page_drafts")
      .insert({ establishment_id: context.establishmentId, payload, is_dirty: true })
      .select(DRAFT_COLUMNS)
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        // Course : un GET/PATCH concurrent a créé la ligne entre-temps —
        // on bascule sur un update plutôt que d'échouer.
        const { data: raced } = await context.supabase
          .from("school_page_drafts")
          .select("id")
          .eq("establishment_id", context.establishmentId)
          .single();
        if (raced) {
          const { data: updated, error: updateError } = await context.supabase
            .from("school_page_drafts")
            .update({ payload, is_dirty: true })
            .eq("id", raced.id)
            .select(DRAFT_COLUMNS)
            .single();
          if (!updateError && updated) {
            return NextResponse.json({ ok: true, draft: updated as unknown as DraftRow });
          }
        }
      }
      return NextResponse.json({ error: `Échec de création du brouillon : ${insertError.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, draft: inserted as unknown as DraftRow });
  }

  let query = context.supabase.from("school_page_drafts").update({ payload, is_dirty: true }).eq("id", existing.id);
  if (expectedUpdatedAt !== undefined) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data: updated, error: updateError } = await query.select(DRAFT_COLUMNS).maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: `Échec de l'enregistrement du brouillon : ${updateError.message}` }, { status: 500 });
  }
  if (!updated) {
    // 0 ligne affectée alors qu'une ligne existe : expected_updated_at ne
    // correspond plus à la valeur en base (le brouillon a été modifié
    // depuis la dernière lecture du client) — conflit de version, jamais
    // silencieusement ignoré.
    return NextResponse.json({ error: "Le brouillon a été modifié depuis votre dernière lecture (conflit de version)" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, draft: updated as unknown as DraftRow });
}
