// POST /api/timetable/publish
// Mission 05, Phase 5 - workflow de publication : Brouillon -> Validation ->
// Publication -> Historique. Active la derniere version brouillon d'une
// annee scolaire donnee, archive (sans supprimer) la version precedemment
// active. Aucune ligne n'est jamais supprimee - voir
// docs/timetable/01_ARCHITECTURE.md et 02_ENGINE.md.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement?.id) {
    return NextResponse.json({ error: "Aucun etablissement rattache a ce compte" }, { status: 403 });
  }
  const etablissementId = etablissement.id;

  const { anneeScolaire } = await req.json().catch(() => ({}));
  if (!anneeScolaire) {
    return NextResponse.json({ error: "anneeScolaire manquant" }, { status: 400 });
  }

  const { data: versionsExistantes } = await supabase
    .from("emplois_du_temps")
    .select("version")
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", anneeScolaire)
    .eq("statut", "brouillon")
    .order("version", { ascending: false })
    .limit(1);

  const versionAPublier = versionsExistantes?.[0]?.version;
  if (versionAPublier == null) {
    return NextResponse.json({ error: "Aucun brouillon a publier pour cette annee scolaire" }, { status: 404 });
  }

  // 1. Archive la version actuellement active (ne la supprime jamais).
  const { error: erreurArchivage } = await supabase
    .from("emplois_du_temps")
    .update({ est_actif: false, statut: "archive" })
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", anneeScolaire)
    .eq("est_actif", true);

  if (erreurArchivage) {
    return NextResponse.json({ error: `Echec archivage : ${erreurArchivage.message}` }, { status: 500 });
  }

  // 2. Publie le brouillon le plus recent.
  const { error: erreurPublication } = await supabase
    .from("emplois_du_temps")
    .update({
      est_actif: true,
      statut: "publie",
      publie_le: new Date().toISOString(),
      publie_par: user.id,
    })
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", anneeScolaire)
    .eq("version", versionAPublier)
    .eq("statut", "brouillon");

  if (erreurPublication) {
    return NextResponse.json({ error: `Echec publication : ${erreurPublication.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, versionPubliee: versionAPublier });
}
