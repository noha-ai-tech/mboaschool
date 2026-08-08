import { redirect } from "next/navigation";
import { AlertTriangle, Globe, BookOpen, MessageSquare, CalendarDays, FileText, User, Bell, Wallet, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SelecteurEtablissement } from "@/components/enseignant/SelecteurEtablissement";

export default async function MonEspacePage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string; fin?: string; eid?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  // Toutes les lignes enseignants liées à ce compte (multi-établissement possible)
  const { data: enseignants } = await supabase
    .from("enseignants")
    .select("id, nom, prenom, taux_horaire, etablissement_id, establishments(name)")
    .eq("user_id", user.id);

  if (!enseignants?.length) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Aucune fiche enseignant liée à ce compte.{" "}
        <a href="/auth/connexion" className="text-emerald-700 underline">
          Se reconnecter
        </a>
      </div>
    );
  }

  // Sélection de la ligne active selon le param ?eid= (fallback : première ligne)
  const enseignant =
    (params.eid
      ? enseignants.find((e) => e.id === params.eid)
      : null) ?? enseignants[0];

  const multiEtab = enseignants.length > 1;

  // Plage par défaut : semaine courante
  const today = new Date();
  const defaultFin = today.toISOString().slice(0, 10);
  const lundi = new Date(today);
  lundi.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const defaultDebut = lundi.toISOString().slice(0, 10);

  const debut = params.debut ?? defaultDebut;
  const fin   = params.fin   ?? defaultFin;

  // Heures via RPC — p_etablissement_id assure que seul cet établissement est compté
  const { data: totalHeures } = await supabase.rpc("calculer_heures_enseignant", {
    p_enseignant_id:    enseignant.id,
    p_date_debut:       debut,
    p_date_fin:         fin,
    p_etablissement_id: enseignant.etablissement_id,
  });

  const debutMois = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const { data: heuresMois } = await supabase.rpc("calculer_heures_enseignant", {
    p_enseignant_id:    enseignant.id,
    p_date_debut:       debutMois,
    p_date_fin:         defaultFin,
    p_etablissement_id: enseignant.etablissement_id,
  });

  // Pointages — filtrés par établissement sélectionné
  const { data: pointages } = await supabase
    .from("pointages")
    .select("id, type, horodatage, photo_path")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id)
    .gte("horodatage", `${debut}T00:00:00`)
    .lte("horodatage", `${fin}T23:59:59`)
    .order("horodatage", { ascending: true });

  // Messages — filtrés par établissement sélectionné (RLS fait aussi le filtrage)
  const { data: messages } = await supabase
    .from("messages")
    .select("id, canal, departement_disciplinaire, titre, contenu, created_at")
    .eq("etablissement_id", enseignant.etablissement_id)
    .order("created_at", { ascending: false })
    .limit(30);

  // Mon emploi du temps (Phase 7, Mission 04) — nécessite la policy
  // edt_self_read (migration 0009_pro_hr_foundation.sql, non exécutée).
  // Tableau vide sans erreur bloquante tant qu'elle n'est pas appliquée.
  const { data: edt } = await supabase
    .from("emplois_du_temps")
    .select("id, classe_id, matiere_id, classes(name), matieres(nom), creneaux_horaires(jour_semaine, heure_debut, heure_fin)")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id);

  const mesClasses = Array.from(
    new Map<string, string>(
      (edt ?? [])
        .map((e: any): [string, string] => [e.classe_id, e.classes?.name])
        .filter(([, name]) => name)
    ).entries()
  );

  // Mes documents (Phase 7) — via la fiche staff_members liée, si elle
  // existe (migration 0009). Vide sans erreur tant que non exécutée.
  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id")
    .eq("enseignant_id", enseignant.id)
    .maybeSingle();

  const { data: mesDocuments } = staffMember
    ? await supabase
        .from("staff_documents")
        .select("id, category, file_name")
        .eq("staff_member_id", staffMember.id)
        .order("uploaded_at", { ascending: false })
    : { data: [] as any[] };

  // Rapprochement heures prévues / effectuées (Mission 05, Phase 7) — via la
  // vue vue_heures_realisees (migration 0010_timetable_engine.sql, non
  // exécutée). Vide sans erreur tant que non exécutée.
  const { data: heuresRealisees } = await supabase
    .from("vue_heures_realisees")
    .select("heures_prevues, heures_effectuees, annule, en_retard, heures_supplementaires")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id);

  const sommeHeuresPrevues = (heuresRealisees ?? []).reduce((s: number, h: any) => s + (h.heures_prevues ?? 0), 0);
  const sommeHeuresEffectuees = (heuresRealisees ?? []).reduce((s: number, h: any) => s + (h.heures_effectuees ?? 0), 0);
  const nbAnnules = (heuresRealisees ?? []).filter((h: any) => h.annule).length;
  const nbRetards = (heuresRealisees ?? []).filter((h: any) => h.en_retard).length;
  const sommeHeuresSup = (heuresRealisees ?? []).reduce((s: number, h: any) => s + (h.heures_supplementaires ?? 0), 0);

  // Mon salaire (Mission 06, Phase 8) — uniquement les bulletins publiés
  // (statut='paie_validee'), via la fiche staff_members déjà résolue plus
  // haut. RLS (bulletins_self_read, migration 0011) filtre déjà par
  // statut, cette condition explicite est une défense en profondeur.
  const { data: mesBulletins } = staffMember
    ? await supabase
        .from("bulletins_paie")
        .select("id, periode_debut, periode_fin, salaire_net, statut")
        .eq("staff_member_id", staffMember.id)
        .eq("statut", "paie_validee")
        .order("periode_debut", { ascending: false })
    : { data: [] as any[] };

  // URLs signées pour les miniatures
  const signedUrls: (string | null)[] = await Promise.all(
    (pointages ?? []).map((p) =>
      supabase.storage
        .from("pointages-photos")
        .createSignedUrl(p.photo_path, 3600)
        .then((r) => r.data?.signedUrl ?? null)
        .catch(() => null)
    )
  );

  // Détection des jours incomplets (arrivée sans départ)
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
      if (!departs.some((d) => d > a)) { incompleteDays.add(date); break; }
    }
  }

  const heures = Number(totalHeures ?? 0);
  const heuresMoisVal = Number(heuresMois ?? 0);
  const salaireSemaine =
    enseignant.taux_horaire && heures > 0
      ? Math.round(heures * enseignant.taux_horaire)
      : null;
  const salaireMois =
    enseignant.taux_horaire && heuresMoisVal > 0
      ? Math.round(heuresMoisVal * enseignant.taux_horaire)
      : null;

  function formatH(h: number) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}h${mm.toString().padStart(2, "0")}`;
  }

  // Options pour le sélecteur d'établissement
  const optionsSelecteur = enseignants.map((e) => ({
    enseignantId: e.id,
    nomEtablissement:
      (e.establishments as unknown as { name: string } | null)?.name ??
      `Établissement ${e.etablissement_id.slice(0, 8)}`,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Aujourd&apos;hui
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {enseignant.prenom} {enseignant.nom}
        </p>
      </div>

      {/* Navigation (Mission 04, Phase 7) — ancrages vers les sections de
          cette même page ; Documents/Profil/Notifications restent des
          emplacements architecturaux tant qu'aucune interface dédiée
          n'existe (voir docs/pro/01_ARCHITECTURE.md). */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
        {[
          { href: "#salaire", label: "Mon salaire" },
          { href: "#horaire", label: "Mon emploi du temps" },
          { href: "#classes", label: "Mes classes" },
          { href: "#presences", label: "Mes présences" },
          { href: "#heures", label: "Mes heures" },
          { href: "#documents", label: "Mes documents" },
          { href: "#profil", label: "Mon profil" },
          { href: "#notifications", label: "Mes notifications" },
        ].map((t) => (
          <a
            key={t.href}
            href={t.href}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Sélecteur d'établissement — visible seulement si multi-établissement */}
      {multiEtab && (
        <SelecteurEtablissement
          etablissements={optionsSelecteur}
          selectedEnseignantId={enseignant.id}
          debut={debut}
          fin={fin}
        />
      )}

      {/* Résumé rapide */}
      <div id="heures" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">Cette semaine</p>
          <p className="text-3xl font-black text-gray-900 tracking-tight">{formatH(heures)}</p>
          {salaireSemaine !== null && (
            <p className="text-xs text-emerald-700 font-medium mt-1">
              {salaireSemaine.toLocaleString("fr-FR")} FCFA
            </p>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">Ce mois</p>
          <p className="text-3xl font-black text-gray-900 tracking-tight">{formatH(heuresMoisVal)}</p>
          {salaireMois !== null && (
            <p className="text-xs text-emerald-700 font-medium mt-1">
              {salaireMois.toLocaleString("fr-FR")} FCFA
            </p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">Pointages</p>
          <p className="text-3xl font-black text-gray-900 tracking-tight">{pointages?.length ?? 0}</p>
        </div>
        {enseignant.taux_horaire && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">Taux horaire</p>
            <p className="text-xl font-black text-gray-900 tracking-tight">
              {Number(enseignant.taux_horaire).toLocaleString("fr-FR")}
              <span className="text-sm font-medium text-gray-400"> FCFA</span>
            </p>
          </div>
        )}
      </div>

      {/* Prévu vs réalisé (Mission 05, Phase 7) */}
      {heuresRealisees && heuresRealisees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <MiniStat label="Heures prévues" value={`${sommeHeuresPrevues.toFixed(1)}h`} />
          <MiniStat label="Heures effectuées" value={`${sommeHeuresEffectuees.toFixed(1)}h`} />
          <MiniStat label="Annulés" value={String(nbAnnules)} />
          <MiniStat label="Retards" value={String(nbRetards)} />
          <MiniStat label="Heures sup." value={`${sommeHeuresSup.toFixed(1)}h`} />
        </div>
      )}

      {/* Filtre période */}
      <form method="GET" className="flex flex-wrap gap-2 mb-5 items-center">
        {/* Préserve l'établissement sélectionné lors du changement de période */}
        <input type="hidden" name="eid" value={enseignant.id} />
        <span className="text-sm text-gray-500 font-medium">Période :</span>
        <input
          type="date"
          name="debut"
          defaultValue={debut}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="text-gray-400 text-sm">→</span>
        <input
          type="date"
          name="fin"
          defaultValue={fin}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg bg-[#007A3D] text-white text-sm font-medium"
        >
          Appliquer
        </button>
      </form>

      {/* Avertissement jours incomplets */}
      {incompleteDays.size > 0 && (
        <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">
              {incompleteDays.size} arrivée(s) sans départ correspondant :
            </span>{" "}
            {Array.from(incompleteDays)
              .sort()
              .map((d) =>
                new Date(d).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                })
              )
              .join(", ")}
            . Ces heures ne sont pas comptabilisées. Signalez l&apos;oubli au directeur.
          </div>
        </div>
      )}

      {/* Mon salaire (Mission 06, Phase 8) */}
      <div id="salaire" className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">Mon salaire</h2>
        </div>
        {!mesBulletins?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            Aucun bulletin de paie publié pour l&apos;instant.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {mesBulletins.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-gray-600">
                  {new Date(b.periode_debut).toLocaleDateString("fr-FR")} – {new Date(b.periode_fin).toLocaleDateString("fr-FR")}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-gray-900">{Number(b.salaire_net).toLocaleString("fr-FR")} FCFA</span>
                  <a href={`/api/payroll/${b.id}/export`} className="text-gray-400 hover:text-gray-700" aria-label="Télécharger le bulletin (CSV)">
                    <Download size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mon emploi du temps (Phase 7) */}
      <div id="horaire" className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">Mon emploi du temps</h2>
        </div>
        {!edt?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            Aucun créneau assigné pour l&apos;instant.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {edt.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold text-gray-900">{e.matieres?.nom ?? "—"}</span>
                <span className="text-gray-400">{e.classes?.name ?? "—"}</span>
                {e.creneaux_horaires && (
                  <span className="text-xs text-gray-400">
                    {e.creneaux_horaires.heure_debut}–{e.creneaux_horaires.heure_fin}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mes classes (Phase 7) — dérivé de l'emploi du temps ci-dessus */}
      <div id="classes" className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">Mes classes</h2>
        </div>
        {mesClasses.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune classe assignée pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mesClasses.map(([id, name]) => (
              <span key={id} className="text-xs font-semibold bg-white border border-gray-200 rounded-full px-3 py-1.5">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tableau des pointages */}
      <div id="presences" />
      {!pointages?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          Aucun pointage sur cette période.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Date</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Heure</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Type</th>
                <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-gray-400">Photo</th>
              </tr>
            </thead>
            <tbody>
              {pointages.map((p, idx) => {
                const date = p.horodatage.slice(0, 10);
                const incomplete = incompleteDays.has(date) && p.type === "arrivee";
                const d = new Date(p.horodatage);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      incomplete ? "bg-amber-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="p-3">
                      <span className="flex items-center gap-1.5 text-gray-700 font-medium">
                        {incomplete && (
                          <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                        )}
                        {d.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-semibold text-gray-900">
                      {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          p.type === "arrivee"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.type === "arrivee" ? "bg-emerald-500" : "bg-orange-500"
                          }`}
                        />
                        {p.type === "arrivee" ? "Arrivée" : "Départ"}
                      </span>
                    </td>
                    <td className="p-3">
                      {signedUrls[idx] ? (
                        <a href={signedUrls[idx]!} target="_blank" rel="noreferrer">
                          <img
                            src={signedUrls[idx]!}
                            alt="Photo"
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

      {/* ── Section Messages ── */}
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">
            Messages de la direction
          </h2>
        </div>

        {!messages?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            Aucun message reçu pour l&apos;instant.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <article
                key={m.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  {m.canal === "global" ? (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold shrink-0">
                      <Globe size={10} />
                      Global
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold shrink-0">
                      <BookOpen size={10} className="shrink-0" />
                      {m.departement_disciplinaire}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-sm">{m.titre}</p>
                      <time className="text-xs text-gray-400 shrink-0">
                        {new Date(m.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {m.contenu}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Mes documents (Phase 7) — via la fiche staff_members liée */}
      <div id="documents" className="mt-12">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">Mes documents</h2>
        </div>
        {!mesDocuments?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            Aucun document partagé pour l&apos;instant.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
            {mesDocuments.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                <FileText size={13} className="text-gray-300 shrink-0" />
                {d.file_name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mon profil / Mes notifications (Phase 7) — architecture uniquement,
          aucune interface d'édition ni système de notification réel connecté. */}
      <div className="grid sm:grid-cols-2 gap-4 mt-12">
        <div id="profil" className="rounded-xl border border-dashed border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <User size={16} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-400">Mon profil</p>
          </div>
          <p className="text-xs text-gray-400">Modification du profil — bientôt disponible.</p>
        </div>
        <div id="notifications" className="rounded-xl border border-dashed border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-400">Mes notifications</p>
          </div>
          <p className="text-xs text-gray-400">Centre de notifications — bientôt disponible.</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <p className="text-lg font-black text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}
