import { redirect } from "next/navigation";
import { ScheduleView, type ScheduleEntry } from "@/components/enseignant/ScheduleView";
import { createClient } from "@/lib/supabase/server";

// MOBILE-01 Phase 5 — vue emploi du temps mobile. Interroge TOUTES les
// fiches enseignant du compte (multi-établissement, Phase 5 du brief : "un
// même enseignant peut potentiellement avoir plusieurs établissements —
// ne pas casser cette possibilité") plutôt qu'une seule, contrairement à
// /enseignant/mon-espace qui ne montre qu'un établissement sélectionné à
// la fois — ici l'enseignant voit sa semaine complète, toutes écoles
// confondues, chaque créneau étiqueté par son établissement.

export default async function EmploiDuTempsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: enseignants } = await supabase.from("enseignants").select("id, etablissement_id, establishments(name)").eq("user_id", user.id);

  if (!enseignants?.length) {
    return <div className="max-w-md mx-auto py-16 text-center text-sm text-text-secondary">Aucune fiche enseignant liée à ce compte.</div>;
  }

  const entries: ScheduleEntry[] = [];
  for (const ens of enseignants) {
    const { data: edt } = await supabase
      .from("emplois_du_temps")
      .select("id, classes(name), matieres(nom), creneaux_horaires(jour_semaine, heure_debut, heure_fin)")
      .eq("enseignant_id", ens.id)
      .returns<
        {
          id: string;
          classes: { name: string } | null;
          matieres: { nom: string } | null;
          creneaux_horaires: { jour_semaine: number; heure_debut: string; heure_fin: string } | null;
        }[]
      >();

    const etablissementNom = (ens.establishments as unknown as { name: string } | null)?.name ?? null;
    for (const e of edt ?? []) {
      if (!e.creneaux_horaires) continue;
      entries.push({
        emploiDuTempsId: e.id,
        jourSemaine: e.creneaux_horaires.jour_semaine,
        heureDebut: e.creneaux_horaires.heure_debut,
        heureFin: e.creneaux_horaires.heure_fin,
        matiereNom: e.matieres?.nom ?? "—",
        classeNom: e.classes?.name ?? "—",
        etablissementNom: enseignants.length > 1 ? etablissementNom : null,
      });
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-extrabold text-text-primary mb-5">Mon emploi du temps</h1>
      <ScheduleView entries={entries} todayJourSemaine={new Date().getDay()} />
    </div>
  );
}
