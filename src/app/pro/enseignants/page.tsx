import { redirect } from "next/navigation";
import Link from "next/link";
import { UserCheck, Clock, UserX, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { BoutonInviter } from "@/components/pro/BoutonInviter";

export default async function EnseignantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await getActiveEstablishment(supabase, user.id);
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: enseignants } = await supabase
    .from("enseignants")
    .select("id, nom, prenom, email, code_pointage, user_id, invite_envoyee_le")
    .eq("etablissement_id", etablissement.id)
    .order("nom");

  function statutBadge(e: {
    user_id: string | null;
    invite_envoyee_le: string | null;
    email: string | null;
  }) {
    if (e.user_id) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-xs font-bold">
          <UserCheck size={11} />
          Compte actif
        </span>
      );
    }
    if (e.invite_envoyee_le) {
      const d = new Date(e.invite_envoyee_le);
      const label = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold">
          <Clock size={11} />
          Invitation envoyée le {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-500 px-2.5 py-0.5 text-xs font-bold">
        <UserX size={11} />
        Sans compte
      </span>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Enseignants</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez vos enseignants, leurs matières et leurs accès.
          </p>
        </div>
        <Link
          href="/pro/enseignants/nouveau"
          className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus size={15} />
          Nouvel enseignant
        </Link>
      </div>

      {!enseignants?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Aucun enseignant dans cet établissement.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Enseignant</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400 hidden sm:table-cell">Email</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400 hidden md:table-cell">Code pointage</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Statut compte</th>
                <th className="text-right p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {enseignants.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <span className="font-semibold text-gray-900">
                      {e.prenom} {e.nom}
                    </span>
                    {/* Email visible en mobile sous le nom */}
                    {e.email && (
                      <span className="block text-xs text-gray-400 sm:hidden">{e.email}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500 hidden sm:table-cell">
                    {e.email ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    {e.code_pointage ? (
                      <span className="font-mono bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs font-bold">
                        {e.code_pointage}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="p-3">{statutBadge(e)}</td>
                  <td className="p-3 text-right">
                    {!e.user_id && e.email ? (
                      <BoutonInviter enseignantId={e.id} />
                    ) : !e.email ? (
                      <span className="text-xs text-gray-300">Pas d&apos;email</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        L&apos;enseignant recevra un email avec un lien pour créer son mot de passe.
        Le kiosque PIN continue de fonctionner indépendamment.
      </p>
    </div>
  );
}
