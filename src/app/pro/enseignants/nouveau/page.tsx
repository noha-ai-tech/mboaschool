import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireNouvelEnseignant } from "@/components/pro/FormulaireNouvelEnseignant";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";

export default async function NouvelEnseignantPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/enseignants/nouveau");

  const { data: matieres } = await supabase
    .from("matieres")
    .select("id, nom, departement_disciplinaire, couleur")
    .eq("etablissement_id", etablissement.id)
    .order("departement_disciplinaire")
    .order("nom");

  return (
    <div className="mx-auto max-w-3xl">
      <SchoolAdminPageHeader eyebrow="Équipe pédagogique" title="Nouvel enseignant" description="Créez le profil pédagogique puis affectez uniquement les matières réellement disponibles dans l’établissement." context={<Link href={withEstablishmentQuery("/pro/enseignants", etablissement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><ArrowLeft size={15} aria-hidden="true" />Retour aux enseignants</Link>} />

      <FormulaireNouvelEnseignant matieres={matieres ?? []} establishmentId={etablissement.id} />
    </div>
  );
}
