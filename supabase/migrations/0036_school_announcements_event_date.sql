-- ============================================================================
-- 0036_school_announcements_event_date.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte avant toute
-- exécution en production.
--
-- PUBLIC-SITE-04 — the mini-site event cards (homepage compact preview,
-- Vie & Résultats, Galerie & Infos) currently show `created_at` as the
-- "event date" — the only timestamp school_announcements has. For a real
-- calendar event ("Journée portes ouvertes, 12 septembre 2026") this is
-- wrong: `created_at` is always "today", never the actual future date.
--
-- Smallest additive fix: 2 nullable columns, no behavior change for
-- existing rows (both default NULL, no backfill). No RLS change — the
-- existing policies ("Owners can manage announcements" / "Public can read
-- announcements", auth-setup.sql) are row-level only, never column-scoped,
-- so a new nullable column needs no new policy.
--
-- Lifecycle: school_announcements remains IMMEDIATE LIVE, explicitly
-- confirmed unchanged in this sprint (PUBLIC-SITE-03/04) — event_date/
-- event_start_time follow the exact same immediate-live path as
-- title/content/is_important/type (POST/PATCH /api/school-page/news),
-- never routed through school_page_drafts. No draft/publish/discard
-- involvement for this table, by design, same as always.
--
-- Distinction preserved: a plain ANNOUNCEMENT may leave event_date null
-- (no calendar meaning); an EVENT populates it. Nothing in the DB forces
-- this — enforced at the application layer only (CMS form + the public
-- renderer's fallback-to-created_at), consistent with `type` already
-- being a soft, non-enforced categorization on this table.
-- ============================================================================

alter table public.school_announcements
  add column if not exists event_date date,
  add column if not exists event_start_time time;

comment on column public.school_announcements.event_date is
  'PUBLIC-SITE-04 — optional real calendar date for an event-type announcement. NULL for ordinary announcements (falls back to created_at for display). Immediate-live, same lifecycle as the rest of this table — never part of school_page_drafts.';
comment on column public.school_announcements.event_start_time is
  'PUBLIC-SITE-04 — optional start time to accompany event_date. NULL when not provided.';

-- ============================================================================
-- FIN — 2 colonnes nullable additives, aucune donnée existante modifiée,
-- aucune policy RLS ajoutée ou retirée (row-level only, déjà suffisant).
-- Rollback : `alter table public.school_announcements drop column if
-- exists event_date, drop column if exists event_start_time;` (perte des
-- valeurs déjà saisies, aucun autre effet).
-- ============================================================================
