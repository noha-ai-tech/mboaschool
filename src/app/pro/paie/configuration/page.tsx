import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { FormulaireConfigurationPaie } from "@/components/pro/FormulaireConfigurationPaie";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";

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
    <div className="mx-auto max-w-5xl">
      <Link href={withEstablishmentQuery("/pro/paie", etablissement.id)} className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--school-admin-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
        <ArrowLeft size={15} /> Paie
      </Link>
      <SchoolAdminPageHeader eyebrow="Paie" title="Configuration de la paie" description="Modifiez uniquement les paramètres actuellement pris en charge par le moteur de calcul." />
      <FormulaireConfigurationPaie etablissementId={etablissement.id} initial={config} />
    </div>
  );
}
