import { redirect } from "next/navigation";
import { BookOpen, Clock3, Layers3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { GestionMatieres } from "@/components/pro/GestionMatieres";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";

export default async function MatieresPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");
  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/matieres");
  const etablissementId = etablissement.id;
  const { data: matieres } = await supabase.from("matieres").select("id, nom, departement_disciplinaire, couleur").eq("etablissement_id", etablissementId).order("departement_disciplinaire").order("nom");
  const matiereIds = (matieres ?? []).map((matiere) => matiere.id);
  const { data: volumes } = matiereIds.length ? await supabase.from("matieres_volume_horaire").select("id, matiere_id, niveau, heures_semaine").in("matiere_id", matiereIds).order("niveau") : { data: [] };
  const { data: classes } = await supabase.from("classes").select("level").eq("establishment_id", etablissementId).not("level", "is", null);
  const niveaux = Array.from(new Set((classes ?? []).map((classe) => classe.level as string).filter(Boolean))).sort();
  const departementsExistants = Array.from(new Set((matieres ?? []).map((matiere) => matiere.departement_disciplinaire).filter(Boolean))).sort();
  const matieresAvecVolumes = (matieres ?? []).map((matiere) => ({ ...matiere, volumes: (volumes ?? []).filter((volume) => volume.matiere_id === matiere.id).map(({ id, niveau, heures_semaine }) => ({ id, niveau, heures_semaine })) }));

  return <div className="mx-auto max-w-6xl">
    <SchoolAdminPageHeader eyebrow="Planification" title="Matières" description="Définissez les matières existantes et leurs volumes horaires par niveau." />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <SchoolAdminStatCard label="Matières" value={matieresAvecVolumes.length} icon={<BookOpen size={19} />} />
      <SchoolAdminStatCard label="Volumes renseignés" value={(volumes ?? []).length} icon={<Clock3 size={19} />} tone="neutral" />
      <SchoolAdminStatCard label="Départements fournis" value={departementsExistants.length || "Indisponible"} icon={<Layers3 size={19} />} tone="neutral" detail={departementsExistants.length ? "Issus des matières existantes" : "Aucune donnée de département"} />
    </div>
    <GestionMatieres initialMatieres={matieresAvecVolumes} niveaux={niveaux} departementsExistants={departementsExistants} etablissementId={etablissementId} />
  </div>;
}
