// GET /api/payroll/[id]/export
// Export CSV d'un bulletin de paie (Mission 06, Phase 9). Seul export
// reellement implemente dans cette mission - PDF et Excel restent une
// preparation documentee (docs/payroll/03_PAYROLL_ENGINE.md), aucune
// dependance de generation de fichier n'a ete ajoutee au projet.
//
// Aucune verification d'autorisation explicite dans cette route : elle
// utilise le client cookie (RLS), donc un utilisateur ne peut exporter que
// ce que ses policies RLS lui permettent deja de lire (directeur : tout
// bulletin de son etablissement ; enseignant : son propre bulletin, une
// fois au statut 'paie_validee' uniquement - voir bulletins_self_read,
// migration 0011).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bulletinId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifie" }, { status: 401 });

  const { data: bulletin } = await supabase
    .from("bulletins_paie")
    .select("periode_debut, periode_fin, salaire_brut, salaire_net, statut, staff_members(first_name, last_name)")
    .eq("id", bulletinId)
    .single();

  if (!bulletin) {
    return NextResponse.json({ error: "Bulletin introuvable ou acces refuse" }, { status: 404 });
  }

  const { data: lignes } = await supabase
    .from("bulletin_paie_lignes")
    .select("libelle, signe, montant")
    .eq("bulletin_id", bulletinId);

  const staffMember = bulletin.staff_members as unknown as { first_name: string; last_name: string } | null;

  const rows = [
    ["Bulletin de paie"],
    ["Personnel", `${staffMember?.first_name ?? ""} ${staffMember?.last_name ?? ""}`.trim()],
    ["Periode", `${bulletin.periode_debut} au ${bulletin.periode_fin}`],
    ["Statut", bulletin.statut],
    [],
    ["Libelle", "Signe", "Montant"],
    ...(lignes ?? []).map((l) => [l.libelle, l.signe, String(l.montant)]),
    [],
    ["Salaire brut", "", String(bulletin.salaire_brut)],
    ["Salaire net", "", String(bulletin.salaire_net)],
  ];

  const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bulletin-${bulletinId}.csv"`,
    },
  });
}
