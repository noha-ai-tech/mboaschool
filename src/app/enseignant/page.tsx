import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardList, MessageSquare, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SelecteurEtablissement } from "@/components/enseignant/SelecteurEtablissement";
import { TeacherDayCachePrimer } from "@/components/enseignant/TeacherDayCachePrimer";

// MOBILE-01 — nouvelle route canonique mobile de l'enseignant. Réutilise
// exactement le même schéma de requête que /enseignant/mon-espace
// (enseignants -> emplois_du_temps -> creneaux_horaires, filtré côté
// client par jour_semaine puisque emplois_du_temps ne modélise qu'un
// gabarit hebdomadaire récurrent, sans instance datée — voir l'audit
// MOBILE-01) plutôt que d'inventer un second modèle de lecture.
//
// Ce n'est pas une réduction du dashboard desktop : une seule question
// structure la page — "quelle est ma journée aujourd'hui ?" — les heures,
// le salaire, les documents et l'historique des présences restent sur
// /enseignant/mon-espace, une couche en dessous, pas dupliqués ici.

const JOUR_SEMAINE_AUJOURDHUI = new Date().getDay();

type CoursDuJour = {
  id: string;
  classe_id: string;
  matiere_id: string;
  classes: { name: string } | null;
  matieres: { nom: string } | null;
  creneaux_horaires: { jour_semaine: number; heure_debut: string; heure_fin: string } | null;
};

