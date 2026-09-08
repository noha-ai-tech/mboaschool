import { redirect } from "next/navigation";
import Link from "next/link";
import { Banknote, FileText, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { FormulaireCalculPaie } from "@/components/pro/FormulaireCalculPaie";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge, type SchoolAdminStatusTone } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

const LABELS: Record<string, string> = { brouillon: "Brouillon", valide_rh: "Validé RH", valide_direction: "Validé Direction", paie_validee: "Paie validée" };
const TONES: Record<string, SchoolAdminStatusTone> = { brouillon: "neutral", valide_rh: "info", valide_direction: "warning", paie_validee: "success" };
const money = (value: unknown) => `${Number(value).toLocaleString("fr-FR")} FCFA`;

export default async function PaiePage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/auth/connexion");
  const etablissement = await requireActiveEstablishment(supabase, user.id, school, "/pro/paie");
  const staffIds = (await supabase.from("staff_members").select("id").eq("etablissement_id", etablissement.id)).data?.map((staff) => staff.id) ?? [];
  const { data: contratsActifs } = await supabase.from("staff_contracts").select("staff_member_id, staff_members(first_name, last_name)").eq("statut", "actif").in("staff_member_id", staffIds);
  const staffMembersOptions = (contratsActifs ?? []).map((contract: any) => ({ id: contract.staff_member_id, nom: `${contract.staff_members?.first_name ?? ""} ${contract.staff_members?.last_name ?? ""}`.trim() }));
  const { data: bulletins } = await supabase.from("bulletins_paie").select("id, periode_debut, periode_fin, salaire_net, statut, staff_members(first_name, last_name)").eq("etablissement_id", etablissement.id).order("periode_debut", { ascending: false });
  const rows = bulletins ?? []; const validated = rows.filter((item: any) => item.statut === "paie_validee").length; const total = rows.reduce((sum: number, item: any) => sum + Number(item.salaire_net || 0), 0);
  return <div className="mx-auto max-w-7xl">
    <SchoolAdminPageHeader eyebrow="Paie et frais" title="Paie du personnel" description="Calculez, validez et consultez les bulletins de l’établissement." actions={<Link href={withEstablishmentQuery("/pro/paie/configuration", etablissement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--school-admin-border-strong)] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Settings size={16} aria-hidden="true" />Configuration</Link>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><SchoolAdminStatCard label="Bulletins" value={rows.length} icon={<FileText size={19} />} /><SchoolAdminStatCard label="Paies validées" value={validated} icon={<Users size={19} />} tone="neutral" /><SchoolAdminStatCard label="Net total affiché" value={money(total)} icon={<Banknote size={19} />} tone="neutral" detail="Somme des bulletins chargés" /></div>
    <SchoolAdminSectionCard title="Calculer un bulletin" description="Le calcul utilise exclusivement le moteur et les contrats existants."><FormulaireCalculPaie staffMembers={staffMembersOptions} establishmentId={etablissement.id} /></SchoolAdminSectionCard>
    <div className="mt-6">{!rows.length ? <SchoolAdminEmptyState title="Aucun bulletin calculé" description="Les bulletins calculés apparaîtront ici avec leur statut actuel." icon={<FileText size={24} />} /> : <><SchoolAdminResponsiveTable label="Bulletins de paie" className="hidden md:block"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]"><tr><th scope="col" className="px-5 py-3">Personnel</th><th scope="col" className="px-5 py-3">Période</th><th scope="col" className="px-5 py-3">Salaire net</th><th scope="col" className="px-5 py-3">Statut</th><th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody className="divide-y divide-[var(--school-admin-border)]">{rows.map((item: any) => <tr key={item.id}><th scope="row" className="px-5 py-4 font-semibold">{name(item)}</th><td className="px-5 py-4">{period(item)}</td><td className="px-5 py-4 font-mono font-bold">{money(item.salaire_net)}</td><td className="px-5 py-4"><SchoolAdminStatusBadge tone={TONES[item.statut] ?? "neutral"} label={LABELS[item.statut] ?? item.statut} /></td><td className="px-5 py-4 text-right"><Link href={withEstablishmentQuery(`/pro/paie/${item.id}`, etablissement.id)} className="inline-flex min-h-10 items-center font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter</Link></td></tr>)}</tbody></table></SchoolAdminResponsiveTable><div className="space-y-3 md:hidden" aria-label="Bulletins de paie">{rows.map((item: any) => <article key={item.id} className="rounded-xl border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{name(item)}</h2><p className="mt-1 text-sm text-[var(--school-admin-text-muted)]">{period(item)}</p></div><SchoolAdminStatusBadge tone={TONES[item.statut] ?? "neutral"} label={LABELS[item.statut] ?? item.statut} /></div><p className="mt-4 border-t border-[var(--school-admin-border)] pt-3 font-mono text-lg font-bold">{money(item.salaire_net)}</p><Link href={withEstablishmentQuery(`/pro/paie/${item.id}`, etablissement.id)} className="mt-3 inline-flex min-h-10 items-center font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter le bulletin</Link></article>)}</div></>}</div>
  </div>;
}
function name(item: any) { return `${item.staff_members?.first_name ?? ""} ${item.staff_members?.last_name ?? ""}`.trim() || "Personnel non renseigné"; }
function period(item: any) { return `${new Date(item.periode_debut).toLocaleDateString("fr-FR")} – ${new Date(item.periode_fin).toLocaleDateString("fr-FR")}`; }
