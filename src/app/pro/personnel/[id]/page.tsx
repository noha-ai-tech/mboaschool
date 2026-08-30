import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { PersonnelAcces } from "@/components/pro/PersonnelAcces";
import { PersonnelContrat } from "@/components/pro/PersonnelContrat";
import { PersonnelDocuments } from "@/components/pro/PersonnelDocuments";

const ROLE_LABELS: Record<string, string> = {
  admin_principal: "Administrateur principal", directeur: "Directeur", proviseur: "Proviseur",
  principal: "Principal", censeur: "Censeur", secretaire: "Secrétariat", comptable: "Comptable",
  enseignant: "Enseignant", assistant: "Assistant",
};
const CATEGORY_LABELS: Record<string, string> = {
  teacher: "Enseignant", admin: "Personnel administratif", direction: "Direction", support: "Personnel de soutien",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  temps_plein: "Temps plein", temps_partiel: "Temps partiel", vacataire: "Vacataire",
};

export default async function PersonnelDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ school?: string }> }) {
  const { id } = await params;
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, school, `/pro/personnel/${id}`);

  const { data: member } = await supabase
    .from("staff_members")
    .select("*")
    .eq("id", id)
    .eq("etablissement_id", etablissement.id)
    .single();
  if (!member) notFound();

  let matieres: { nom: string; departement_disciplinaire: string }[] = [];
  if (member.enseignant_id) {
    const { data } = await supabase
      .from("enseignant_matieres")
      .select("matieres(nom, departement_disciplinaire)")
      .eq("enseignant_id", member.enseignant_id);
    matieres = (data ?? []).map((d: any) => d.matieres).filter(Boolean);
  }

  const { data: contract } = await supabase
    .from("staff_contracts")
    .select("*")
    .eq("staff_member_id", id)
    .eq("statut", "actif")
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: docRows } = await supabase
    .from("staff_documents")
    .select("id, category, file_name, storage_path")
    .eq("staff_member_id", id)
    .order("uploaded_at", { ascending: false });

  const docs = await Promise.all(
    (docRows ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("staff-documents").createSignedUrl(d.storage_path, 3600);
      return { ...d, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={withEstablishmentQuery("/pro/personnel", etablissement.id)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors mb-6">
        <ArrowLeft size={15} /> Personnel
      </Link>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {member.photo_url ? (
              <img src={member.photo_url} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-100" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-xl font-black text-slate-400">
                {member.first_name?.[0]}{member.last_name?.[0]}
              </div>
            )}
            <div>
              <h1 className="text-xl font-black text-[#0a0a0a]">{member.first_name} {member.last_name}</h1>
              <p className="text-sm text-slate-500">
                {ROLE_LABELS[member.role] ?? member.role} · {CATEGORY_LABELS[member.category] ?? member.category}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${member.status === "actif" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {member.status === "actif" ? "Actif" : "Inactif"}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-100">
          <Info label="Email" value={member.email ?? "—"} />
          <Info label="Téléphone" value={member.phone ?? "—"} />
          <Info label="Type de contrat" value={member.employment_type ? EMPLOYMENT_LABELS[member.employment_type] : "—"} />
          <Info label="Date d'entrée" value={member.date_entree ? new Date(member.date_entree).toLocaleDateString("fr-FR") : "—"} />
        </div>

        {matieres.length > 0 && (
          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Matières</p>
            <div className="flex flex-wrap gap-2">
              {matieres.map((m, i) => (
                <span key={i} className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                  {m.nom}
                </span>
              ))}
            </div>
          </div>
        )}

        {member.enseignant_id && (
          <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100">
            Fiche enseignant liée — gestion des matières et de l&apos;emploi du temps via{" "}
            <Link href={withEstablishmentQuery("/pro/enseignants", etablissement.id)} className="text-emerald-700 font-semibold">Enseignants</Link>.
          </p>
        )}
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Accès</p>
        <PersonnelAcces
          staffMemberId={member.id}
          establishmentId={etablissement.id}
          hasAccount={!!member.user_id}
          hasEmail={!!member.email}
          existingCode={member.access_code}
        />
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Contrat</p>
        <PersonnelContrat staffMemberId={member.id} current={contract ?? null} />
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Documents</p>
        <PersonnelDocuments staffMemberId={member.id} initialDocs={docs} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-[#0a0a0a]">{value}</p>
    </div>
  );
}
