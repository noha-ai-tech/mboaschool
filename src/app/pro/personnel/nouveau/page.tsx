import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireNouveauPersonnel } from "@/components/pro/FormulaireNouveauPersonnel";

export default async function NouveauPersonnelPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/personnel/nouveau");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Personnel</p>
        <h1 className="text-2xl font-black tracking-tight text-[#0a0a0a]">Ajouter un membre du personnel</h1>
      </div>
      <FormulaireNouveauPersonnel establishmentId={etablissement.id} />
    </div>
  );
}
