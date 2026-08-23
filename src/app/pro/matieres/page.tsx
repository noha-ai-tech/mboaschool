import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { GestionMatieres } from "@/components/pro/GestionMatieres";

export default async function MatieresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await getActiveEstablishment(supabase, user.id);
  if (!etablissement) redirect("/dashboard/ecole");

  const etablissementId = etablissement.id;

  // Matières + leurs volumes horaires
  const { data: matieres } = await supabase
    .from("matieres")
    .select("id, nom, departement_disciplinaire, couleur")
    .eq("etablissement_id", etablissementId)
    .order("departement_disciplinaire")
    .order("nom");

  const matiereIds = (matieres ?? []).map((m) => m.id);
  const { data: volumes } = matiereIds.length
    ? await supabase
        .from("matieres_volume_horaire")
        .select("id, matiere_id, niveau, heures_semaine")
        .in("matiere_id", matiereIds)
        .order("niveau")
    : { data: [] };

  // Niveaux existants (depuis les classes de l'établissement)
  const { data: classes } = await supabase
    .from("classes")
    .select("level")
    .eq("establishment_id", etablissementId)
    .not("level", "is", null);

  const niveaux = Array.from(new Set((classes ?? []).map((c) => c.level as string).filter(Boolean))).sort();

  // Départements déjà utilisés (pour le datalist)
  const departementsExistants = Array.from(
    new Set((matieres ?? []).map((m) => m.departement_disciplinaire).filter(Boolean))
  ).sort();

  // Assembler matières + volumes
  const matieresAvecVolumes = (matieres ?? []).map((m) => ({
    ...m,
    volumes: (volumes ?? [])
      .filter((v) => v.matiere_id === m.id)
      .map(({ id, niveau, heures_semaine }) => ({ id, niveau, heures_semaine })),
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">
          Emplois du temps
        </p>
        <h1 className="text-2xl font-black tracking-tight text-[#0a0a0a]">Matières</h1>
        <p className="text-sm text-slate-500 mt-1">
          Définissez les matières enseignées et leur volume horaire par niveau.
          Ces données alimentent le générateur d&apos;emplois du temps.
        </p>
      </div>

      <GestionMatieres
        initialMatieres={matieresAvecVolumes}
        niveaux={niveaux}
        departementsExistants={departementsExistants}
        etablissementId={etablissementId}
      />
    </div>
  );
}
