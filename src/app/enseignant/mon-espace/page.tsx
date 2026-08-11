import { redirect } from "next/navigation";
import { AlertTriangle, Globe, BookOpen, MessageSquare, CalendarDays, FileText, Wallet, Download, ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SelecteurEtablissement } from "@/components/enseignant/SelecteurEtablissement";

const JOUR_SEMAINE_AUJOURDHUI = new Date().getDay(); // 0=dimanche…6=samedi, correspond à creneaux_horaires.jour_semaine (1=lundi..6=samedi)

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
      <div className="p-8 text-center text-sm text-text-secondary">
        Aucune fiche enseignant liée à ce compte.{" "}
        <a href="/auth/connexion" className="text-primary underline">
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
  const todayStr = today.toISOString().slice(0, 10);
  const defaultFin = todayStr;
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

  // Pointages — filtrés par établissement sélectionné et par période choisie
  const { data: pointages } = await supabase
    .from("pointages")
    .select("id, type, horodatage, photo_path")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id)
    .gte("horodatage", `${debut}T00:00:00`)
    .lte("horodatage", `${fin}T23:59:59`)
    .order("horodatage", { ascending: true });

  // Pointages du jour — requête dédiée, indépendante du filtre de période
  // ci-dessus, pour que la carte "Présence" reflète toujours aujourd'hui.
  const { data: pointagesJour } = await supabase
    .from("pointages")
    .select("type, horodatage")
    .eq("enseignant_id", enseignant.id)
    .eq("etablissement_id", enseignant.etablissement_id)
    .gte("horodatage", `${todayStr}T00:00:00`)
    .lte("horodatage", `${todayStr}T23:59:59`)
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

  // Cours du jour, triés par heure — dérivé de l'emploi du temps ci-dessus,
  // aucune nouvelle requête. jour_semaine (1=lundi..6=samedi) correspond
  // directement à Date.getDay() (0=dimanche..6=samedi).
  const coursDuJour: any[] = ((edt ?? []) as any[])
    .filter((e: any) => e.creneaux_horaires?.jour_semaine === JOUR_SEMAINE_AUJOURDHUI)
    .sort((a: any, b: any) => (a.creneaux_horaires?.heure_debut ?? "").localeCompare(b.creneaux_horaires?.heure_debut ?? ""));

  const nowHHMM = today.toTimeString().slice(0, 5);
  const prochainCours = coursDuJour.find((e: any) => (e.creneaux_horaires?.heure_fin ?? "") > nowHHMM);

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

  // Statut de présence du jour — dérivé de pointagesJour uniquement.
  const arriveeJour = (pointagesJour ?? []).find((p) => p.type === "arrivee");
  const departJour = [...(pointagesJour ?? [])].reverse().find((p) => p.type === "depart");
  const presenceStatut: "non_pointe" | "present" | "depart" =
    !arriveeJour ? "non_pointe" : departJour ? "depart" : "present";

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
  function formatHeure(iso: string) {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  // Options pour le sélecteur d'établissement
  const optionsSelecteur = enseignants.map((e) => ({
    enseignantId: e.id,
    nomEtablissement:
      (e.establishments as unknown as { name: string } | null)?.name ??
      `Établissement ${e.etablissement_id.slice(0, 8)}`,
  }));

  const etablissementNom = (enseignant.establishments as unknown as { name: string } | null)?.name ?? null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Identité compacte + date */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-text-primary">{enseignant.prenom} {enseignant.nom}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {etablissementNom ? `Enseignant·e · ${etablissementNom}` : "Enseignant·e"}
        </p>
        <p className="text-xs text-text-secondary mt-2 capitalize">
          {today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {multiEtab && (
        <div className="mb-6">
          <SelecteurEtablissement
            etablissements={optionsSelecteur}
            selectedEnseignantId={enseignant.id}
            debut={debut}
            fin={fin}
          />
        </div>
      )}

      {/* Jours incomplets — seule alerte réelle, affichée uniquement si elle existe */}
      {incompleteDays.size > 0 && (
        <div className="mb-6 flex gap-3 rounded-card border border-warning/30 bg-amber-50 p-3.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">
              {incompleteDays.size} arrivée{incompleteDays.size !== 1 ? "s" : ""} sans départ correspondant :
            </span>{" "}
            {Array.from(incompleteDays)
              .sort()
              .map((d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }))
              .join(", ")}
            . Ces heures ne sont pas comptabilisées. Signalez l&apos;oubli au directeur.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 mb-6">
        {/* Prochain cours — bloc dominant */}
        <div className="bg-white border border-border rounded-card p-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-4">Prochain cours</p>
          {prochainCours ? (
            <>
              <p className="text-3xl font-extrabold text-text-primary tracking-tight">
                {prochainCours.creneaux_horaires?.heure_debut}–{prochainCours.creneaux_horaires?.heure_fin}
              </p>
              <p className="text-xl font-bold text-text-primary mt-2">{prochainCours.matieres?.nom ?? "—"}</p>
              <p className="text-sm text-text-secondary mt-1">{prochainCours.classes?.name ?? "—"}</p>
              <a href="#horaire" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base mt-4">
                Voir mon emploi du temps
                <ArrowRight size={13} />
              </a>
            </>
          ) : (
            <p className="text-sm text-text-secondary py-4">Aucun autre cours prévu aujourd&apos;hui.</p>
          )}
        </div>

        {/* Présence */}
        <div className="bg-white border border-border rounded-card p-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-4">Présence</p>
          {presenceStatut === "non_pointe" && (
            <p className="text-lg font-bold text-text-secondary">Non pointé</p>
          )}
          {presenceStatut === "present" && arriveeJour && (
            <>
              <p className="text-lg font-bold text-primary flex items-center gap-1.5">
                <CheckCircle2 size={16} /> Présent
              </p>
              <p className="text-sm text-text-secondary mt-1">Arrivée : {formatHeure(arriveeJour.horodatage)}</p>
            </>
          )}
          {presenceStatut === "depart" && arriveeJour && departJour && (
            <>
              <p className="text-lg font-bold text-text-primary">Départ enregistré</p>
              <p className="text-sm text-text-secondary mt-1">
                Arrivée : {formatHeure(arriveeJour.horodatage)} · Départ : {formatHeure(departJour.horodatage)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Ma journée */}
      <div className="bg-white border border-border rounded-card p-6 mb-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-4">Ma journée</p>
        {coursDuJour.length === 0 ? (
          <p className="text-sm text-text-secondary">Aucun cours prévu aujourd&apos;hui.</p>
        ) : (
          <div className="space-y-3">
            {coursDuJour.map((e: any) => (
              <div key={e.id} className="flex items-center gap-4 text-sm">
                <span className="font-mono font-semibold text-text-primary w-12 shrink-0">{e.creneaux_horaires?.heure_debut}</span>
                <span className="font-semibold text-text-primary">{e.matieres?.nom ?? "—"}</span>
                <span className="text-text-secondary">{e.classes?.name ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-6">
        {/* Mes heures */}
        <div id="heures" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
          <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-4">Mes heures</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-extrabold text-text-primary">{formatH(heures)}</p>
              <p className="text-xs text-text-secondary mt-0.5">Cette semaine</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-text-primary">{formatH(heuresMoisVal)}</p>
              <p className="text-xs text-text-secondary mt-0.5">Ce mois</p>
            </div>
          </div>
          {heuresRealisees && heuresRealisees.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
              <MiniStat label="Prévues" value={`${sommeHeuresPrevues.toFixed(1)}h`} />
              <MiniStat label="Effectuées" value={`${sommeHeuresEffectuees.toFixed(1)}h`} />
              <MiniStat label="Heures sup." value={`${sommeHeuresSup.toFixed(1)}h`} />
            </div>
          )}
        </div>

        {/* Mon salaire */}
        <div id="salaire" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={14} className="text-text-secondary" />
            <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Mon salaire</p>
          </div>
          {!mesBulletins?.length ? (
            <p className="text-sm text-text-secondary">Aucun bulletin de paie publié pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2.5">
              {mesBulletins.slice(0, 3).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">
                    {new Date(b.periode_debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – {new Date(b.periode_fin).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-text-primary">{Number(b.salaire_net).toLocaleString("fr-FR")} FCFA</span>
                    <a href={`/api/payroll/${b.id}/export`} className="text-text-secondary hover:text-text-primary" aria-label="Télécharger le bulletin (CSV)">
                      <Download size={13} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions — 3 maximum */}
      <div className="flex flex-wrap gap-2 mb-8">
        <a href="#horaire" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card border border-border text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors duration-base">
          <CalendarDays size={13} /> Voir emploi du temps
        </a>
        <a href="#presences" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card border border-border text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors duration-base">
          <Clock3 size={13} /> Voir présences
        </a>
        <a href="#salaire" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card border border-border text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors duration-base">
          <Wallet size={13} /> Voir salaire
        </a>
      </div>

      {/* Filtre période (pointages détaillés ci-dessous) */}
      <form method="GET" className="flex flex-wrap gap-2 mb-5 items-center">
        <input type="hidden" name="eid" value={enseignant.id} />
        <span className="text-sm text-text-secondary font-medium">Période :</span>
        <input
          type="date"
          name="debut"
          defaultValue={debut}
          className="rounded-[10px] border border-border px-3 py-1.5 text-sm bg-white outline-none focus:border-primary transition-colors duration-base"
        />
        <span className="text-text-secondary text-sm">→</span>
        <input
          type="date"
          name="fin"
          defaultValue={fin}
          className="rounded-[10px] border border-border px-3 py-1.5 text-sm bg-white outline-none focus:border-primary transition-colors duration-base"
        />
        <button type="submit" className="px-4 py-1.5 rounded-[10px] bg-primary text-white text-sm font-medium">
          Appliquer
        </button>
      </form>

      {/* Mon emploi du temps (liste complète) */}
      <div id="horaire" className="mb-8 scroll-mt-20">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={14} className="text-text-secondary" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Mon emploi du temps</h2>
        </div>
        {!edt?.length ? (
          <div className="rounded-card border border-border bg-white p-8 text-center text-sm text-text-secondary">
            Aucun créneau assigné pour l&apos;instant.
          </div>
        ) : (
          <div className="rounded-card border border-border bg-white overflow-hidden divide-y divide-border">
            {edt.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold text-text-primary">{e.matieres?.nom ?? "—"}</span>
                <span className="text-text-secondary">{e.classes?.name ?? "—"}</span>
                {e.creneaux_horaires && (
                  <span className="text-xs text-text-secondary">
                    {e.creneaux_horaires.heure_debut}–{e.creneaux_horaires.heure_fin}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mes classes */}
      <div id="classes" className="mb-8 scroll-mt-20">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Mes classes</h2>
        </div>
        {mesClasses.length === 0 ? (
          <p className="text-sm text-text-secondary">Aucune classe assignée pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mesClasses.map(([id, name]) => (
              <span key={id} className="text-xs font-semibold bg-white border border-border rounded-full px-3 py-1.5">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Historique des pointages */}
      <div id="presences" className="mb-8 scroll-mt-20">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Mes présences</h2>
        </div>
        {!pointages?.length ? (
          <div className="rounded-card border border-border bg-white p-10 text-center text-sm text-text-secondary">
            Aucun pointage sur cette période.
          </div>
        ) : (
          <div className="rounded-card border border-border bg-white overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-text-secondary">Date</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-text-secondary">Heure</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-text-secondary">Type</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-widest uppercase text-text-secondary">Photo</th>
                </tr>
              </thead>
              <tbody>
                {pointages.map((p, idx) => {
                  const date = p.horodatage.slice(0, 10);
                  const incomplete = incompleteDays.has(date) && p.type === "arrivee";
                  const d = new Date(p.horodatage);
                  return (
                    <tr key={p.id} className={`border-b border-border last:border-0 ${incomplete ? "bg-amber-50" : "hover:bg-muted/60"}`}>
                      <td className="p-3">
                        <span className="flex items-center gap-1.5 text-text-primary font-medium">
                          {incomplete && <AlertTriangle size={12} className="text-warning shrink-0" />}
                          {d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-semibold text-text-primary">{formatHeure(p.horodatage)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${p.type === "arrivee" ? "bg-primary-light text-primary" : "bg-orange-100 text-orange-700"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.type === "arrivee" ? "bg-primary" : "bg-orange-500"}`} />
                          {p.type === "arrivee" ? "Arrivée" : "Départ"}
                        </span>
                      </td>
                      <td className="p-3">
                        {signedUrls[idx] ? (
                          <a href={signedUrls[idx]!} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={signedUrls[idx]!} alt="Photo" className="w-12 h-10 object-cover rounded-md border border-border hover:scale-110 transition-transform duration-base" />
                          </a>
                        ) : (
                          <span className="text-text-secondary/50 text-xs">—</span>
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

      {/* Messages de la direction */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={14} className="text-text-secondary" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Messages de la direction</h2>
        </div>
        {!messages?.length ? (
          <div className="rounded-card border border-border bg-white p-10 text-center text-sm text-text-secondary">
            Aucun message reçu pour l&apos;instant.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <article key={m.id} className="rounded-card border border-border bg-white p-5">
                <div className="flex items-start gap-3">
                  {m.canal === "global" ? (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold shrink-0">
                      <Globe size={10} /> Global
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold shrink-0">
                      <BookOpen size={10} className="shrink-0" /> {m.departement_disciplinaire}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="font-semibold text-text-primary text-sm">{m.titre}</p>
                      <time className="text-xs text-text-secondary shrink-0">
                        {new Date(m.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      </time>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{m.contenu}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Mes documents */}
      <div id="documents" className="scroll-mt-20">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={14} className="text-text-secondary" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Mes documents</h2>
        </div>
        {!mesDocuments?.length ? (
          <div className="rounded-card border border-border bg-white p-8 text-center text-sm text-text-secondary">
            Aucun document partagé pour l&apos;instant.
          </div>
        ) : (
          <div className="rounded-card border border-border bg-white overflow-hidden divide-y divide-border">
            {mesDocuments.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                <FileText size={13} className="text-text-secondary/50 shrink-0" />
                {d.file_name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-black text-text-primary">{value}</p>
      <p className="text-[10px] text-text-secondary font-semibold mt-0.5">{label}</p>
    </div>
  );
}