export default async function EnseignantAujourdhuiPage({
  searchParams,
}: {
  searchParams: Promise<{ eid?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const { data: enseignants } = await supabase
    .from("enseignants")
    .select("id, nom, prenom, etablissement_id, establishments(name)")
    .eq("user_id", user.id);

  if (!enseignants?.length) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-sm text-text-secondary">
        Aucune fiche enseignant liée à ce compte.{" "}
        <a href="/auth/connexion" className="text-primary underline">
          Se reconnecter
        </a>
      </div>
    );
  }

  const enseignant = (params.eid ? enseignants.find((e) => e.id === params.eid) : null) ?? enseignants[0];
  const multiEtab = enseignants.length > 1;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const { data: edt } = await supabase
    .from("emplois_du_temps")
    .select("id, classe_id, matiere_id, classes(name), matieres(nom), creneaux_horaires(jour_semaine, heure_debut, heure_fin)")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id)
    .returns<CoursDuJour[]>();

  const coursDuJour = (edt ?? [])
    .filter((e) => e.creneaux_horaires?.jour_semaine === JOUR_SEMAINE_AUJOURDHUI)
    .sort((a, b) => (a.creneaux_horaires?.heure_debut ?? "").localeCompare(b.creneaux_horaires?.heure_debut ?? ""));

  // Rosters des classes concernées AUJOURD'HUI uniquement (Phase 12 : pas
  // toute l'école) — préchargés côté client par TeacherDayCachePrimer pour
  // un usage hors-ligne, jamais téléchargés en un lot "toute la classe" ici
  // pour rien si le cours n'est finalement jamais ouvert offline.
  const classeIdsAujourdhui = Array.from(new Set(coursDuJour.map((e) => e.classe_id)));
  const { data: rosters } = classeIdsAujourdhui.length
    ? await supabase.from("students").select("id, classe_id, first_name, last_name").in("classe_id", classeIdsAujourdhui).eq("status", "active")
    : { data: [] as { id: string; classe_id: string; first_name: string; last_name: string }[] };

  const nowHHMM = today.toTimeString().slice(0, 5);

  function statutCours(c: CoursDuJour): "a_venir" | "maintenant" | "termine" {
    const debut = c.creneaux_horaires?.heure_debut ?? "";
    const fin = c.creneaux_horaires?.heure_fin ?? "";
    if (fin <= nowHHMM) return "termine";
    if (debut <= nowHHMM && nowHHMM < fin) return "maintenant";
    return "a_venir";
  }

  const prochainCours = coursDuJour.find((c) => statutCours(c) !== "termine");

  const optionsSelecteur = enseignants.map((e) => ({
    enseignantId: e.id,
    nomEtablissement: (e.establishments as unknown as { name: string } | null)?.name ?? `Établissement ${e.etablissement_id.slice(0, 8)}`,
  }));

  const STATUT_LABEL: Record<ReturnType<typeof statutCours>, string> = {
    a_venir: "À venir",
    maintenant: "Maintenant",
    termine: "Terminé",
  };
  const STATUT_CLASS: Record<ReturnType<typeof statutCours>, string> = {
    a_venir: "bg-slate-100 text-slate-500",
    maintenant: "bg-primary text-white",
    termine: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="max-w-md mx-auto">
      <TeacherDayCachePrimer
        teacherEnseignantId={enseignant.id}
        dateStr={todayStr}
        establishmentId={enseignant.etablissement_id}
        schedule={coursDuJour.map((c) => ({
          emploiDuTempsId: c.id,
          classeId: c.classe_id,
          matiereId: c.matiere_id,
          matiereNom: c.matieres?.nom ?? "—",
          classeNom: c.classes?.name ?? "—",
          heureDebut: c.creneaux_horaires?.heure_debut ?? "",
          heureFin: c.creneaux_horaires?.heure_fin ?? "",
        }))}
        rosters={classeIdsAujourdhui.map((classeId) => ({
          classeId,
          students: (rosters ?? []).filter((s) => s.classe_id === classeId).map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name })),
        }))}
      />

      <div className="mb-5">
        <p className="text-lg font-bold text-text-primary">Bonjour {enseignant.prenom}</p>
        <p className="text-sm text-text-secondary capitalize mt-0.5">
          {today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {multiEtab && (
        <div className="mb-5">
          <SelecteurEtablissement etablissements={optionsSelecteur} selectedEnseignantId={enseignant.id} debut={todayStr} fin={todayStr} />
        </div>
      )}

      {/* Prochain cours — carte dominante */}
      <div className="bg-white border border-border rounded-card p-5 mb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-3">
          {prochainCours && statutCours(prochainCours) === "maintenant" ? "Cours en cours" : "Prochain cours"}
        </p>
        {prochainCours ? (
          <>
            <p className="text-2xl font-extrabold text-text-primary tracking-tight">
              {prochainCours.creneaux_horaires?.heure_debut}–{prochainCours.creneaux_horaires?.heure_fin}
            </p>
            <p className="text-lg font-bold text-text-primary mt-1.5">{prochainCours.matieres?.nom ?? "—"}</p>
            <p className="text-sm text-text-secondary mt-0.5">{prochainCours.classes?.name ?? "—"}</p>
            <Link
              href={`/enseignant/cours/${prochainCours.id}`}
              className="mt-4 flex items-center justify-center gap-2 h-12 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 transition-all duration-base"
            >
              Ouvrir le cours
              <ArrowRight size={15} />
            </Link>
          </>
        ) : (
          <p className="text-sm text-text-secondary py-3">Aucun cours restant aujourd&apos;hui.</p>
        )}
      </div>

      {/* Ma journée */}
      <div className="bg-white border border-border rounded-card p-5 mb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-4">Ma journée</p>
        {coursDuJour.length === 0 ? (
          <p className="text-sm text-text-secondary">Aucun cours prévu aujourd&apos;hui.</p>
        ) : (
          <div className="space-y-1">
            {coursDuJour.map((c) => {
              const statut = statutCours(c);
              return (
                <Link
                  key={c.id}
                  href={`/enseignant/cours/${c.id}`}
                  className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-muted/60 transition-colors duration-base"
                >
                  <span className="font-mono text-sm font-semibold text-text-primary w-12 shrink-0">{c.creneaux_horaires?.heure_debut?.slice(0, 5)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-text-primary truncate">{c.matieres?.nom ?? "—"}</span>
                    <span className="block text-xs text-text-secondary truncate">{c.classes?.name ?? "—"}</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${STATUT_CLASS[statut]}`}>{STATUT_LABEL[statut]}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Accès rapides */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {prochainCours ? (
          <Link
            href={`/enseignant/cours/${prochainCours.id}`}
            className="flex items-center gap-2 h-12 px-4 rounded-card bg-primary-light text-primary text-sm font-bold hover:opacity-90 transition-opacity duration-base"
          >
            <ClipboardList size={16} className="shrink-0" /> Faire l&apos;appel
          </Link>
        ) : (
          <span className="flex items-center gap-2 h-12 px-4 rounded-card bg-muted text-text-secondary text-sm font-semibold opacity-60 cursor-not-allowed">
            <ClipboardList size={16} className="shrink-0" /> Faire l&apos;appel
          </span>
        )}
        <Link href="/enseignant/emploi-du-temps" className="flex items-center gap-2 h-12 px-4 rounded-card border border-border bg-white text-sm font-semibold text-text-primary hover:border-primary transition-colors duration-base">
          <CalendarDays size={16} className="text-text-secondary shrink-0" /> Mon emploi du temps
        </Link>
        <Link href="/enseignant/mon-espace#classes" className="flex items-center gap-2 h-12 px-4 rounded-card border border-border bg-white text-sm font-semibold text-text-primary hover:border-primary transition-colors duration-base">
          <AlertTriangle size={16} className="text-text-secondary shrink-0" /> Mes classes
        </Link>
        <Link href="/enseignant/mon-espace#messages" className="flex items-center gap-2 h-12 px-4 rounded-card border border-border bg-white text-sm font-semibold text-text-primary hover:border-primary transition-colors duration-base">
          <MessageSquare size={16} className="text-text-secondary shrink-0" /> Messages
        </Link>
      </div>
    </div>
  );
}
