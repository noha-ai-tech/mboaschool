"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";

type Volume = { id: string; niveau: string; heures_semaine: number };
type Matiere = { id: string; nom: string; departement_disciplinaire: string; couleur: string; volumes: Volume[] };
type DeleteTarget = { kind: "matiere"; matiere: Matiere } | { kind: "volume"; matiere: Matiere; volume: Volume };

export function GestionMatieres({ initialMatieres, niveaux, departementsExistants, etablissementId }: { initialMatieres: Matiere[]; niveaux: string[]; departementsExistants: string[]; etablissementId: string }) {
  const [matieres, setMatieres] = useState(initialMatieres);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ nom: "", departement: "", couleur: "#007A3D" });
  const [addingMatiere, setAddingMatiere] = useState(false);
  const [volumeForms, setVolumeForms] = useState<Record<string, { niveau: string; heures: string }>>({});
  const [addingVolume, setAddingVolume] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function toggleExpand(id: string) { setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  async function addMatiere(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!newForm.nom.trim() || !newForm.departement.trim() || addingMatiere) return;
    setAddingMatiere(true); setError("");
    const { data, error: addError } = await supabase.from("matieres").insert({ etablissement_id: etablissementId, nom: newForm.nom.trim(), departement_disciplinaire: newForm.departement.trim(), couleur: newForm.couleur }).select("id, nom, departement_disciplinaire, couleur").single();
    setAddingMatiere(false); if (addError) { setError(addError.message); return; }
    if (data) { setMatieres((current) => [...current, { ...data, volumes: [] }]); setNewForm({ nom: "", departement: "", couleur: "#007A3D" }); setShowAddForm(false); }
  }
  async function addVolume(matiereId: string) {
    const values = volumeForms[matiereId]; if (!values?.niveau || !values.heures || Number(values.heures) < 1 || addingVolume) return;
    setAddingVolume(matiereId); setError("");
    const { data, error: volumeError } = await supabase.from("matieres_volume_horaire").upsert({ matiere_id: matiereId, niveau: values.niveau.trim(), heures_semaine: Number(values.heures) }, { onConflict: "matiere_id,niveau" }).select("id, niveau, heures_semaine").single();
    setAddingVolume(null); if (volumeError || !data) { setError(volumeError?.message || "Le volume horaire n’a pas pu être enregistré."); return; }
    setMatieres((current) => current.map((matiere) => matiere.id !== matiereId ? matiere : { ...matiere, volumes: matiere.volumes.some((volume) => volume.niveau === data.niveau) ? matiere.volumes.map((volume) => volume.niveau === data.niveau ? data : volume) : [...matiere.volumes, data] }));
    setVolumeForms((current) => ({ ...current, [matiereId]: { niveau: "", heures: "" } }));
  }
  async function confirmDelete() {
    if (!deleteTarget || deleting) return; setDeleting(true); setError("");
    const result = deleteTarget.kind === "matiere" ? await supabase.from("matieres").delete().eq("id", deleteTarget.matiere.id) : await supabase.from("matieres_volume_horaire").delete().eq("id", deleteTarget.volume.id);
    setDeleting(false); if (result.error) { setError(result.error.message); return; }
    setMatieres((current) => deleteTarget.kind === "matiere" ? current.filter((matiere) => matiere.id !== deleteTarget.matiere.id) : current.map((matiere) => matiere.id !== deleteTarget.matiere.id ? matiere : { ...matiere, volumes: matiere.volumes.filter((volume) => volume.id !== deleteTarget.volume.id) })); setDeleteTarget(null);
  }
  const groups = new Map<string, Matiere[]>();
  for (const matiere of matieres) groups.set(matiere.departement_disciplinaire, [...(groups.get(matiere.departement_disciplinaire) ?? []), matiere]);

  return <div className="space-y-5">
    <div className="flex justify-end"><SchoolAdminButton onClick={() => setShowAddForm(true)} leadingIcon={<Plus size={16} aria-hidden="true" />}>Nouvelle matière</SchoolAdminButton></div>
    {error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}
    {matieres.length === 0 ? <SchoolAdminEmptyState title="Aucune matière définie" description="Ajoutez une matière existante pour renseigner ses volumes horaires." /> : Array.from(groups.entries()).map(([department, items]) => <SchoolAdminSectionCard key={department} title={department || "Département non renseigné"} description={`${items.length} matière${items.length > 1 ? "s" : ""}`}><div className="space-y-3">{items.map((matiere) => {
      const isExpanded = expanded.has(matiere.id); const values = volumeForms[matiere.id] ?? { niveau: "", heures: "" };
      return <article key={matiere.id} className="rounded-xl border border-[var(--school-admin-border)]"><div className="flex items-center gap-3 p-4"><span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: matiere.couleur }} aria-hidden="true" /><button type="button" onClick={() => toggleExpand(matiere.id)} aria-expanded={isExpanded} className="flex min-h-10 flex-1 items-center gap-2 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">{matiere.nom}<SchoolAdminStatusBadge tone="neutral" label={`${matiere.volumes.length} volume${matiere.volumes.length !== 1 ? "s" : ""}`} />{isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button><button type="button" onClick={() => setDeleteTarget({ kind: "matiere", matiere })} aria-label={`Supprimer la matière ${matiere.nom}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Trash2 size={16} aria-hidden="true" /></button></div>{isExpanded && <div className="space-y-4 border-t border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] p-4">{matiere.volumes.length ? <ul className="space-y-2">{matiere.volumes.map((volume) => <li key={volume.id} className="flex min-h-11 items-center justify-between rounded-lg bg-[var(--school-admin-surface)] px-3 text-sm"><span><strong>{volume.niveau}</strong> · {volume.heures_semaine} h/semaine</span><button type="button" onClick={() => setDeleteTarget({ kind: "volume", matiere, volume })} aria-label={`Supprimer le volume ${volume.niveau} de ${matiere.nom}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Trash2 size={15} aria-hidden="true" /></button></li>)}</ul> : <p className="text-sm text-[var(--school-admin-text-muted)]">Aucun volume horaire renseigné.</p>}<div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"><SchoolAdminFormField id={`level-${matiere.id}`} label="Niveau">{niveaux.length ? <SchoolAdminSelect value={values.niveau} onChange={(event) => setVolumeForms((current) => ({ ...current, [matiere.id]: { ...values, niveau: event.target.value } }))}><option value="">Choisir</option>{niveaux.map((niveau) => <option key={niveau}>{niveau}</option>)}</SchoolAdminSelect> : <SchoolAdminInput value={values.niveau} onChange={(event) => setVolumeForms((current) => ({ ...current, [matiere.id]: { ...values, niveau: event.target.value } }))} />}</SchoolAdminFormField><SchoolAdminFormField id={`hours-${matiere.id}`} label="Heures/semaine"><SchoolAdminInput type="number" min="1" max="30" value={values.heures} onChange={(event) => setVolumeForms((current) => ({ ...current, [matiere.id]: { ...values, heures: event.target.value } }))} /></SchoolAdminFormField><SchoolAdminButton onClick={() => addVolume(matiere.id)} loading={addingVolume === matiere.id} disabled={!values.niveau || !values.heures} leadingIcon={<Check size={15} aria-hidden="true" />}>Enregistrer</SchoolAdminButton></div></div>}</article>;
    })}</div></SchoolAdminSectionCard>)}
    <SchoolAdminDialog open={showAddForm} onClose={() => setShowAddForm(false)} title="Nouvelle matière" description="Le département est enregistré uniquement avec la matière, selon le contrat existant."><form onSubmit={addMatiere} className="space-y-5"><SchoolAdminFormField id="subject-name" label="Nom" required><SchoolAdminInput value={newForm.nom} onChange={(event) => setNewForm({ ...newForm, nom: event.target.value })} /></SchoolAdminFormField><SchoolAdminFormField id="subject-department" label="Département disciplinaire" required><SchoolAdminInput list="subject-departments" value={newForm.departement} onChange={(event) => setNewForm({ ...newForm, departement: event.target.value })} /></SchoolAdminFormField><datalist id="subject-departments">{departementsExistants.map((item) => <option key={item} value={item} />)}</datalist><SchoolAdminFormField id="subject-color" label="Couleur d’affichage"><SchoolAdminInput type="color" value={newForm.couleur} onChange={(event) => setNewForm({ ...newForm, couleur: event.target.value })} className="w-20" /></SchoolAdminFormField><div className="flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setShowAddForm(false)}>Annuler</SchoolAdminButton><SchoolAdminButton type="submit" loading={addingMatiere}>Ajouter</SchoolAdminButton></div></form></SchoolAdminDialog>
    <SchoolAdminDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={deleteTarget?.kind === "matiere" ? "Supprimer cette matière ?" : "Supprimer ce volume horaire ?"} description="Cette action utilise la suppression existante et demande confirmation."><p className="text-sm">{deleteTarget?.matiere.nom}{deleteTarget?.kind === "volume" ? ` · ${deleteTarget.volume.niveau}` : ""}</p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setDeleteTarget(null)}>Annuler</SchoolAdminButton><SchoolAdminButton variant="danger" loading={deleting} onClick={confirmDelete}>Supprimer</SchoolAdminButton></div></SchoolAdminDialog>
  </div>;
}
