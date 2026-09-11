-- ============================================================================
-- MOBILE-01.2 — LOCAL FIXTURE BROWSER E2E GATE
-- Bug found by real-browser E2E: teacher home/schedule pages never show a
-- subject or a time slot for any teacher.
-- ============================================================================
-- Root cause (confirmed empirically, not by inference):
--
-- `/enseignant`, `/enseignant/emploi-du-temps` and `/enseignant/cours/[id]`
-- (src/app/enseignant/page.tsx, .../emploi-du-temps/page.tsx,
-- .../cours/[id]/page.tsx) all read the teacher's schedule as
--
--   emplois_du_temps
--     .select("... matieres(nom), creneaux_horaires(jour_semaine, ...)")
--     .eq("enseignant_id", enseignant.id)
--
-- 0009_pro_hr_foundation.sql already added `edt_self_read` so a teacher can
-- read their own emplois_du_temps rows directly. But the embedded
-- `matieres` and `creneaux_horaires` resources are joined under the SAME
-- RLS-checked query, and neither table has ever had a teacher-facing SELECT
-- policy anywhere in this repository's migration history (grepped the full
-- supabase/migrations/ directory to confirm: only the owner-scoped
-- `matieres_scope` / `creneaux_scope` "for all" policies exist). For a
-- teacher (not an owner), those embeds silently resolve to null instead of
-- erroring — PostgREST left-joins embeds — so `creneaux_horaires` is always
-- null for a teacher, and code that filters "is this today's course?" via
-- `creneaux_horaires.jour_semaine` never matches, and the subject name is
-- always blank. This is not a display nicety: it makes the entire MOBILE-01
-- teacher daily-schedule feature show "no course today" for every real
-- teacher account in production, regardless of their actual timetable.
--
-- Fix: two additive, teacher-scoped SELECT policies, mirroring the existing
-- `students_teacher_read_own_classes` / `edt_self_read` idiom exactly (a
-- teacher may read only the matieres/creneaux rows that belong to one of
-- their own emplois_du_temps rows — never the whole school's subjects or
-- time slots). Removes no existing policy; owners keep their existing
-- "for all" access via matieres_scope / creneaux_scope unchanged.
-- ============================================================================

drop policy if exists matieres_teacher_read_own on public.matieres;
create policy matieres_teacher_read_own on public.matieres
  for select
  using (
    id in (
      select edt.matiere_id
      from public.emplois_du_temps edt
      join public.enseignants ens on ens.id = edt.enseignant_id
      where ens.user_id = auth.uid()
    )
  );

drop policy if exists creneaux_teacher_read_own on public.creneaux_horaires;
create policy creneaux_teacher_read_own on public.creneaux_horaires
  for select
  using (
    id in (
      select edt.creneau_id
      from public.emplois_du_temps edt
      join public.enseignants ens on ens.id = edt.enseignant_id
      where ens.user_id = auth.uid()
    )
  );
