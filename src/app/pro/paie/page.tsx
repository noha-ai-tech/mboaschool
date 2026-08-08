import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FormulaireCalculPaie } from "@/components/pro/FormulaireCalculPaie";

const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  valide_rh: "Validé RH",
  valide_direction: "Validé Direction",
  paie_validee: "Paie validée",
};
const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  valide_rh: "bg-blue-50 text-blue-700",
  valide_direction: "bg-amber-50 text-amber-700",
  paie_validee: "bg-emerald-50 text-emerald-700",
};

export default async function PaiePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: contratsActifs } = await supabase
    .from("staff_contracts")
    .select("staff_member_id, staff_members(first_name, last_name)")
    .eq("statut", "actif")
    .in("staff_member_id",
      (await supabase.from("staff_members").select("id").eq("etablissement_id", etablissement.id)).data?.map((s) => s.id) ?? []
    );

  const staffMembersOptions = (contratsActifs ?? []).map((c: any) => ({
    id: c.staff_member_id,
    nom: `${c.staff_members?.first_name ?? ""} ${c.staff_members?.last_name ?? ""}`.trim(),
  }));

  const { data: bulletins } = await supabase
    .from("bulletins_paie")
    .select("id, periode_debut, periode_fin, salaire_net, statut, staff_members(first_name, last_name)")
    .eq("etablissement_id", etablissement.id)
    .order("periode_debut", { ascending: false });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Paie</h1>
          <p className="text-sm text-gray-500 mt-1">
            Calcul, validation et historique des bulletins de paie de l&apos;établissement.
          </p>
        </div>
        <Link href="/pro/paie/configuration" className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm font-semibold hover:border-gray-400 transition-colors shrink-0">
          <Settings size={14} /> Configuration
        </Link>
      </div>

      <div className="mb-8">
        <FormulaireCalculPaie staffMembers={staffMembersOptions} />
      </div>

      {!bulletins?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Aucun bulletin calculé pour l&apos;instant.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {bulletins.map((b: any) => (
            <Link key={b.id} href={`/pro/paie/${b.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors">
              <div>
                <p className="font-semibold text-gray-900">
                  {b.staff_members?.first_name} {b.staff_members?.last_name}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(b.periode_debut).toLocaleDateString("fr-FR")} – {new Date(b.periode_fin).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-gray-700">{Number(b.salaire_net).toLocaleString("fr-FR")} FCFA</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUT_COLORS[b.statut] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUT_LABELS[b.statut] ?? b.statut}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
