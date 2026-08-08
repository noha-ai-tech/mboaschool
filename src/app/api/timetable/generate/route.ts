// app/api/timetable/generate/route.ts
//
// POST /api/timetable/generate
// Body: { anneeScolaire: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererEmploiDuTemps } from "@/lib/timetable/generate";
import { construireGrilleComplete } from "@/lib/timetable/build-creneaux";
import type {
  ContraintesEtablissement,
  CreneauHoraire,
} from "@/lib/timetable/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifi�" }, { status: 401 });
  }

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!etablissement?.id) {
    return NextResponse.json({ error: "Aucun �tablissement rattach� � ce compte" }, { status: 403 });
  }

  const { anneeScolaire } = await req.json();
  if (!anneeScolaire) {
    return NextResponse.json({ error: "anneeScolaire manquant" }, { status: 400 });
  }

  const etablissementId = etablissement.id;

  const { data: contraintesRow, error: erreurContraintes } = await supabase
    .from("contraintes_etablissement")
    .select("*")
    .eq("etablissement_id", etablissementId)
    .single();

  if (erreurContraintes || !contraintesRow) {
    return NextResponse.json(
      { error: "Aucune contrainte d'�tablissement configur�e. Configure d'abord l'amplitude horaire, la pause d�jeuner et les r�cr�ations." },
      { status: 400 }
    );
  }
  const contraintes = contraintesRow as ContraintesEtablissement;

  const { data: creneauxExistants } = await supabase
    .from("creneaux_horaires")
    .select("*")
    .eq("etablissement_id", etablissementId);

  let creneaux: CreneauHoraire[] = (creneauxExistants as CreneauHoraire[]) ?? [];

  if (creneaux.length === 0) {
    const grille = construireGrilleComplete(contraintes);
    const { data: creneauxInseres, error: erreurInsertion } = await supabase
      .from("creneaux_horaires")
      .insert(grille.map((c) => ({ ...c, etablissement_id: etablissementId })))
      .select("*");

    if (erreurInsertion) {
      return NextResponse.json({ error: `�chec cr�ation des cr�neaux : ${erreurInsertion.message}` }, { status: 500 });
    }
    creneaux = (creneauxInseres as CreneauHoraire[]) ?? [];
  }

  const creneauxCours = creneaux.filter((c) => c.type === "cours");

  const [classesRes, matieresRes, volumesRes, enseignantsRes, emRes, dispoRes] =
    await Promise.all([
      supabase.from("classes").select("id, establishment_id, name, level").eq("establishment_id", etablissementId),
      supabase.from("matieres").select("id, etablissement_id, nom, departement_disciplinaire").eq("etablissement_id", etablissementId),
      supabase
        .from("matieres_volume_horaire")
        .select("matiere_id, niveau, heures_semaine, matieres!inner(etablissement_id)")
        .eq("matieres.etablissement_id", etablissementId),
      supabase.from("enseignants").select("id, etablissement_id, nom, prenom").eq("etablissement_id", etablissementId),
      supabase
        .from("enseignant_matieres")
        .select("enseignant_id, matiere_id, enseignants!inner(etablissement_id)")
        .eq("enseignants.etablissement_id", etablissementId),
      supabase
        .from("enseignant_disponibilites")
        .select("enseignant_id, jour_semaine, heure_debut, heure_fin, enseignants!inner(etablissement_id)")
        .eq("enseignants.etablissement_id", etablissementId),
    ]);

  const erreurChargement = [classesRes, matieresRes, volumesRes, enseignantsRes, emRes, dispoRes].find(
    (r) => r.error
  );
  if (erreurChargement?.error) {
    return NextResponse.json({ error: `�chec chargement des donn�es : ${erreurChargement.error.message}` }, { status: 500 });
  }

  if (!classesRes.data?.length) {
    return NextResponse.json({ error: "Aucune classe enregistr�e pour cet �tablissement" }, { status: 400 });
  }
  if (!enseignantsRes.data?.length) {
    return NextResponse.json({ error: "Aucun enseignant enregistr� pour cet �tablissement" }, { status: 400 });
  }

  const resultat = genererEmploiDuTemps({
    etablissementId,
    anneeScolaire,
    contraintes,
    creneauxCours,
    classes: classesRes.data,
    matieres: matieresRes.data ?? [],
    volumesHoraires: (volumesRes.data ?? []).map((v: any) => ({
      matiere_id: v.matiere_id,
      niveau: v.niveau,
      heures_semaine: v.heures_semaine,
    })),
    enseignants: enseignantsRes.data,
    enseignantMatieres: (emRes.data ?? []).map((e: any) => ({
      enseignant_id: e.enseignant_id,
      matiere_id: e.matiere_id,
    })),
    disponibilites: (dispoRes.data ?? []).map((d: any) => ({
      enseignant_id: d.enseignant_id,
      jour_semaine: d.jour_semaine,
      heure_debut: d.heure_debut,
      heure_fin: d.heure_fin,
    })),
  });

  // Mission 05, Phase 5 - publication non destructive : une generation ne
  // supprime plus jamais l'emploi du temps precedent. Elle produit un
  // BROUILLON (statut='brouillon', est_actif=false) a cote de la version
  // actuellement publiee (si elle existe), qui reste inchangee et visible
  // tant qu'aucune publication explicite n'a lieu (POST /api/timetable/publish).
  // Voir docs/timetable/01_ARCHITECTURE.md pour le comportement destructif
  // que ce changement corrige.
  const { data: versionsExistantes } = await supabase
    .from("emplois_du_temps")
    .select("version")
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", anneeScolaire)
    .order("version", { ascending: false })
    .limit(1);

  const prochaineVersion = (versionsExistantes?.[0]?.version ?? 0) + 1;

  if (resultat.affectations.length > 0) {
    const { error: erreurInsertionEDT } = await supabase.from("emplois_du_temps").insert(
      resultat.affectations.map((a) => ({
        etablissement_id: etablissementId,
        annee_scolaire: anneeScolaire,
        classe_id: a.classe_id,
        matiere_id: a.matiere_id,
        enseignant_id: a.enseignant_id,
        creneau_id: a.creneau_id,
        statut: "brouillon",
        version: prochaineVersion,
        est_actif: false,
      }))
    );

    if (erreurInsertionEDT) {
      return NextResponse.json({ error: `echec sauvegarde : ${erreurInsertionEDT.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    nbAffectations: resultat.affectations.length,
    besoinsNonSatisfaits: resultat.besoinsNonSatisfaits,
    version: prochaineVersion,
    statut: "brouillon",
  });
}
