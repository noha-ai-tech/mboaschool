import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireNouveauPersonnel } from "@/components/pro/FormulaireNouveauPersonnel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";

export default async function NouveauPersonnelPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/personnel/nouveau");

  return (
    <div className="mx-auto max-w-3xl">
      <SchoolAdminPageHeader eyebrow="Ressources humaines" title="Ajouter un membre du personnel" description="Créez la fiche administrative et renseignez les informations contractuelles disponibles." context={<Link href={withEstablishmentQuery("/pro/personnel", etablissement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><ArrowLeft size={15} aria-hidden="true" />Retour au personnel</Link>} />
      <FormulaireNouveauPersonnel establishmentId={etablissement.id} />
    </div>
  );
}
