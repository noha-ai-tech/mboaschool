import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GrilleEmploiDuTemps } from "@/components/timetable/GrilleEmploiDuTemps";
import { BoutonGenerer } from "@/components/timetable/BoutonGenerer";
import { BoutonPublier } from "@/components/timetable/BoutonPublier";

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

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!etablissement?.id) {
    return (
      <p className="p-6 text-sm text-gray-500">
        Aucun établissement rattaché à ce compte.
      </p>
    );
  }
  const etablissementId = etablissement.id;

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
            href={`/pro/emplois-du-temps?vue=classe&classe=${c.id}`}
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
            href={`/pro/emplois-du-temps?vue=individuelle&enseignant=${e.id}`}
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
            href={`/pro/emplois-du-temps?vue=departement&departement=${encodeURIComponent(d)}`}
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
            href={`/pro/emplois-du-temps?vue=matiere&matiere=${m.id}`}
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
            <Link href="/pro/salles" className="text-[#007A3D] font-medium">Salles</Link>.
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
            href={`/pro/emplois-du-temps?vue=salle&salle=${s.id}`}
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Emplois du temps</h1>
          <p className="text-sm text-gray-500">Année scolaire {ANNEE_SCOLAIRE_COURANTE}</p>
        </div>
        <div className="flex items-center gap-3">
          <BoutonGenerer anneeScolaire={ANNEE_SCOLAIRE_COURANTE} />
          <BoutonPublier anneeScolaire={ANNEE_SCOLAIRE_COURANTE} hasBrouillon={(brouillonCount ?? 0) > 0} />
        </div>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex">
          {TABS.map((tab) => (
            <Link
              key={tab.vue}
              href={`/pro/emplois-du-temps?vue=${tab.vue}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                vue === tab.vue
                  ? "border-[#007A3D] text-[#007A3D]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {selectorNode}

      <GrilleEmploiDuTemps
        creneaux={creneaux ?? []}
        affectations={affectations}
        showClasse={showClasse}
      />
    </div>
  );
}
