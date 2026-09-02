"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminFilterBar } from "@/components/school-admin/ui/FilterBar";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

export default function ClassesPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ name: "", level: "", teacher_name: "" });

  useEffect(() => { if (school) load(school.id); }, [school]);

  async function load(schoolId: string) {
    setLoading(true);
    const { data } = await supabase.from("classes").select("*").eq("establishment_id", schoolId).order("created_at", { ascending: false });
    if (data) setClasses(data);
    setLoading(false);
  }

  async function createClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school || saving) return;
    setSaving(true); setError("");
    const { error: createError } = await supabase.from("classes").insert({ establishment_id: school.id, name: form.name, level: form.level, teacher_name: form.teacher_name || null });
    setSaving(false);
    if (createError) { setError(createError.message); return; }
    setForm({ name: "", level: "", teacher_name: "" }); setShowForm(false); load(school.id);
  }

  async function deleteClass() {
    if (!school || !deleteTarget || deleting) return;
    setDeleting(true); setError("");
    const { error: deleteError } = await supabase.from("classes").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (deleteError) { setError(deleteError.message); return; }
    setDeleteTarget(null); load(school.id);
  }

  const levels = useMemo(() => Array.from(new Set(classes.map((item) => item.level).filter(Boolean))).sort(), [classes]);
  const filtered = levelFilter === "all" ? classes : classes.filter((item) => item.level === levelFilter);
  const assignedCount = classes.filter((item) => Boolean(item.teacher_name)).length;
  const knownEnrollment = classes.filter((item) => typeof item.effectif === "number");
  const totalEnrollment = knownEnrollment.reduce((total, item) => total + item.effectif, 0);

  if (schoolLoading) return <SchoolAdminLoadingState label="Chargement des classes" />;
  if (!school) return <SchoolAdminEmptyState title="Aucun établissement actif" description="Sélectionnez un établissement avant de consulter les classes." icon={<GraduationCap size={24} />} />;
  const href = (path: string) => withEstablishmentQuery(path, school.id);

  return <div className="mx-auto max-w-7xl">
    <SchoolAdminPageHeader eyebrow="Gestion scolaire" title="Classes" description="Consultez les classes existantes et créez uniquement les groupes réellement utilisés par l’établissement." actions={<SchoolAdminButton onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} aria-hidden="true" />}>Nouvelle classe</SchoolAdminButton>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SchoolAdminStatCard label="Classes" value={classes.length} icon={<GraduationCap size={19} />} />
      <SchoolAdminStatCard label="Niveaux représentés" value={levels.length} icon={<GraduationCap size={19} />} tone="neutral" />
      <SchoolAdminStatCard label="Enseignant renseigné" value={assignedCount} icon={<Users size={19} />} />
      <SchoolAdminStatCard label="Effectif connu" value={knownEnrollment.length ? totalEnrollment : "Indisponible"} icon={<Users size={19} />} tone="neutral" detail={knownEnrollment.length ? `${knownEnrollment.length} classe${knownEnrollment.length !== 1 ? "s" : ""} avec effectif` : "Aucune donnée d’effectif fournie"} />
    </div>
    {error && <div className="mb-5"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div>}
    <SchoolAdminFilterBar className="mb-5"><SchoolAdminSelect value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} aria-label="Filtrer les classes par niveau" className="sm:w-64"><option value="all">Tous les niveaux</option>{levels.map((level) => <option key={level} value={level}>{level}</option>)}</SchoolAdminSelect></SchoolAdminFilterBar>

    {loading ? <SchoolAdminLoadingState label="Chargement de la liste des classes" /> : filtered.length === 0 ? <SchoolAdminEmptyState title={classes.length ? "Aucune classe pour ce filtre" : "Aucune classe créée"} description={classes.length ? "Choisissez un autre niveau." : "Créez une première classe pour commencer."} icon={<GraduationCap size={24} />} /> : <>
      <SchoolAdminResponsiveTable label="Liste des classes" className="hidden md:block"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]"><tr><th scope="col" className="px-5 py-3">Classe</th><th scope="col" className="px-5 py-3">Niveau</th><th scope="col" className="px-5 py-3">Section</th><th scope="col" className="px-5 py-3">Enseignant</th><th scope="col" className="px-5 py-3">Effectif</th><th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-[var(--school-admin-border)]">{filtered.map((item) => <tr key={item.id} className="hover:bg-[var(--school-admin-surface-muted)]"><th scope="row" className="px-5 py-4 font-semibold text-[var(--school-admin-text)]">{item.name}</th><td className="px-5 py-4"><SchoolAdminStatusBadge tone="info" label={item.level || "Non renseigné"} /></td><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{item.section || "Non renseignée"}</td><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{item.teacher_name || "Non assigné"}</td><td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{typeof item.effectif === "number" ? item.effectif : "Indisponible"}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Link href={href(`/dashboard/ecole/classes/${item.id}`)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-[var(--school-admin-primary)] hover:bg-[var(--school-admin-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter</Link><button type="button" onClick={() => setDeleteTarget(item)} aria-label={`Supprimer la classe ${item.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:bg-[var(--school-admin-danger-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>)}</tbody></table></SchoolAdminResponsiveTable>
      <div className="space-y-3 md:hidden" aria-label="Liste des classes">{filtered.map((item) => <article key={item.id} className="rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4 shadow-[var(--school-admin-shadow-sm)]"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-[var(--school-admin-text)]">{item.name}</h2><p className="mt-1 text-xs text-[var(--school-admin-text-muted)]">{item.teacher_name || "Enseignant non assigné"}</p></div><SchoolAdminStatusBadge tone="info" label={item.level || "Niveau non renseigné"} /></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--school-admin-border)] pt-3 text-xs"><div><dt className="text-[var(--school-admin-text-soft)]">Section</dt><dd className="mt-1 font-medium">{item.section || "Non renseignée"}</dd></div><div><dt className="text-[var(--school-admin-text-soft)]">Effectif</dt><dd className="mt-1 font-medium">{typeof item.effectif === "number" ? item.effectif : "Indisponible"}</dd></div></dl><div className="mt-4 flex items-center justify-between"><Link href={href(`/dashboard/ecole/classes/${item.id}`)} className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Consulter la classe</Link><button type="button" onClick={() => setDeleteTarget(item)} aria-label={`Supprimer la classe ${item.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Trash2 size={15} aria-hidden="true" /></button></div></article>)}</div>
    </>}

    <SchoolAdminDialog open={showForm} onClose={() => setShowForm(false)} title="Nouvelle classe" description="Renseignez les informations disponibles sans créer d’affectation implicite."><form onSubmit={createClass} className="space-y-5"><SchoolAdminFormField id="class-name" label="Nom" required><SchoolAdminInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="ex. CM2 A" /></SchoolAdminFormField><SchoolAdminFormField id="class-level" label="Niveau" required><SchoolAdminInput value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} placeholder="ex. Primaire" /></SchoolAdminFormField><SchoolAdminFormField id="class-teacher" label="Enseignant" description="Facultatif : utilisez uniquement un nom déjà connu."><SchoolAdminInput value={form.teacher_name} onChange={(event) => setForm({ ...form, teacher_name: event.target.value })} placeholder="Nom de l’enseignant" /></SchoolAdminFormField><div className="flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setShowForm(false)}>Annuler</SchoolAdminButton><SchoolAdminButton type="submit" loading={saving} leadingIcon={<Plus size={15} aria-hidden="true" />}>Créer la classe</SchoolAdminButton></div></form></SchoolAdminDialog>
    <SchoolAdminDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Supprimer cette classe ?" description="Cette action utilise la suppression existante et peut affecter les relations déjà rattachées à la classe."><p className="text-sm text-[var(--school-admin-text-muted)]">Classe concernée : <strong className="text-[var(--school-admin-text)]">{deleteTarget?.name}</strong></p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setDeleteTarget(null)}>Annuler</SchoolAdminButton><SchoolAdminButton variant="danger" loading={deleting} onClick={deleteClass} leadingIcon={<Trash2 size={15} aria-hidden="true" />}>Supprimer</SchoolAdminButton></div></SchoolAdminDialog>
  </div>;
}
