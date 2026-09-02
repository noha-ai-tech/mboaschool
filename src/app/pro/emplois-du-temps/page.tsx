import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { GrilleEmploiDuTemps } from "@/components/timetable/GrilleEmploiDuTemps";
import { BoutonGenerer } from "@/components/timetable/BoutonGenerer";
import { BoutonPublier } from "@/components/timetable/BoutonPublier";
import { CalendarDays, Clock3, LayoutGrid } from "lucide-react";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";

const ANNEE_SCOLAIRE_COURANTE = "2026-2027";

type Vue = "classe" | "individuelle" | "departement" | "matiere" | "salle" | "globale";

const TABS: { vue: Vue; label: string }[] = [
  { vue: "globale", label: "Établissement" },
  { vue: "individuelle", label: "Enseignant" },
  { vue: "classe", label: "Classe" },
  { vue: "salle", label: "Salle" },
  { vue: "matiere", label: "Matière" },
  { vue: "departement", label: "Département" },
];

interface AffectationAffichee {
  creneau_id: string;
  matiere_nom: string;
  matiere_couleur?: string;
  enseignant_nom: string;
  classe_nom?: string;
}

export default async function EmploisDuTempsPage({
  searchParams,
}: {
  searchParams: Promise<{
    vue?: string;
    classe?: string;
    enseignant?: string;
    departement?: string;
    matiere?: string;
    salle?: string;
    school?: string;
  }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const vue: Vue = (["classe", "individuelle", "departement", "matiere", "salle", "globale"].includes(params.vue ?? "")
    ? (params.vue as Vue)
    : "globale");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="p-6 text-sm text-gray-500">Non authentifié.</p>;
  }

  const etablissement = await requireActiveEstablishment(supabase, user.id, params.school, "/pro/emplois-du-temps");
  const etablissementId = etablissement.id;
  const schoolHref = (href: string) => withEstablishmentQuery(href, etablissementId);

  const { data: creneaux } = await supabase
    .from("creneaux_horaires")
    .select("id, jour_semaine, heure_debut, heure_fin, type")
    .eq("etablissement_id", etablissementId)
    .order("heure_debut");

  // Mission 05, Phase 5 — un brouillon existe-t-il pour cette année scolaire ?
  const { count: brouillonCount } = await supabase
    .from("emplois_du_temps")
    .select("id", { count: "exact", head: true })
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
    .eq("statut", "brouillon");

  let affectations: AffectationAffichee[] = [];
  let showClasse = false;
  let selectorNode: ReactNode = null;

  // ── Vue Par classe ──────────────────────────────────────────────────────────
  if (vue === "classe") {
    const { data: classes } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("establishment_id", etablissementId)
      .order("name");

    if (!classes?.length) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-500">
            Aucune classe enregistrée. Ajoute d&apos;abord tes classes avant de générer un emploi
            du temps.
          </p>
        </div>
      );
    }

    const classeSelectionnee = classes.find((c) => c.id === params.classe) ?? classes[0];

    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, matieres(nom, couleur), enseignants(nom, prenom)")
      .eq("etablissement_id", etablissementId)
      .eq("classe_id", classeSelectionnee.id)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: a.matieres?.nom ?? "?",
      matiere_couleur: a.matieres?.couleur,
      enseignant_nom: a.enseignants ? `${a.enseignants.prenom} ${a.enseignants.nom}` : "?",
    }));

    selectorNode = (
      <div className="mb-4 flex gap-2 flex-wrap">
        {classes.map((c) => (
          <Link
            key={c.id}
            href={schoolHref(`/pro/emplois-du-temps?vue=classe&classe=${c.id}`)}
            className={`rounded-full px-3 py-1 text-sm border ${
              c.id === classeSelectionnee.id
                ? "bg-[#007A3D] text-white border-[#007A3D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>
    );

  // ── Vue Individuelle (par enseignant) ───────────────────────────────────────
  } else if (vue === "individuelle") {
    const { data: enseignants } = await supabase
      .from("enseignants")
      .select("id, nom, prenom")
      .eq("etablissement_id", etablissementId)
      .order("nom");

    if (!enseignants?.length) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-500">Aucun enseignant enregistré.</p>
        </div>
      );
    }

    const enseignantSelectionne =
      enseignants.find((e) => e.id === params.enseignant) ?? enseignants[0];

    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, matieres(nom, couleur), classes(name)")
      .eq("etablissement_id", etablissementId)
      .eq("enseignant_id", enseignantSelectionne.id)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: a.matieres?.nom ?? "?",
      matiere_couleur: a.matieres?.couleur,
      enseignant_nom: `${enseignantSelectionne.prenom} ${enseignantSelectionne.nom}`,
      classe_nom: a.classes?.name,
    }));

    showClasse = true;

    selectorNode = (
      <div className="mb-4 flex gap-2 flex-wrap">
        {enseignants.map((e) => (
          <Link
            key={e.id}
            href={schoolHref(`/pro/emplois-du-temps?vue=individuelle&enseignant=${e.id}`)}
            className={`rounded-full px-3 py-1 text-sm border ${
              e.id === enseignantSelectionne.id
                ? "bg-[#007A3D] text-white border-[#007A3D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {e.prenom} {e.nom}
          </Link>
        ))}
      </div>
    );

  // ── Vue Par département disciplinaire ───────────────────────────────────────
  } else if (vue === "departement") {
    const { data: matieres } = await supabase
      .from("matieres")
      .select("id, departement_disciplinaire, couleur")
      .eq("etablissement_id", etablissementId);

    const departements = Array.from(
      new Set(
        (matieres ?? [])
          .map((m) => m.departement_disciplinaire)
          .filter((d): d is string => Boolean(d))
      )
    ).sort();

    if (!departements.length) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-500">Aucun département disciplinaire enregistré.</p>
        </div>
      );
    }

    const departementSelectionne =
      params.departement && departements.includes(params.departement)
        ? params.departement
        : departements[0];

    const matiereIds = (matieres ?? [])
      .filter((m) => m.departement_disciplinaire === departementSelectionne)
      .map((m) => m.id);

    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, matieres(nom, couleur), enseignants(nom, prenom), classes(name)")
      .eq("etablissement_id", etablissementId)
      .in("matiere_id", matiereIds)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: a.matieres?.nom ?? "?",
      matiere_couleur: a.matieres?.couleur,
      enseignant_nom: a.enseignants ? `${a.enseignants.prenom} ${a.enseignants.nom}` : "?",
      classe_nom: a.classes?.name,
    }));

    showClasse = true;

    selectorNode = (
      <div className="mb-4 flex gap-2 flex-wrap">
        {departements.map((d) => (
          <Link
            key={d}
            href={schoolHref(`/pro/emplois-du-temps?vue=departement&departement=${encodeURIComponent(d)}`)}
            className={`rounded-full px-3 py-1 text-sm border ${
              d === departementSelectionne
                ? "bg-[#007A3D] text-white border-[#007A3D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {d}
          </Link>
        ))}
      </div>
    );

  // ── Vue Matière (Mission 05, Phase 3) ───────────────────────────────────────
  } else if (vue === "matiere") {
    const { data: matieres } = await supabase
      .from("matieres")
      .select("id, nom, couleur")
      .eq("etablissement_id", etablissementId)
      .order("nom");

    if (!matieres?.length) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-500">Aucune matière enregistrée.</p>
        </div>
      );
    }

    const matiereSelectionnee = matieres.find((m) => m.id === params.matiere) ?? matieres[0];

    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, enseignants(nom, prenom), classes(name)")
      .eq("etablissement_id", etablissementId)
      .eq("matiere_id", matiereSelectionnee.id)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: matiereSelectionnee.nom,
      matiere_couleur: matiereSelectionnee.couleur,
      enseignant_nom: a.enseignants ? `${a.enseignants.prenom} ${a.enseignants.nom}` : "?",
      classe_nom: a.classes?.name,
    }));

    showClasse = true;

    selectorNode = (
      <div className="mb-4 flex gap-2 flex-wrap">
        {matieres.map((m) => (
          <Link
            key={m.id}
            href={schoolHref(`/pro/emplois-du-temps?vue=matiere&matiere=${m.id}`)}
            className={`rounded-full px-3 py-1 text-sm border ${
              m.id === matiereSelectionnee.id
                ? "bg-[#007A3D] text-white border-[#007A3D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {m.nom}
          </Link>
        ))}
      </div>
    );

  // ── Vue Salle (Mission 05, Phase 2/3) ───────────────────────────────────────
  } else if (vue === "salle") {
    const { data: salles } = await supabase
      .from("salles")
      .select("id, nom")
      .eq("etablissement_id", etablissementId)
      .order("nom");

    if (!salles?.length) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-500">
            Aucune salle enregistrée. La gestion des salles est nouvelle (Mission 05) — ajoutez-en depuis{" "}
            <Link href={schoolHref("/pro/salles")} className="text-[#007A3D] font-medium">Salles</Link>.
          </p>
        </div>
      );
    }

    const salleSelectionnee = salles.find((s) => s.id === params.salle) ?? salles[0];

    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, matieres(nom, couleur), enseignants(nom, prenom), classes(name)")
      .eq("etablissement_id", etablissementId)
      .eq("salle_id", salleSelectionnee.id)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: a.matieres?.nom ?? "?",
      matiere_couleur: a.matieres?.couleur,
      enseignant_nom: a.enseignants ? `${a.enseignants.prenom} ${a.enseignants.nom}` : "?",
      classe_nom: a.classes?.name,
    }));

    showClasse = true;

    selectorNode = (
      <div className="mb-4 flex gap-2 flex-wrap">
        {salles.map((s) => (
          <Link
            key={s.id}
            href={schoolHref(`/pro/emplois-du-temps?vue=salle&salle=${s.id}`)}
            className={`rounded-full px-3 py-1 text-sm border ${
              s.id === salleSelectionnee.id
                ? "bg-[#007A3D] text-white border-[#007A3D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {s.nom}
          </Link>
        ))}
      </div>
    );

  // ── Vue Globale ─────────────────────────────────────────────────────────────
  } else {
    const { data: raw } = await supabase
      .from("emplois_du_temps")
      .select("creneau_id, matieres(nom, couleur), enseignants(nom, prenom), classes(name)")
      .eq("etablissement_id", etablissementId)
      .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE)
      .eq("est_actif", true);

    affectations = (raw ?? []).map((a: any) => ({
      creneau_id: a.creneau_id,
      matiere_nom: a.matieres?.nom ?? "?",
      matiere_couleur: a.matieres?.couleur,
      enseignant_nom: a.enseignants ? `${a.enseignants.prenom} ${a.enseignants.nom}` : "?",
      classe_nom: a.classes?.name,
    }));

    showClasse = true;

    selectorNode = (
      <p className="mb-4 text-sm text-gray-500">
        Vue complète de l&apos;établissement — toutes les classes et matières simultanément.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <SchoolAdminPageHeader eyebrow="Planification" title="Emplois du temps" description="Consultez la grille active selon l’établissement, la classe, l’enseignant, la matière ou la salle." actions={
        <div className="flex flex-wrap items-center gap-2">
          <BoutonGenerer anneeScolaire={ANNEE_SCOLAIRE_COURANTE} establishmentId={etablissementId} />
          <BoutonPublier anneeScolaire={ANNEE_SCOLAIRE_COURANTE} hasBrouillon={(brouillonCount ?? 0) > 0} establishmentId={etablissementId} />
        </div>
      } />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SchoolAdminStatCard label="Créneaux configurés" value={(creneaux ?? []).length} icon={<Clock3 size={19} />} />
        <SchoolAdminStatCard label="Affectations affichées" value={affectations.length} icon={<CalendarDays size={19} />} tone="neutral" />
        <SchoolAdminStatCard label="État de travail" value={(brouillonCount ?? 0) > 0 ? "Brouillon disponible" : "Aucun brouillon"} icon={<LayoutGrid size={19} />} tone={(brouillonCount ?? 0) > 0 ? "warning" : "neutral"} />
      </div>

      <div className="mb-6 rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-2 shadow-[var(--school-admin-shadow-sm)]">
        <nav className="flex flex-wrap gap-1" aria-label="Vues de l’emploi du temps">
          {TABS.map((tab) => (
            <Link
              key={tab.vue}
              href={schoolHref(`/pro/emplois-du-temps?vue=${tab.vue}`)}
              aria-current={vue === tab.vue ? "page" : undefined}
              className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] ${
                vue === tab.vue
                  ? "border-[var(--school-admin-primary)] bg-[var(--school-admin-primary-soft)] text-[var(--school-admin-primary-strong)] shadow-sm"
                  : "border-transparent text-[var(--school-admin-text-muted)] hover:bg-[var(--school-admin-surface-muted)]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <SchoolAdminSectionCard title="Grille active" description="Les états et affectations affichés proviennent uniquement des données actuellement disponibles." action={<SchoolAdminStatusBadge tone={(brouillonCount ?? 0) > 0 ? "warning" : "neutral"} label={(brouillonCount ?? 0) > 0 ? "Brouillon prêt à publier" : "Aucun brouillon"} />}>
      {selectorNode}
      <GrilleEmploiDuTemps
        creneaux={creneaux ?? []}
        affectations={affectations}
        showClasse={showClasse}
      />
      </SchoolAdminSectionCard>
    </div>
  );
}
