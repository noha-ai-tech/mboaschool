import type { HeroMode } from "@/lib/school/heroMode";
import type { SchoolPageSectionKey } from "@/lib/schoolPage/sections";

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
  pricing: Record<string, number | null>;
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
