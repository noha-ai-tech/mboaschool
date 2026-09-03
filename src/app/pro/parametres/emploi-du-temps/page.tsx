import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireContraintes } from "@/components/pro/FormulaireContraintes";
import { CalendarRange, Clock3 } from "lucide-react";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";

export default async function ParametresEmploiDuTempsPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/parametres/emploi-du-temps");

  const etablissementId = etablissement.id;

  const { data: row } = await supabase
    .from("contraintes_etablissement")
    .select("*")
    .eq("etablissement_id", etablissementId)
    .maybeSingle();

  const { count } = await supabase
    .from("creneaux_horaires")
    .select("id", { count: "exact", head: true })
    .eq("etablissement_id", etablissementId);

  const contraintes = row
    ? {
        jours_semaine: row.jours_semaine as number[],
        heure_debut_amplitude: row.heure_debut_amplitude as string,
        heure_fin_amplitude: row.heure_fin_amplitude as string,
        duree_creneau_minutes: row.duree_creneau_minutes as number,
        pause_active: !!row.pause_dejeuner_debut,
        pause_dejeuner_debut: (row.pause_dejeuner_debut as string) ?? "12:00",
        pause_dejeuner_fin: (row.pause_dejeuner_fin as string) ?? "14:00",
        recreations: row.recreations as { debut: string; fin: string }[],
        max_heures_consecutives_matiere: row.max_heures_consecutives_matiere as number,
        max_heures_jour_enseignant: row.max_heures_jour_enseignant as number,
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <SchoolAdminPageHeader eyebrow="Planification" title="Paramètres de l’emploi du temps" description="Configurez les jours, horaires, pauses et limites déjà prises en charge par le générateur." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SchoolAdminStatCard label="Créneaux existants" value={count ?? 0} icon={<Clock3 size={19} />} />
        <SchoolAdminStatCard label="Configuration" value={contraintes ? "Renseignée" : "À compléter"} icon={<CalendarRange size={19} />} tone={contraintes ? "neutral" : "warning"} />
      </div>

      <FormulaireContraintes
        contraintes={contraintes}
        etablissementId={etablissementId}
        hasExistingCreneaux={(count ?? 0) > 0}
      />
    </div>
  );
}
