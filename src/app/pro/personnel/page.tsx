import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Plus, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

const CATEGORY_LABELS: Record<string, string> = {
  teacher: "Enseignants rattachés au personnel",
  admin: "Personnel administratif",
  direction: "Direction",
  support: "Personnel de soutien",
};
const CATEGORY_ORDER = ["direction", "admin", "support", "teacher"];
const ROLE_LABELS: Record<string, string> = {
  admin_principal: "Administrateur principal", directeur: "Directeur", proviseur: "Proviseur",
  principal: "Principal", censeur: "Censeur", secretaire: "Secrétariat",
  comptable: "Comptable", enseignant: "Enseignant", assistant: "Assistant",
};

type StaffMember = {
  id: string; first_name: string; last_name: string; category: string; role: string;
  email: string | null; status: string; access_mode: string | null; access_code: string | null;
  user_id: string | null; invite_envoyee_le: string | null;
};

function memberStatus(member: StaffMember) {
  return member.status === "actif"
    ? <SchoolAdminStatusBadge tone="success" label="Actif" />
    : <SchoolAdminStatusBadge tone="neutral" label="Inactif" />;
}

function accessStatus(member: StaffMember) {
  if (member.user_id) return <SchoolAdminStatusBadge tone="success" label="Compte actif" icon={<UserCheck size={13} />} />;
  if (member.access_mode === "code" && member.access_code) return <SchoolAdminStatusBadge tone="info" label={`Code ${member.access_code}`} />;
  if (member.invite_envoyee_le) return <SchoolAdminStatusBadge tone="info" label="Invitation enregistrée" icon={<Clock size={13} />} />;
  return <SchoolAdminStatusBadge tone="neutral" label="Sans accès" icon={<UserX size={13} />} />;
}

export default async function PersonnelPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");
  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/personnel");
  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, category, role, email, status, access_mode, access_code, user_id, invite_envoyee_le")
    .eq("etablissement_id", etablissement.id)
    .order("last_name");
  const members = (staff ?? []) as StaffMember[];
  const grouped = CATEGORY_ORDER.map((category) => ({
    category, label: CATEGORY_LABELS[category], members: members.filter((member) => member.category === category),
  })).filter((group) => group.members.length > 0);
  const activeCount = members.filter((member) => member.status === "actif").length;
  const accountCount = members.filter((member) => Boolean(member.user_id)).length;
  const administrativeCount = members.filter((member) => member.category !== "teacher").length;

  return <div className="mx-auto max-w-7xl">
    <SchoolAdminPageHeader
      eyebrow="Ressources humaines"
      title="Personnel"
      description="Gérez les dossiers administratifs, les contrats, les documents et les accès du personnel. Les affectations pédagogiques restent dans l’espace Enseignants."
      actions={<Link href={withEstablishmentQuery("/pro/personnel/nouveau", etablissement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--school-admin-radius-control)] bg-[var(--school-admin-primary)] px-4 text-sm font-semibold text-white shadow-[var(--school-admin-shadow-sm)] hover:bg-[var(--school-admin-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] focus-visible:ring-offset-2"><Plus size={16} aria-hidden="true" />Ajouter un membre</Link>}
    />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SchoolAdminStatCard label="Membres enregistrés" value={members.length} icon={<Users size={19} />} />
      <SchoolAdminStatCard label="Personnel administratif/RH" value={administrativeCount} icon={<ShieldCheck size={19} />} tone="neutral" />
      <SchoolAdminStatCard label="Fiches actives" value={activeCount} icon={<UserCheck size={19} />} />
      <SchoolAdminStatCard label="Comptes actifs" value={accountCount} icon={<UserCheck size={19} />} tone="neutral" />
    </div>

    {grouped.length === 0 ? <SchoolAdminEmptyState title="Aucun membre du personnel" description="Ajoutez une première fiche pour commencer le suivi administratif de votre équipe." icon={<Users size={24} />} action={<Link href={withEstablishmentQuery("/pro/personnel/nouveau", etablissement.id)} className="font-semibold text-[var(--school-admin-primary)] underline-offset-4 hover:underline">Ajouter un membre</Link>} /> : <div className="space-y-6">
      {grouped.map((group) => <SchoolAdminSectionCard key={group.category} title={group.label} description={`${group.members.length} fiche${group.members.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        <SchoolAdminResponsiveTable label={`${group.label} — liste`} className="hidden md:block">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]"><tr><th scope="col" className="px-5 py-3">Nom</th><th scope="col" className="px-5 py-3">Fonction</th><th scope="col" className="px-5 py-3">Contact</th><th scope="col" className="px-5 py-3">Fiche</th><th scope="col" className="px-5 py-3">Accès</th><th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead>
            <tbody className="divide-y divide-[var(--school-admin-border)]">{group.members.map((member) => <tr key={member.id} className="hover:bg-[var(--school-admin-surface-muted)]"><th scope="row" className="px-5 py-4 font-semibold text-[var(--school-admin-text)]">{member.first_name} {member.last_name}</th><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{ROLE_LABELS[member.role] ?? member.role}</td><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{member.email ?? "Non renseigné"}</td><td className="px-5 py-4">{memberStatus(member)}</td><td className="px-5 py-4">{accessStatus(member)}</td><td className="px-5 py-4 text-right"><Link href={withEstablishmentQuery(`/pro/personnel/${member.id}`, etablissement.id)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-[var(--school-admin-primary)] hover:bg-[var(--school-admin-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter</Link></td></tr>)}</tbody>
          </table>
        </SchoolAdminResponsiveTable>
        <div className="divide-y divide-[var(--school-admin-border)] md:hidden">{group.members.map((member) => <article key={member.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-[var(--school-admin-text)]">{member.first_name} {member.last_name}</h3><p className="mt-1 text-xs text-[var(--school-admin-text-muted)]">{ROLE_LABELS[member.role] ?? member.role}</p></div>{memberStatus(member)}</div><dl className="mt-3 grid gap-2 text-xs"><div><dt className="text-[var(--school-admin-text-soft)]">Contact</dt><dd className="font-medium text-[var(--school-admin-text-muted)]">{member.email ?? "Non renseigné"}</dd></div><div><dt className="text-[var(--school-admin-text-soft)]">Accès</dt><dd className="mt-1">{accessStatus(member)}</dd></div></dl><Link href={withEstablishmentQuery(`/pro/personnel/${member.id}`, etablissement.id)} className="mt-4 inline-flex min-h-10 items-center rounded-lg text-sm font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter la fiche</Link></article>)}</div>
      </SchoolAdminSectionCard>)}
    </div>}
  </div>;
}
