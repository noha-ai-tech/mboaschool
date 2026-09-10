import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RollCall } from "@/components/enseignant/RollCall";

// MOBILE-01 Phase 6 — espace de séance. `id` est un emploi_du_temps_id (le
// gabarit récurrent), jamais un id de séance datée généré serveur — voir
// l'audit MOBILE-01 : emplois_du_temps ne modélise qu'un gabarit
// hebdomadaire, la séance datée (lesson_sessions) n'est créée qu'au
// premier appel réellement synchronisé (upsert atomique dans
// sync_apply_attendance_mark). Cette page n'a donc jamais besoin d'un id
// de séance pour fonctionner, en ligne ou hors-ligne.

export default async function CoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date } = await searchParams;
  const sessionDate = date ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: enseignant } = await supabase.from("enseignants").select("id, etablissement_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!enseignant) redirect("/enseignant");

  // Filtre explicite par enseignant_id — défense en profondeur au-delà de
  // RLS (edt_self_read) : un enseignant ne doit jamais pouvoir ouvrir le
  // cours d'un collègue en devinant/modifiant l'id dans l'URL.
  const { data: edt } = await supabase
    .from("emplois_du_temps")
    .select("id, classe_id, matiere_id, classes(name), matieres(nom), creneaux_horaires(heure_debut, heure_fin)")
    .eq("id", id)
    .eq("enseignant_id", enseignant.id)
    .maybeSingle<{
      id: string;
      classe_id: string;
      matiere_id: string;
      classes: { name: string } | null;
      matieres: { nom: string } | null;
      creneaux_horaires: { heure_debut: string; heure_fin: string } | null;
    }>();

  if (!edt) notFound();

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("classe_id", edt.classe_id)
    .order("last_name", { ascending: true });

  const { data: session } = await supabase
    .from("lesson_sessions")
    .select("id")
    .eq("emploi_du_temps_id", edt.id)
    .eq("session_date", sessionDate)
    .maybeSingle();

  const { data: existingAttendance } = session
    ? await supabase.from("student_attendance").select("student_id, status").eq("session_id", session.id)
    : { data: [] as { student_id: string; status: string }[] };

  const existingStatuses: Record<string, "present" | "absent" | "late"> = Object.fromEntries(
    (existingAttendance ?? []).map((a) => [a.student_id, a.status as "present" | "absent" | "late"])
  );

  return (
    <div className="max-w-md mx-auto">
      <Link href="/enseignant" className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-5">
        <ArrowLeft size={13} /> Aujourd&apos;hui
      </Link>

      <div className="mb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-1">
          {edt.creneaux_horaires?.heure_debut}–{edt.creneaux_horaires?.heure_fin}
        </p>
        <h1 className="text-xl font-extrabold text-text-primary">{edt.matieres?.nom ?? "—"}</h1>
        <p className="text-sm text-text-secondary mt-0.5">{edt.classes?.name ?? "—"}</p>
      </div>

      <RollCall
        emploiDuTempsId={edt.id}
        establishmentId={enseignant.etablissement_id}
        classeId={edt.classe_id}
        sessionDate={sessionDate}
        students={(students ?? []).map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name }))}
        initialStatuses={existingStatuses}
      />
    </div>
  );
}
