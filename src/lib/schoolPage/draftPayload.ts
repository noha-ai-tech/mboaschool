import type { HeroMode } from "@/lib/school/heroMode";
import type { SchoolPageSectionKey } from "@/lib/schoolPage/sections";
import { normalizeSchoolPagePricing, type SchoolPagePricing } from "./pricing.ts";

// CMS-F.3 — type partagé entre /api/school-page/draft (CMS-F.2) et
// l'éditeur CMS (src/app/dashboard/ecole/etablissement/page.tsx), pour que
// les deux ne puissent jamais diverger silencieusement sur la forme du
// payload. Doit rester en phase avec le commentaire de la colonne
// school_page_drafts.payload (migration 0026).
// PUBLIC-SITE-02 — extends presentation with 4 new identity/editorial text
// fields (motto/history/mission/vision), and adds 2 new domains
// (key_numbers, results) + 1 new nullable domain (ranking). Every new
// field follows the exact same Draft/Preview/Publish/Discard lifecycle as
// the 8 domains already here — never a second mechanism.
export type SchoolPageDraftPayload = {
  presentation: {
    description: string;
    motto: string | null;
    history: string | null;
    mission: string | null;
    vision: string | null;
  };
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
  };
  hero_mode: HeroMode;
  pricing: SchoolPagePricing;
  infrastructure: Record<string, boolean>;
  admissions: {
    levels: string[];
    conditions: string | null;
    required_documents: string[];
    period_start: string | null;
    period_end: string | null;
    additional_info: string | null;
  };
  sections: { section_key: SchoolPageSectionKey; position: number; is_visible: boolean }[];
  gallery: { remove_ids: string[] };
  key_numbers: {
    founding_year: number | null;
    student_count: number | null;
    teacher_count: number | null;
  };
  /** null = no ranking configured (never a row of empty fields — see 0035). */
  ranking: {
    year: number;
    rank: string;
    scope: string;
    source: string;
    source_url: string | null;
  } | null;
  results: { remove_ids: string[] };
};

export type SchoolPageDraftRow = {
  id: string;
  establishment_id: string;
  payload: SchoolPageDraftPayload;
  is_dirty: boolean;
  created_at: string;
  updated_at: string;
};

export type SchoolPageDraftNormalizationResult =
  | { ok: true; payload: SchoolPageDraftPayload; addedFields: string[] }
  | { ok: false; error: string };

const LEGACY_REQUIRED_DOMAINS = [
  "presentation",
  "contact",
  "hero_mode",
  "pricing",
  "infrastructure",
  "admissions",
  "sections",
  "gallery",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENT_YEAR = new Date().getFullYear();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneJsonValue(nested)]));
  }
  return value;
}

function validateNullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return `${label} doit être du texte ou null`;
  return null;
}

function validateKeyNumbers(value: unknown): string | null {
  if (!isRecord(value)) return "key_numbers doit être un objet";
  const fields = ["founding_year", "student_count", "teacher_count"] as const;
  for (const field of fields) {
    if (!(field in value)) return `key_numbers.${field} requis`;
    const candidate = value[field];
    if (candidate !== null && (typeof candidate !== "number" || !Number.isInteger(candidate))) {
      return `key_numbers.${field} doit être un entier ou null`;
    }
  }
  const foundingYear = value.founding_year as number | null;
  if (foundingYear !== null && (foundingYear < 1800 || foundingYear > CURRENT_YEAR)) {
    return "key_numbers.founding_year hors limites";
  }
  for (const field of ["student_count", "teacher_count"] as const) {
    const count = value[field] as number | null;
    if (count !== null && count < 0) return `key_numbers.${field} doit être positif ou null`;
  }
  return null;
}

function validateRemoveIds(value: unknown, domain: "gallery" | "results"): string | null {
  if (!isRecord(value)) return `${domain} doit être un objet`;
  if (!Array.isArray(value.remove_ids)) return `${domain}.remove_ids doit être une liste`;
  if (value.remove_ids.length > 100) return `${domain}.remove_ids contient trop d'éléments`;
  if (value.remove_ids.some((id) => typeof id !== "string" || !UUID.test(id))) {
    return `${domain}.remove_ids contient un identifiant invalide`;
  }
  return null;
}

