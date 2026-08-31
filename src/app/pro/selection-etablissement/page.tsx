import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleEstablishments } from "@/lib/school/establishmentAccess";
import { safeProReturnPath } from "@/lib/school/establishmentContext";
import { EstablishmentSelectionList } from "@/components/pro/EstablishmentSelectionList";

export default async function SelectionEtablissementPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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

  if (schools.length === 0) redirect("/pro/acces-restreint");

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">
        Contexte établissement
      </p>
      <h1 className="mb-2 text-2xl font-black text-slate-950">Choisir un établissement</h1>
      <p className="mb-7 text-sm text-slate-500">
        Cette sélection s’applique uniquement à cet onglet. Chaque requête sera vérifiée côté serveur.
      </p>
      <EstablishmentSelectionList
        schools={schools.map(({ id, name, city }) => ({ id, name, city }))}
        returnPath={returnPath}
      />
    </div>
  );
}
