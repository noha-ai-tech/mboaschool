// POST /api/payroll/calculer
// Calcule un bulletin de paie brouillon pour un membre du personnel sur une
// periode donnee (Mission 06, Phase 6/7 - premiere etape du workflow
// "Calcul -> Brouillon"). Reserve au proprietaire de l'etablissement.
//
// Charge : contrat actif (staff_contracts), heures effectuees
// (RPC calculer_heures_enseignant existante, si le membre a une fiche
// enseignant liee - voir limite documentee dans docs/payroll/03_PAYROLL_ENGINE.md
// pour le personnel non-enseignant), heures prevues (emplois_du_temps),
// primes et retenues de la periode, configuration de l'etablissement.
// Appelle ensuite calculerBulletin() (fonction pure, src/lib/payroll/calculate.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculerBulletin } from "@/lib/payroll/calculate";
import type { ContractType } from "@/lib/payroll/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifie" }, { status: 401 });

  const { data: etablissement } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!etablissement) return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
  const etablissementId = etablissement.id;

  const body = await req.json().catch(() => null);
  const { staffMemberId, periodeDebut, periodeFin } = body as {
    staffMemberId?: string; periodeDebut?: string; periodeFin?: string;
  };
  if (!staffMemberId || !periodeDebut || !periodeFin) {
    return NextResponse.json({ error: "staffMemberId, periodeDebut et periodeFin sont requis" }, { status: 400 });
  }

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id, enseignant_id, employment_type")
    .eq("id", staffMemberId)
    .eq("etablissement_id", etablissementId)
    .single();
  if (!staffMember) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

  const { data: contrat } = await supabase
    .from("staff_contracts")
    .select("type, salaire, taux_horaire")
    .eq("staff_member_id", staffMemberId)
    .eq("statut", "actif")
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contrat) {
    return NextResponse.json({ error: "Aucun contrat actif pour ce membre du personnel" }, { status: 400 });
  }

  let heuresEffectuees = 0;
  let heuresPrevues = 0;

  if (staffMember.enseignant_id) {
    const { data: heuresRpc } = await supabase.rpc("calculer_heures_enseignant", {
      p_enseignant_id: staffMember.enseignant_id,
      p_date_debut: periodeDebut,
      p_date_fin: periodeFin,
    });
    heuresEffectuees = Number(heuresRpc ?? 0);

    // Heures prevues : approximation par nombre d'occurrences du jour de la
    // semaine sur la periode x duree du creneau - voir limite documentee
    // (emplois_du_temps n'a pas de date precise, Mission 05).
    const { data: edt } = await supabase
      .from("emplois_du_temps")
      .select("creneaux_horaires(jour_semaine, heure_debut, heure_fin)")
      .eq("enseignant_id", staffMember.enseignant_id)
      .eq("etablissement_id", etablissementId)
      .eq("est_actif", true);

    const debut = new Date(periodeDebut);
    const fin = new Date(periodeFin);
    const nbJoursPeriode = Math.max(1, Math.round((fin.getTime() - debut.getTime()) / 86_400_000) + 1);
    const nbSemaines = nbJoursPeriode / 7;

    heuresPrevues = (edt ?? []).reduce((total: number, e: any) => {
      const cr = e.creneaux_horaires;
      if (!cr) return total;
      const [hD, mD] = cr.heure_debut.split(":").map(Number);
      const [hF, mF] = cr.heure_fin.split(":").map(Number);
      const duree = (hF * 60 + mF - (hD * 60 + mD)) / 60;
      return total + duree * nbSemaines;
    }, 0);
  }

  const heuresSupplementaires = Math.max(0, heuresEffectuees - heuresPrevues);

  const [{ data: config }, { data: primesRows }, { data: retenuesRows }] = await Promise.all([
    supabase.from("payroll_config").select("taux_heure_sup_multiplicateur").eq("etablissement_id", etablissementId).maybeSingle(),
    supabase.from("primes").select("libelle, montant").eq("staff_member_id", staffMemberId).gte("periode_debut", periodeDebut).lte("periode_fin", periodeFin),
    supabase.from("retenues").select("libelle, montant").eq("staff_member_id", staffMemberId).gte("periode_debut", periodeDebut).lte("periode_fin", periodeFin),
  ]);

  const resultat = calculerBulletin({
    contrat: {
      type: (contrat.type as ContractType) ?? "temps_plein",
      salaire: contrat.salaire,
      tauxHoraire: contrat.taux_horaire,
    },
    heures: { heuresPrevues, heuresEffectuees, heuresSupplementaires },
    primes: (primesRows ?? []).map((p) => ({ libelle: p.libelle, montant: p.montant })),
    retenues: (retenuesRows ?? []).map((r) => ({ libelle: r.libelle, montant: r.montant })),
    config: { tauxHeureSupMultiplicateur: config?.taux_heure_sup_multiplicateur ?? 1.25 },
  });

  const { data: bulletin, error } = await supabase
    .from("bulletins_paie")
    .upsert(
      {
        staff_member_id: staffMemberId,
        etablissement_id: etablissementId,
        periode_debut: periodeDebut,
        periode_fin: periodeFin,
        salaire_base: resultat.salaireBase,
        heures_prevues: heuresPrevues,
        heures_effectuees: heuresEffectuees,
        heures_supplementaires: heuresSupplementaires,
        montant_heures_sup: resultat.montantHeuresSup,
        total_primes: resultat.totalPrimes,
        total_retenues: resultat.totalRetenues,
        salaire_brut: resultat.salaireBrut,
        salaire_net: resultat.salaireNet,
        statut: "brouillon",
        calcule_le: new Date().toISOString(),
        calcule_par: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_member_id,periode_debut,periode_fin" }
    )
    .select("id")
    .single();

  if (error || !bulletin) {
    return NextResponse.json({ error: `Echec du calcul : ${error?.message ?? "erreur inconnue"}` }, { status: 500 });
  }

  // Remplace les lignes de detail (recalcul complet a chaque appel).
  await supabase.from("bulletin_paie_lignes").delete().eq("bulletin_id", bulletin.id);
  await supabase.from("bulletin_paie_lignes").insert(
    resultat.lignes.map((l) => ({
      bulletin_id: bulletin.id,
      type: l.type,
      libelle: l.libelle,
      montant: l.montant,
      signe: l.signe,
    }))
  );

  await supabase.from("bulletin_paie_historique").insert({
    bulletin_id: bulletin.id,
    statut_precedent: null,
    statut_nouveau: "brouillon",
    change_par: user.id,
    commentaire: "Calcul automatique",
  });

  return NextResponse.json({ ok: true, bulletinId: bulletin.id, resultat });
}
