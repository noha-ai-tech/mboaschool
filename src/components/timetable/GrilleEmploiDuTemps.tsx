"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { SchoolAdminAlert, SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";

const JOURS: Record<number, string> = { 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
interface CreneauAffiche { id: string; jour_semaine: number; heure_debut: string; heure_fin: string; type: "cours" | "recreation" | "pause_dejeuner" }
interface AffectationAffichee { creneau_id: string; matiere_nom: string; matiere_couleur?: string; enseignant_nom: string; classe_nom?: string }

export function GrilleEmploiDuTemps({ creneaux, affectations, besoinsNonSatisfaits, showClasse = false }: { creneaux: CreneauAffiche[]; affectations: AffectationAffichee[]; besoinsNonSatisfaits?: { matiere_nom: string; classe_nom: string; heuresManquantes: number }[]; showClasse?: boolean }) {
  const jours = Array.from(new Set(creneaux.map((creneau) => creneau.jour_semaine))).sort();
  const heures = Array.from(new Set(creneaux.map((creneau) => creneau.heure_debut))).sort();
  const affectationParCreneau = new Map<string, AffectationAffichee[]>();
  for (const affectation of affectations) affectationParCreneau.set(affectation.creneau_id, [...(affectationParCreneau.get(affectation.creneau_id) ?? []), affectation]);
  const creneauParJourHeure = new Map(creneaux.map((creneau) => [`${creneau.jour_semaine}|${creneau.heure_debut}`, creneau]));
  if (!creneaux.length) return <SchoolAdminEmptyState title="Grille horaire indisponible" description="Configurez d’abord les contraintes de l’établissement. Aucune grille fictive n’est affichée." icon={<CalendarClock size={24} />} />;
  return <div className="space-y-5">
    {besoinsNonSatisfaits?.length ? <SchoolAdminAlert tone="warning" title={`${besoinsNonSatisfaits.length} besoin(s) non satisfait(s)`}><ul className="list-inside list-disc space-y-1">{besoinsNonSatisfaits.map((besoin, index) => <li key={index}>{besoin.classe_nom} – {besoin.matiere_nom} : {besoin.heuresManquantes} h manquante(s)</li>)}</ul></SchoolAdminAlert> : null}
    <SchoolAdminResponsiveTable label="Grille hebdomadaire de l’emploi du temps" className="hidden md:block"><table className="w-full min-w-[820px] border-collapse text-sm"><caption className="sr-only">Emploi du temps par jour et créneau horaire</caption><thead><tr><th scope="col" className="sticky left-0 z-10 w-28 border-b border-r border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] p-3 text-left">Horaire</th>{jours.map((jour) => <th scope="col" key={jour} className="min-w-44 border-b border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] p-3 text-left">{JOURS[jour]}</th>)}</tr></thead><tbody>{heures.map((heure) => <tr key={heure}><th scope="row" className="sticky left-0 z-10 border-b border-r border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-3 text-left align-top font-semibold">{heure}</th>{jours.map((jour) => <TimetableCell key={jour} creneau={creneauParJourHeure.get(`${jour}|${heure}`)} affectations={affectationParCreneau} showClasse={showClasse} />)}</tr>)}</tbody></table></SchoolAdminResponsiveTable>
    <div className="space-y-5 md:hidden" aria-label="Emploi du temps par jour">{jours.map((jour) => <section key={jour} aria-labelledby={`day-${jour}`}><h3 id={`day-${jour}`} className="mb-2 font-bold text-[var(--school-admin-text)]">{JOURS[jour]}</h3><div className="space-y-2">{heures.map((heure) => { const creneau = creneauParJourHeure.get(`${jour}|${heure}`); if (!creneau) return null; const list = affectationParCreneau.get(creneau.id) ?? []; return <article key={heure} className="rounded-xl border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="font-semibold">{creneau.heure_debut}–{creneau.heure_fin}</p>{creneau.type !== "cours" && <SchoolAdminStatusBadge tone="neutral" label={creneau.type === "recreation" ? "Récréation" : "Pause déjeuner"} />}</div>{creneau.type === "cours" ? list.length ? <div className="space-y-2">{list.map((item, index) => <Course key={index} item={item} showClasse={showClasse} />)}</div> : <p className="text-sm text-[var(--school-admin-text-soft)]">Créneau libre</p> : null}</article>; })}</div></section>)}</div>
  </div>;
}

function TimetableCell({ creneau, affectations, showClasse }: { creneau?: CreneauAffiche; affectations: Map<string, AffectationAffichee[]>; showClasse: boolean }) {
  if (!creneau) return <td className="border-b border-[var(--school-admin-border)] p-2"><span className="sr-only">Indisponible</span></td>;
  if (creneau.type !== "cours") return <td className="border-b border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] p-2 text-center text-xs text-[var(--school-admin-text-muted)]"><SchoolAdminStatusBadge tone="neutral" label={creneau.type === "recreation" ? "Récréation" : "Pause déjeuner"} /></td>;
  const list = affectations.get(creneau.id) ?? [];
  return <td className="border-b border-[var(--school-admin-border)] p-2 align-top">{list.length ? <div className="space-y-2">{list.map((item, index) => <Course key={index} item={item} showClasse={showClasse} />)}</div> : <div className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-[var(--school-admin-border-strong)] text-xs text-[var(--school-admin-text-soft)]">Créneau libre</div>}</td>;
}
function Course({ item, showClasse }: { item: AffectationAffichee; showClasse: boolean }) { return <div className="rounded-lg border-l-4 bg-[var(--school-admin-primary-soft)] p-2" style={{ borderLeftColor: item.matiere_couleur ?? "var(--school-admin-primary)" }}><p className="text-xs font-bold">{item.matiere_nom || "Matière indisponible"}</p><p className="mt-1 text-xs text-[var(--school-admin-text-muted)]">{item.enseignant_nom || "Enseignant indisponible"}</p>{showClasse && item.classe_nom ? <p className="mt-1 text-xs font-semibold text-[var(--school-admin-primary-strong)]">Classe : {item.classe_nom}</p> : null}</div>; }
