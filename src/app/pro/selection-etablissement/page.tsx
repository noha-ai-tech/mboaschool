import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleEstablishments } from "@/lib/school/establishmentAccess";
import { safeProReturnPath, scalarSearchParam, withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { EstablishmentSelectionList } from "@/components/pro/EstablishmentSelectionList";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

export default async function SelectionEtablissementPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; school?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { establishments } = await listAccessibleEstablishments({ supabase, userId: user.id });
  const schools = establishments.filter(
    (school) => school.forfait === "pro" && school.accessSources.includes("owner")
  );
  const params = await searchParams;
  const returnPath = safeProReturnPath(params.next);
  const requestedSchoolId = scalarSearchParam(params.school);
  const ownedRequestedSchoolId = establishments.some(
    (school) => school.id === requestedSchoolId && school.accessSources.includes("owner")
  ) ? requestedSchoolId : null;

  if (ownedRequestedSchoolId && !schools.some((school) => school.id === ownedRequestedSchoolId)) {
    redirect(withEstablishmentQuery("/pro/acces-restreint", ownedRequestedSchoolId));
  }
  if (schools.length === 0) redirect(withEstablishmentQuery("/pro/acces-restreint", ownedRequestedSchoolId));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <SchoolAdminPageHeader eyebrow="Contexte établissement" title="Choisir un établissement" description="Sélectionnez l’établissement Pro à administrer dans cet onglet." />
      <div className="mb-6"><SchoolAdminAlert tone="info" title="Contexte limité à cet onglet">Le paramètre d’établissement reste explicite dans les liens et chaque requête est vérifiée côté serveur.</SchoolAdminAlert></div>
      <EstablishmentSelectionList
        schools={schools.map(({ id, name, city }) => ({ id, name, city }))}
        returnPath={returnPath}
      />
    </div>
  );
}
