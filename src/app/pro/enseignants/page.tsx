import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminEmptyState, SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

type Teacher = { id: string; nom: string; prenom: string; email: string | null; code_pointage: string | null; user_id: string | null; invite_envoyee_le: string | null };

function accountStatus(teacher: Teacher) {
  if (teacher.user_id) return <SchoolAdminStatusBadge tone="success" label="Compte actif" icon={<UserCheck size={13} />} />;
  if (teacher.invite_envoyee_le) return <SchoolAdminStatusBadge tone="info" label="Invitation enregistrée" />;
  return <SchoolAdminStatusBadge tone="neutral" label="Sans compte" icon={<UserX size={13} />} />;
}

export default async function EnseignantsPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");
  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/enseignants");
  const { data } = await supabase.from("enseignants").select("id, nom, prenom, email, code_pointage, user_id, invite_envoyee_le").eq("etablissement_id", etablissement.id).order("nom");
  const enseignants = (data ?? []) as Teacher[];
  const activeAccounts = enseignants.filter((teacher) => Boolean(teacher.user_id)).length;
  const withPin = enseignants.filter((teacher) => Boolean(teacher.code_pointage)).length;

  return <div className="mx-auto max-w-7xl">
    <SchoolAdminPageHeader eyebrow="Équipe pédagogique" title="Enseignants" description="Gérez les profils pédagogiques, les codes de pointage et les affectations aux matières. Les contrats et documents restent dans l’espace Personnel." actions={<Link href={withEstablishmentQuery("/pro/enseignants/nouveau", etablissement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--school-admin-radius-control)] bg-[var(--school-admin-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--school-admin-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] focus-visible:ring-offset-2"><Plus size={16} aria-hidden="true" />Nouvel enseignant</Link>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><SchoolAdminStatCard label="Enseignants" value={enseignants.length} icon={<GraduationCap size={19} />} /><SchoolAdminStatCard label="Comptes actifs" value={activeAccounts} icon={<UserCheck size={19} />} /><SchoolAdminStatCard label="Codes de pointage" value={withPin} icon={<KeyRound size={19} />} tone="neutral" /></div>
    <SchoolAdminAlert tone="info" title="Invitations temporairement indisponibles">La création des fiches et les codes de pointage restent disponibles. L’envoi d’invitations de compte demeure fermé conformément au dispositif de sécurité actuel.</SchoolAdminAlert>
    <div className="mt-6">
      {!enseignants.length ? <SchoolAdminEmptyState title="Aucun enseignant" description="Créez un premier profil pédagogique pour commencer les affectations." icon={<GraduationCap size={24} />} action={<Link href={withEstablishmentQuery("/pro/enseignants/nouveau", etablissement.id)} className="font-semibold text-[var(--school-admin-primary)] underline-offset-4 hover:underline">Créer un enseignant</Link>} /> : <>
        <SchoolAdminResponsiveTable label="Liste des enseignants" className="hidden md:block"><table className="w-full min-w-[720px] border-collapse text-left text-sm"><thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]"><tr><th scope="col" className="px-5 py-3">Enseignant</th><th scope="col" className="px-5 py-3">Email</th><th scope="col" className="px-5 py-3">Code pointage</th><th scope="col" className="px-5 py-3">Compte</th><th scope="col" className="px-5 py-3">Invitation</th></tr></thead><tbody className="divide-y divide-[var(--school-admin-border)]">{enseignants.map((teacher) => <tr key={teacher.id} className="hover:bg-[var(--school-admin-surface-muted)]"><th scope="row" className="px-5 py-4 font-semibold text-[var(--school-admin-text)]">{teacher.prenom} {teacher.nom}</th><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{teacher.email ?? "Non renseigné"}</td><td className="px-5 py-4">{teacher.code_pointage ? <code className="rounded bg-[var(--school-admin-surface-muted)] px-2 py-1 text-xs font-bold">{teacher.code_pointage}</code> : <span className="text-[var(--school-admin-text-soft)]">Indisponible</span>}</td><td className="px-5 py-4">{accountStatus(teacher)}</td><td className="px-5 py-4"><SchoolAdminStatusBadge tone="neutral" label={teacher.user_id ? "Non requise" : "Indisponible"} /></td></tr>)}</tbody></table></SchoolAdminResponsiveTable>
        <div className="space-y-3 md:hidden" aria-label="Liste des enseignants">{enseignants.map((teacher) => <article key={teacher.id} className="rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4 shadow-[var(--school-admin-shadow-sm)]"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-[var(--school-admin-text)]">{teacher.prenom} {teacher.nom}</h2><p className="mt-1 text-xs text-[var(--school-admin-text-muted)]">{teacher.email ?? "Email non renseigné"}</p></div>{accountStatus(teacher)}</div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--school-admin-border)] pt-3 text-xs"><div><dt className="text-[var(--school-admin-text-soft)]">Code pointage</dt><dd className="mt-1 font-mono font-bold text-[var(--school-admin-text)]">{teacher.code_pointage ?? "Indisponible"}</dd></div><div><dt className="text-[var(--school-admin-text-soft)]">Invitation</dt><dd className="mt-1 font-semibold text-[var(--school-admin-text-muted)]">{teacher.user_id ? "Non requise" : "Indisponible"}</dd></div></dl></article>)}</div>
      </>}
    </div>
  </div>;
}
