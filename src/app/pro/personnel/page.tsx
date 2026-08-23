import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, UserCheck, Clock, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";

const CATEGORY_LABELS: Record<string, string> = {
  teacher: "Enseignants",
  admin: "Personnel administratif",
  direction: "Direction",
  support: "Personnel de soutien",
};

const CATEGORY_ORDER = ["direction", "teacher", "admin", "support"];

const ROLE_LABELS: Record<string, string> = {
  admin_principal: "Administrateur principal",
  directeur: "Directeur",
  proviseur: "Proviseur",
  principal: "Principal",
  censeur: "Censeur",
  secretaire: "Secrétariat",
  comptable: "Comptable",
  enseignant: "Enseignant",
  assistant: "Assistant",
};

export default async function PersonnelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await getActiveEstablishment(supabase, user.id);
  if (!etablissement) redirect("/dashboard/ecole");

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, category, role, email, status, access_mode, access_code, user_id, invite_envoyee_le")
    .eq("etablissement_id", etablissement.id)
    .order("last_name");

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    members: (staff ?? []).filter((s) => s.category === cat),
  })).filter((g) => g.members.length > 0);

  const total = staff?.length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Personnel</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} membre{total !== 1 ? "s" : ""} du personnel — enseignants, direction, administratif, soutien.
          </p>
        </div>
        <Link
          href="/pro/personnel/nouveau"
          className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus size={15} />
          Ajouter
        </Link>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Aucun membre du personnel enregistré.
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">
                {group.label} ({group.members.length})
              </p>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {group.members.map((m) => (
                      <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="p-3">
                          <Link href={`/pro/personnel/${m.id}`} className="font-semibold text-gray-900 hover:text-emerald-700">
                            {m.first_name} {m.last_name}
                          </Link>
                          <span className="block text-xs text-gray-400">{ROLE_LABELS[m.role] ?? m.role}</span>
                        </td>
                        <td className="p-3 text-gray-500 hidden sm:table-cell">{m.email ?? "—"}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            m.status === "actif" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {m.status === "actif" ? "Actif" : "Inactif"}
                          </span>
                        </td>
                        <td className="p-3">
                          {m.user_id ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-xs font-bold">
                              <UserCheck size={11} /> Compte actif
                            </span>
                          ) : m.access_mode === "code" && m.access_code ? (
                            <span className="font-mono bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs font-bold">
                              Code {m.access_code}
                            </span>
                          ) : m.invite_envoyee_le ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold">
                              <Clock size={11} /> Invité(e)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-500 px-2.5 py-0.5 text-xs font-bold">
                              <UserX size={11} /> Sans accès
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