function validateRanking(value: unknown): string | null {
  if (value === null) return null;
  if (!isRecord(value)) return "ranking doit être un objet ou null";
  for (const field of ["year", "rank", "scope", "source", "source_url"] as const) {
    if (!(field in value)) return `ranking.${field} requis`;
  }
  if (
    typeof value.year !== "number" ||
    !Number.isInteger(value.year) ||
    value.year < 1990 ||
    value.year > CURRENT_YEAR + 1
  ) {
    return "ranking.year invalide";
  }
  for (const field of ["rank", "scope", "source"] as const) {
    if (typeof value[field] !== "string" || value[field].trim() === "") return `ranking.${field} requis`;
  }
  if (value.source_url !== null && typeof value.source_url !== "string") {
    return "ranking.source_url doit être du texte ou null";
  }
  if (typeof value.source_url === "string" && !/^https?:\/\//i.test(value.source_url)) {
    return "ranking.source_url doit commencer par http:// ou https://";
  }
  return null;
}

/**
 * Converts a persisted, valid pre-PUBLIC-SITE-02 payload to the current
 * in-memory contract. It never mutates or persists the input, and it only
 * fills fields that did not exist in the historical schema.
 */
export function normalizeSchoolPageDraftPayload(rawPayload: unknown): SchoolPageDraftNormalizationResult {
  if (!isRecord(rawPayload)) return { ok: false, error: "Le payload du brouillon doit être un objet" };

  for (const domain of LEGACY_REQUIRED_DOMAINS) {
    if (!(domain in rawPayload)) return { ok: false, error: `Domaine historique manquant : ${domain}` };
  }
  if (!isRecord(rawPayload.presentation) || typeof rawPayload.presentation.description !== "string") {
    return { ok: false, error: "presentation.description doit être du texte" };
  }
  if (!isRecord(rawPayload.contact)) return { ok: false, error: "contact doit être un objet" };
  if (typeof rawPayload.hero_mode !== "string") return { ok: false, error: "hero_mode doit être du texte" };
  const pricing = normalizeSchoolPagePricing(rawPayload.pricing);
  if ("error" in pricing) return { ok: false, error: pricing.error };
  if (!isRecord(rawPayload.infrastructure)) return { ok: false, error: "infrastructure doit être un objet" };
  if (!isRecord(rawPayload.admissions)) return { ok: false, error: "admissions doit être un objet" };
  if (!Array.isArray(rawPayload.sections)) return { ok: false, error: "sections doit être une liste" };
  const galleryError = validateRemoveIds(rawPayload.gallery, "gallery");
  if (galleryError) return { ok: false, error: galleryError };

  const cloned = cloneJsonValue(rawPayload) as Record<string, unknown>;
  cloned.pricing = pricing.value;
  const presentation = cloned.presentation as Record<string, unknown>;
  const addedFields: string[] = [];

  for (const field of ["motto", "history", "mission", "vision"] as const) {
    if (!(field in presentation)) {
      presentation[field] = null;
      addedFields.push(`presentation.${field}`);
    } else {
      const error = validateNullableText(presentation[field], `presentation.${field}`);
      if (error) return { ok: false, error };
    }
  }

  if (!("key_numbers" in cloned)) {
    cloned.key_numbers = { founding_year: null, student_count: null, teacher_count: null };
    addedFields.push("key_numbers");
  } else {
    const error = validateKeyNumbers(cloned.key_numbers);
    if (error) return { ok: false, error };
  }

  if (!("results" in cloned)) {
    cloned.results = { remove_ids: [] };
    addedFields.push("results");
  } else {
    const error = validateRemoveIds(cloned.results, "results");
    if (error) return { ok: false, error };
  }

  if (!("ranking" in cloned)) {
    cloned.ranking = null;
    addedFields.push("ranking");
  } else {
    const error = validateRanking(cloned.ranking);
    if (error) return { ok: false, error };
  }

  return { ok: true, payload: cloned as SchoolPageDraftPayload, addedFields };
}
