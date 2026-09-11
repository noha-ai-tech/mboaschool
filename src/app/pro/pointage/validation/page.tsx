import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";
import { CorrectionReviewList } from "@/components/school-admin/CorrectionReviewList";
import { ApproveWeekForm } from "@/components/school-admin/ApproveWeekForm";

// TIMESHEET-01 (mission §20) — "Heures à valider". L'autorité
// d'approbation est aujourd'hui strictement le propriétaire de
// l'établissement (voir l'audit en tête de la migration
// 20260914090000_timesheet_01_foundation.sql : la matrice de permissions
// directeur/censeur/RH n'est pas encore validée dans ce repo — geler sur
// "owner" n'est donc pas un raccourci arbitraire, c'est la frontière
// d'autorité réelle actuelle). requireActiveEstablishment applique déjà
// cette même frontière pour tout /pro/**.

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ValidationHeuresPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, params.school, "/pro/pointage/validation");
  const etablissementId = etablissement.id;

  const { data: enseignants } = await supabase.from("enseignants").select("id, nom, prenom").eq("etablissement_id", etablissementId).order("nom");

  const { data: pendingCorrections } = await supabase
    .from("timesheet_corrections")
    .select("id, enseignant_id, correction_type, target_date, proposed_type, proposed_time, reason, requested_at")
    .eq("establishment_id", etablissementId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const enseignantById = new Map((enseignants ?? []).map((e) => [e.id, `${e.prenom} ${e.nom}`]));

  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  const { data: pointages } = await supabase
    .from("pointages")
    .select("enseignant_id, type, horodatage")
    .eq("etablissement_id", etablissementId)
    .eq("source", "mobile_self_service")
    .gte("horodatage", `${weekStartStr}T00:00:00`)
    .lte("horodatage", `${weekEndStr}T23:59:59`)
    .order("horodatage", { ascending: true });

  const { data: existingApprovals } = await supabase
    .from("timesheet_approvals")
    .select("enseignant_id, approved_minutes, approved_at")
    .eq("establishment_id", etablissementId)
    .eq("period_start", weekStartStr)
    .eq("period_end", weekEndStr)
    .order("approved_at", { ascending: false });
  const latestApprovalByTeacher = new Map<string, number>();
  for (const a of existingApprovals ?? []) {
    if (!latestApprovalByTeacher.has(a.enseignant_id)) latestApprovalByTeacher.set(a.enseignant_id, a.approved_minutes);
  }

  const summaries = (enseignants ?? []).map((e) => {
    const own = (pointages ?? []).filter((p) => p.enseignant_id === e.id);
    let actualMinutes = 0;
    for (let i = 0; i < own.length - 1; i++) {
      if (own[i].type === "arrivee" && own[i + 1].type === "depart") {
        actualMinutes += Math.round((new Date(own[i + 1].horodatage).getTime() - new Date(own[i].horodatage).getTime()) / 60000);
      }
    }
    return {
      enseignantId: e.id,
      nom: `${e.prenom} ${e.nom}`,
      actualMinutes,
      alreadyApproved: latestApprovalByTeacher.get(e.id) ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <SchoolAdminPageHeader
        eyebrow="Présences"
        title="Heures à valider"
        description={`Semaine du ${weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${weekEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`}
      />

      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-[var(--school-admin-text-muted)] mb-3">Corrections en attente</p>
        {pendingCorrections?.length ? (
          <CorrectionReviewList
            corrections={pendingCorrections.map((c) => ({ ...c, enseignantNom: enseignantById.get(c.enseignant_id) ?? "—" }))}
          />
        ) : (
          <SchoolAdminEmptyState title="Aucune correction en attente" description="Toutes les demandes de correction ont été traitées." />
        )}
      </div>

      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-[var(--school-admin-text-muted)] mb-3">Heures pointées cette semaine</p>
        {summaries.length ? (
          <ApproveWeekForm establishmentId={etablissementId} periodStart={weekStartStr} periodEnd={weekEndStr} summaries={summaries} />
        ) : (
          <SchoolAdminEmptyState title="Aucun enseignant" description="Aucun enseignant n'est encore enregistré dans cet établissement." />
        )}
      </div>
    </div>
  );
}
