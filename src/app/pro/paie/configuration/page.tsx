import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { FormulaireConfigurationPaie } from "@/components/pro/FormulaireConfigurationPaie";

export default async function ConfigurationPaiePage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/paie/configuration");

  const { data: config } = await supabase
    .from("payroll_config")
    .select("*")
    .eq("etablissement_id", etablissement.id)
    .maybeSingle();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href={withEstablishmentQuery("/pro/paie", etablissement.id)} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-6">
        <ArrowLeft size={15} /> Paie
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Configuration de la paie</h1>
        <p className="text-sm text-gray-500 mt-1">Toutes les règles ci-dessous sont modifiables (Mission 06, Phase 11).</p>
      </div>
      <FormulaireConfigurationPaie etablissementId={etablissement.id} initial={config} />
    </div>
  );
}
