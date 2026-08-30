import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireNouvelEnseignant } from "@/components/pro/FormulaireNouvelEnseignant";

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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">
          Enseignants
        </p>
        <h1 className="text-2xl font-black tracking-tight text-[#0a0a0a]">
          Nouvel enseignant
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Un code PIN de pointage à 4 chiffres sera généré automatiquement.
        </p>
      </div>

      <FormulaireNouvelEnseignant matieres={matieres ?? []} establishmentId={etablissement.id} />
    </div>
  );
}
