import { redirect } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireAbsence } from "@/components/pro/FormulaireAbsence";

const TYPE_LABELS: Record<string, string> = { absence: "Absence", conge: "Congé", mission: "Mission" };
const STATUT_LABELS: Record<string, string> = { declaree: "Déclarée", justifiee: "Justifiée", refusee: "Refusée" };

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/absences");

  const { data: staffMembers } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name")
    .eq("etablissement_id", etablissement.id)
    .order("last_name");

  const { data: absences } = await supabase
    .from("absences")
    .select("id, type, date_debut, date_fin, motif, statut, staff_members(first_name, last_name)")
    .in("staff_member_id", (staffMembers ?? []).map((s) => s.id))
    .order("date_debut", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Absences, congés et missions</h1>
        <p className="text-sm text-gray-500 mt-1">Alimente le calcul de la paie (heures non rémunérées).</p>
      </div>

      <div className="mb-6">
        <FormulaireAbsence staffMembers={(staffMembers ?? []).map((s) => ({ id: s.id, nom: `${s.first_name} ${s.last_name}` }))} />
      </div>

      {!absences?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          <CalendarOff size={24} className="mx-auto mb-3 text-gray-200" />
          Aucune absence enregistrée.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {absences.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-gray-900">{a.staff_members?.first_name} {a.staff_members?.last_name}</p>
                <p className="text-xs text-gray-400">
                  {TYPE_LABELS[a.type]} · {new Date(a.date_debut).toLocaleDateString("fr-FR")} – {new Date(a.date_fin).toLocaleDateString("fr-FR")}
                  {a.motif ? ` · ${a.motif}` : ""}
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {STATUT_LABELS[a.statut] ?? a.statut}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
