import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { AlertTriangle } from "lucide-react";

export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{ enseignant?: string; debut?: string; fin?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="p-6 text-sm text-gray-500">Non authentifié.</p>;
  }

  const etablissement = await getActiveEstablishment(supabase, user.id);

  if (!etablissement?.id) {
    return <p className="p-6 text-sm text-gray-500">Aucun établissement rattaché à ce compte.</p>;
  }
  const etablissementId = etablissement.id;

  // Plage de dates par défaut : 1er du mois courant → aujourd'hui
  const today = new Date();
  const defaultFin = today.toISOString().slice(0, 10);
  const defaultDebut = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const debut = params.debut ?? defaultDebut;
  const fin = params.fin ?? defaultFin;

  // Enseignants de l'établissement
  const { data: enseignants } = await supabase
    .from("enseignants")
    .select("id, nom, prenom, taux_horaire")
    .eq("etablissement_id", etablissementId)
    .order("nom");

  if (!enseignants?.length) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Aucun enseignant enregistré.</p>
      </div>
    );
  }

  const enseignantSelectionne =
    enseignants.find((e) => e.id === params.enseignant) ?? enseignants[0];

  // Pointages de l'enseignant sélectionné sur la période
  const { data: pointages } = await supabase
    .from("pointages")
    .select("id, type, horodatage, photo_path")
    .eq("etablissement_id", etablissementId)
    .eq("enseignant_id", enseignantSelectionne.id)
    .gte("horodatage", `${debut}T00:00:00`)
    .lte("horodatage", `${fin}T23:59:59`)
    .order("horodatage", { ascending: true });

  // Total d'heures via la fonction SQL
  const { data: totalHeures } = await supabase.rpc("calculer_heures_enseignant", {
    p_enseignant_id: enseignantSelectionne.id,
    p_date_debut: debut,
    p_date_fin: fin,
  });

  // URLs signées pour les miniatures (valables 1h)
  const signedUrls: (string | null)[] = await Promise.all(
    (pointages ?? []).map((p) =>
      supabase.storage
        .from("pointages-photos")
        .createSignedUrl(p.photo_path, 3600)
        .then((r) => r.data?.signedUrl ?? null)
        .catch(() => null)
    )
  );

  // Détection des jours avec arrivée sans départ correspondant
  const byDate = new Map<string, { arrivees: string[]; departs: string[] }>();
  for (const p of pointages ?? []) {
    const date = p.horodatage.slice(0, 10);
    const entry = byDate.get(date) ?? { arrivees: [], departs: [] };
    if (p.type === "arrivee") entry.arrivees.push(p.horodatage);
    else entry.departs.push(p.horodatage);
    byDate.set(date, entry);
  }
  const incompleteDays = new Set<string>();
  for (const [date, { arrivees, departs }] of Array.from(byDate.entries())) {
    for (const a of arrivees) {
      const hasPair = departs.some((d) => d > a);
      if (!hasPair) { incompleteDays.add(date); break; }
    }
  }

  const heures = Number(totalHeures ?? 0);
  const salaireEstime =
    enseignantSelectionne.taux_horaire && heures > 0
      ? Math.round(heures * enseignantSelectionne.taux_horaire)
      : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Historique des présences</h1>
        <p className="text-sm text-gray-500">Consultez et vérifiez les pointages par enseignant</p>
      </div>

      {/* ── Filtres ── */}
      <form method="GET" action="/pro/pointage/historique" className="flex flex-wrap gap-3 mb-6">
        <select
          name="enseignant"
          defaultValue={enseignantSelectionne.id}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {enseignants.map((e) => (
            <option key={e.id} value={e.id}>
              {e.prenom} {e.nom}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="debut"
          defaultValue={debut}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="date"
          name="fin"
          defaultValue={fin}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-[#007A3D] text-white text-sm font-medium hover:bg-[#006030] transition-colors"
        >
          Appliquer
        </button>
      </form>

      {/* ── Résumé ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Total heures</p>
          <p className="text-2xl font-bold text-gray-900">
            {heures.toFixed(2).replace(".", "h")
              .replace(/h(\d+)$/, (_, m) => `h${m.padStart(2, "0")}`)}
          </p>
        </div>
        {salaireEstime !== null && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 mb-1">Salaire estimé</p>
            <p className="text-2xl font-bold text-emerald-700">
              {salaireEstime.toLocaleString("fr-FR")} FCFA
            </p>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Pointages</p>
          <p className="text-2xl font-bold text-gray-900">{pointages?.length ?? 0}</p>
        </div>
      </div>

      {/* ── Avertissement jours incomplets ── */}
      {incompleteDays.size > 0 && (
        <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">
              {incompleteDays.size} jour(s) avec arrivée sans départ correspondant :
            </span>{" "}
            {Array.from(incompleteDays)
              .sort()
              .map((d) =>
                new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
              )
              .join(", ")}
            . Ces heures ne sont pas comptabilisées dans le total.
          </div>
        </div>
      )}

      {/* ── Tableau des pointages ── */}
      {!pointages?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Aucun pointage sur cette période.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-3 font-medium text-gray-500">Date</th>
                <th className="text-left p-3 font-medium text-gray-500">Heure</th>
                <th className="text-left p-3 font-medium text-gray-500">Type</th>
                <th className="text-left p-3 font-medium text-gray-500">Photo</th>
              </tr>
            </thead>
            <tbody>
              {pointages.map((p, idx) => {
                const date = p.horodatage.slice(0, 10);
                const incomplete = incompleteDays.has(date) && p.type === "arrivee";
                const dateObj = new Date(p.horodatage);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      incomplete ? "bg-amber-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="p-3 text-gray-700">
                      <span className="flex items-center gap-1.5">
                        {incomplete && (
                          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                        )}
                        {dateObj.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-900">
                      {dateObj.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          p.type === "arrivee"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {p.type === "arrivee" ? "Arrivée" : "Départ"}
                      </span>
                    </td>
                    <td className="p-3">
                      {signedUrls[idx] ? (
                        <a href={signedUrls[idx]!} target="_blank" rel="noreferrer">
                          <img
                            src={signedUrls[idx]!}
                            alt="Photo pointage"
                            className="w-12 h-10 object-cover rounded-md border border-gray-200 hover:scale-110 transition-transform"
                          />
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
