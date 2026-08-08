// Remplacements — Mission 05, Phase 6 : "architecture uniquement". Cette
// page liste les remplacements existants (table `remplacements`, migration
// 0010_timetable_engine.sql) mais ne construit aucun algorithme de
// recherche d'enseignant disponible ni aucun formulaire de déclaration —
// voir docs/timetable/02_ENGINE.md pour le détail de ce qui reste à
// concevoir avant une implémentation complète.

import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const STATUT_LABELS: Record<string, string> = {
  absence_declaree: "Absence déclarée",
  propose: "Remplaçant proposé",
  valide: "Validé",
  refuse: "Refusé",
  annule: "Annulé",
};

export default async function RemplacementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: remplacements } = await supabase
    .from("remplacements")
    .select("id, date_cours, statut, motif_absence, enseignants!remplacements_enseignant_absent_id_fkey(nom, prenom)")
    .eq("etablissement_id", etablissement.id)
    .order("date_cours", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Remplacements</h1>
        <p className="text-sm text-gray-500 mt-1">
          Architecture préparée (Mission 05, Phase 6) — la recherche automatique d&apos;un enseignant disponible
          et le formulaire de déclaration d&apos;absence restent à construire dans une mission dédiée.
        </p>
      </div>

      {!remplacements?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          <UserX size={24} className="mx-auto mb-3 text-gray-200" />
          Aucun remplacement enregistré.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {remplacements.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-gray-900">
                  {r.enseignants?.prenom} {r.enseignants?.nom}
                </p>
                <p className="text-xs text-gray-400">{new Date(r.date_cours).toLocaleDateString("fr-FR")}</p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {STATUT_LABELS[r.statut] ?? r.statut}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
