import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CorrectionRequestForm } from "@/components/enseignant/CorrectionRequestForm";

// TIMESHEET-01 — vue "mes heures" de l'enseignant : distingue prévu
// (emplois_du_temps + creneaux_horaires), pointé (pointages
// mobile_self_service, apparié arrivée/départ), et validé
// (timesheet_approvals, s'il existe une approbation couvrant la
// semaine). Semaine courante uniquement pour ce sprint (Phase 31 : pas de
// chargement de tout l'historique) — Aujourd'hui/Mois pourront réutiliser
// exactement la même requête avec des bornes différentes plus tard.

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lundi comme premier jour
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

type CoursDuJour = {
  classe_id: string;
  classes: { name: string } | null;
  matieres: { nom: string } | null;
  creneaux_horaires: { jour_semaine: number; heure_debut: string; heure_fin: string } | null;
};

export default async function MesHeuresPage({ searchParams }: { searchParams: Promise<{ eid?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: enseignants } = await supabase.from("enseignants").select("id, etablissement_id").eq("user_id", user.id);
  if (!enseignants?.length) {
    return <div className="max-w-md mx-auto py-16 text-center text-sm text-text-secondary">Aucune fiche enseignant liée à ce compte.</div>;
  }
  const enseignant = (params.eid ? enseignants.find((e) => e.id === params.eid) : null) ?? enseignants[0];

  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  const { data: edt } = await supabase
    .from("emplois_du_temps")
    .select("classe_id, classes(name), matieres(nom), creneaux_horaires(jour_semaine, heure_debut, heure_fin)")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id)
    .returns<CoursDuJour[]>();

  const { data: pointages } = await supabase
    .from("pointages")
    .select("id, type, horodatage")
    .eq("enseignant_id", enseignant.id)
    .eq("source", "mobile_self_service")
    .gte("horodatage", `${weekStartStr}T00:00:00`)
    .lte("horodatage", `${weekEndStr}T23:59:59`)
    .order("horodatage", { ascending: true });

  const { data: approval } = await supabase
    .from("timesheet_approvals")
    .select("approved_minutes, status, approved_at")
    .eq("enseignant_id", enseignant.id)
    .eq("period_start", weekStartStr)
    .eq("period_end", weekEndStr)
    .is("supersedes_approval_id", null)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Un enregistrement approuvé peut lui-même avoir été remplacé — on
  // cherche la dernière ligne de la chaîne pour cette période plutôt que
  // la première trouvée.
  const { data: latestApprovalChain } = await supabase
    .from("timesheet_approvals")
    .select("id, approved_minutes, status, approved_at")
    .eq("enseignant_id", enseignant.id)
    .eq("period_start", weekStartStr)
    .eq("period_end", weekEndStr)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const effectiveApproval = latestApprovalChain ?? approval;

  const days: { date: string; label: string; expectedMinutes: number; actualMinutes: number; hasPunch: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    const jourSemaine = d.getDay();

    const expectedMinutes = (edt ?? [])
      .filter((c) => c.creneaux_horaires?.jour_semaine === jourSemaine)
      .reduce((sum, c) => {
        const debut = c.creneaux_horaires?.heure_debut ?? "00:00";
        const fin = c.creneaux_horaires?.heure_fin ?? "00:00";
        const [dh, dm] = debut.split(":").map(Number);
        const [fh, fm] = fin.split(":").map(Number);
        return sum + (fh * 60 + fm - (dh * 60 + dm));
      }, 0);

    const dayPunches = (pointages ?? []).filter((p) => p.horodatage.slice(0, 10) === dateStr);
    let actualMinutes = 0;
    for (let j = 0; j < dayPunches.length - 1; j++) {
      if (dayPunches[j].type === "arrivee" && dayPunches[j + 1].type === "depart") {
        actualMinutes += Math.round((new Date(dayPunches[j + 1].horodatage).getTime() - new Date(dayPunches[j].horodatage).getTime()) / 60000);
      }
    }

    days.push({ date: dateStr, label: JOURS[jourSemaine], expectedMinutes, actualMinutes, hasPunch: dayPunches.length > 0 });
  }

  function fmt(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m.toString().padStart(2, "0")}`;
  }

  const totalExpected = days.reduce((s, d) => s + d.expectedMinutes, 0);
  const totalActual = days.reduce((s, d) => s + d.actualMinutes, 0);

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-5">
        <p className="text-lg font-bold text-text-primary">Mes heures</p>
        <p className="text-sm text-text-secondary mt-0.5">
          Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="bg-white border border-border rounded-card p-5 mb-5">
        <div className="grid grid-cols-3 gap-3 text-center mb-1">
          <div>
            <p className="text-xl font-extrabold text-text-primary">{fmt(totalExpected)}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wide">Prévu</p>
          </div>
          <div>
            <p className="text-xl font-extrabold text-text-primary">{fmt(totalActual)}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wide">Pointé</p>
          </div>
          <div>
            <p className="text-xl font-extrabold text-text-primary">{effectiveApproval ? fmt(effectiveApproval.approved_minutes) : "—"}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wide">Validé</p>
          </div>
        </div>
        {effectiveApproval && (
          <p className={`mt-3 text-xs font-semibold text-center rounded-full py-1.5 ${effectiveApproval.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
            {effectiveApproval.status === "approved" ? "Approuvé" : "Contesté"}
          </p>
        )}
      </div>

      <div className="bg-white border border-border rounded-card divide-y divide-border overflow-hidden mb-5">
        {days.map((d) => (
          <div key={d.date} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-semibold text-text-primary w-24 shrink-0">{d.label}</span>
            <span className="flex-1 text-xs text-text-secondary text-right">
              Prévu {fmt(d.expectedMinutes)} · Pointé {fmt(d.actualMinutes)}
              {d.expectedMinutes > 0 && d.actualMinutes === 0 && !d.hasPunch && <span className="block text-amber-600 font-semibold">Aucun pointage</span>}
            </span>
          </div>
        ))}
      </div>

      <CorrectionRequestForm enseignantId={enseignant.id} establishmentId={enseignant.etablissement_id} />
    </div>
  );
}
