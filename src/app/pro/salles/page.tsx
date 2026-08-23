import { redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireSalle } from "@/components/pro/FormulaireSalle";

export default async function SallesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await getActiveEstablishment(supabase, user.id);
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: salles } = await supabase
    .from("salles")
    .select("id, nom, capacite, type")
    .eq("etablissement_id", etablissement.id)
    .order("nom");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Salles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Utilisées pour la contrainte de salle et la vue Salle des emplois du temps.
        </p>
      </div>

      <div className="mb-6">
        <FormulaireSalle etablissementId={etablissement.id} />
      </div>

      {!salles?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Aucune salle enregistrée.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {salles.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4">
              <DoorOpen size={16} className="text-gray-400" />
              <div>
                <p className="font-semibold text-sm text-gray-900">{s.nom}</p>
                <p className="text-xs text-gray-400">
                  {s.type ?? "—"}{s.capacite ? ` · ${s.capacite} places` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
