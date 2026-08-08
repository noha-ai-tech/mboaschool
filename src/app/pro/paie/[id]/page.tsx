import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PaieValidation } from "@/components/pro/PaieValidation";

export default async function BulletinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: bulletin } = await supabase
    .from("bulletins_paie")
    .select("*, staff_members(first_name, last_name)")
    .eq("id", id)
    .eq("etablissement_id", etablissement.id)
    .single();
  if (!bulletin) notFound();

  const { data: lignes } = await supabase
    .from("bulletin_paie_lignes")
    .select("id, libelle, montant, signe")
    .eq("bulletin_id", id);

  const { data: historique } = await supabase
    .from("bulletin_paie_historique")
    .select("statut_nouveau, change_le")
    .eq("bulletin_id", id)
    .order("change_le", { ascending: true });

  const staffMember = bulletin.staff_members as { first_name: string; last_name: string } | null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/pro/paie" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-6">
        <ArrowLeft size={15} /> Paie
      </Link>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-gray-900">
              {staffMember?.first_name} {staffMember?.last_name}
            </h1>
            <p className="text-sm text-gray-500">
              {new Date(bulletin.periode_debut).toLocaleDateString("fr-FR")} – {new Date(bulletin.periode_fin).toLocaleDateString("fr-FR")}
            </p>
          </div>
          <a href={`/api/payroll/${id}/export`} className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-xs font-semibold hover:border-gray-400 transition-colors">
            <Download size={13} /> Export CSV
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-gray-100 mb-4">
          <div><p className="text-xs text-gray-400">Heures prévues</p><p className="font-semibold">{Number(bulletin.heures_prevues).toFixed(1)}h</p></div>
          <div><p className="text-xs text-gray-400">Heures effectuées</p><p className="font-semibold">{Number(bulletin.heures_effectuees).toFixed(1)}h</p></div>
        </div>

        <div className="space-y-2 text-sm pt-4 border-t border-gray-100">
          {(lignes ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between">
              <span className="text-gray-500">{l.libelle}</span>
              <span className={`font-mono font-semibold ${l.signe === "-" ? "text-red-600" : "text-gray-900"}`}>
                {l.signe}{Number(l.montant).toLocaleString("fr-FR")} FCFA
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
          <span className="font-black text-gray-900">Salaire net</span>
          <span className="font-mono font-black text-lg text-gray-900">{Number(bulletin.salaire_net).toLocaleString("fr-FR")} FCFA</span>
        </div>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
        <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">Validation</p>
        <PaieValidation bulletinId={id} statut={bulletin.statut} />
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">Historique</p>
        <div className="space-y-2 text-sm">
          {(historique ?? []).map((h, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-gray-600">{h.statut_nouveau}</span>
              <span className="text-xs text-gray-400">{new Date(h.change_le).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
