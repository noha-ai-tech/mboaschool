import { redirect } from "next/navigation";
import { DoorOpen, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireSalle } from "@/components/pro/FormulaireSalle";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

export default async function SallesPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");
  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/salles");
  const { data: salles } = await supabase.from("salles").select("id, nom, capacite, type").eq("etablissement_id", etablissement.id).order("nom");
  const rooms = salles ?? [];
  const knownCapacity = rooms.filter((room) => typeof room.capacite === "number");
  const totalCapacity = knownCapacity.reduce((total, room) => total + (room.capacite ?? 0), 0);
  const types = new Set(rooms.map((room) => room.type).filter(Boolean));
  return <div className="mx-auto max-w-6xl">
    <SchoolAdminPageHeader eyebrow="Planification" title="Salles" description="Consultez les salles réellement enregistrées et leur capacité lorsqu’elle est disponible." />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><SchoolAdminStatCard label="Salles" value={rooms.length} icon={<DoorOpen size={19} />} /><SchoolAdminStatCard label="Capacité connue" value={knownCapacity.length ? totalCapacity : "Indisponible"} icon={<Users size={19} />} tone="neutral" detail={knownCapacity.length ? `${knownCapacity.length} salle${knownCapacity.length > 1 ? "s" : ""} renseignée${knownCapacity.length > 1 ? "s" : ""}` : "Aucune capacité fournie"} /><SchoolAdminStatCard label="Types renseignés" value={types.size || "Indisponible"} icon={<DoorOpen size={19} />} tone="neutral" /></div>
    <SchoolAdminSectionCard title="Ajouter une salle" description="Seuls le nom, la capacité et le type du contrat existant sont enregistrés."><FormulaireSalle etablissementId={etablissement.id} /></SchoolAdminSectionCard>
    <div className="mt-6">{rooms.length === 0 ? <SchoolAdminEmptyState title="Aucune salle enregistrée" description="Ajoutez une salle uniquement lorsque ses informations sont connues." icon={<DoorOpen size={24} />} /> : <><SchoolAdminResponsiveTable label="Liste des salles" className="hidden md:block"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]"><tr><th scope="col" className="px-5 py-3">Salle</th><th scope="col" className="px-5 py-3">Type</th><th scope="col" className="px-5 py-3">Capacité</th></tr></thead><tbody className="divide-y divide-[var(--school-admin-border)]">{rooms.map((room) => <tr key={room.id}><th scope="row" className="px-5 py-4 font-semibold">{room.nom}</th><td className="px-5 py-4"><SchoolAdminStatusBadge tone="neutral" label={room.type || "Non renseigné"} /></td><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{typeof room.capacite === "number" ? `${room.capacite} places` : "Indisponible"}</td></tr>)}</tbody></table></SchoolAdminResponsiveTable><div className="space-y-3 md:hidden" aria-label="Liste des salles">{rooms.map((room) => <article key={room.id} className="rounded-xl border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-bold">{room.nom}</h2><SchoolAdminStatusBadge tone="neutral" label={room.type || "Type non renseigné"} /></div><dl className="mt-4 border-t border-[var(--school-admin-border)] pt-3 text-sm"><dt className="text-[var(--school-admin-text-muted)]">Capacité</dt><dd className="mt-1 font-semibold">{typeof room.capacite === "number" ? `${room.capacite} places` : "Indisponible"}</dd></dl></article>)}</div></>}</div>
  </div>;
}
