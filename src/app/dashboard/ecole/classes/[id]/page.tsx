"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Bell, GraduationCap, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect, SchoolAdminTextarea } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

const POST_TYPES = [{ value: "announcement", label: "Annonce" }, { value: "homework", label: "Devoir" }, { value: "event", label: "Événement" }, { value: "reminder", label: "Rappel" }];

export default function ClassDetailPage() {
  const classId = useParams().id as string;
  const { school } = useSchool();
  const [classe, setClasse] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", content: "", type: "announcement" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: classData } = await supabase.from("classes").select("*").eq("id", classId).single();
    const { data: postsData } = await supabase.from("school_announcements").select("*").eq("establishment_id", classData?.establishment_id ?? "").eq("class_id", classId).order("created_at", { ascending: false });
    if (classData) setClasse(classData);
    if (postsData) setPosts(postsData);
    setLoading(false);
  }, [classId]);
  useEffect(() => { load(); }, [load]);
  async function createPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classe || saving) return;
    setSaving(true); setError("");
    const { error: createError } = await supabase.from("school_announcements").insert({ establishment_id: classe.establishment_id, class_id: classId, type: form.type, title: form.title, content: form.content });
    setSaving(false);
    if (createError) { setError(createError.message); return; }
    setForm({ title: "", content: "", type: "announcement" }); setShowForm(false); load();
  }
  async function deletePost() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setError("");
    const { error: deleteError } = await supabase.from("school_announcements").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (deleteError) { setError(deleteError.message); return; }
    setDeleteTarget(null); load();
  }

  const backHref = withEstablishmentQuery("/dashboard/ecole/classes", school?.id);
  if (loading) return <SchoolAdminLoadingState label="Chargement de la classe" />;
  if (!classe) return <SchoolAdminEmptyState title="Classe introuvable" description="Cette classe n’est pas disponible dans le contexte actuel." action={<Link href={backHref} className="font-semibold text-[var(--school-admin-primary)]">Retour aux classes</Link>} />;
  return <div className="mx-auto max-w-6xl">
    <Link href={backHref} className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--school-admin-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><ArrowLeft size={16} aria-hidden="true" />Retour aux classes</Link>
    <SchoolAdminPageHeader eyebrow="Gestion scolaire" title={classe.name} description="Informations générales et publications actuellement rattachées à cette classe." actions={<SchoolAdminButton onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} aria-hidden="true" />}>Nouvelle publication</SchoolAdminButton>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SchoolAdminStatCard label="Niveau" value={classe.level || "Non renseigné"} icon={<GraduationCap size={19} />} />
      <SchoolAdminStatCard label="Section" value={classe.section || "Non renseignée"} icon={<GraduationCap size={19} />} tone="neutral" />
      <SchoolAdminStatCard label="Effectif" value={typeof classe.effectif === "number" ? classe.effectif : "Indisponible"} icon={<Users size={19} />} tone="neutral" detail={typeof classe.effectif === "number" ? undefined : "Aucune donnée fournie"} />
      <SchoolAdminStatCard label="Publications" value={posts.length} icon={<Bell size={19} />} />
    </div>
    {error && <div className="mb-5"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <SchoolAdminSectionCard title="Informations générales" description="Uniquement les informations disponibles."><dl className="space-y-4 text-sm"><div><dt className="text-[var(--school-admin-text-muted)]">Classe</dt><dd className="font-semibold">{classe.name}</dd></div><div><dt className="text-[var(--school-admin-text-muted)]">Niveau</dt><dd className="mt-1"><SchoolAdminStatusBadge tone="info" label={classe.level || "Non renseigné"} /></dd></div><div><dt className="text-[var(--school-admin-text-muted)]">Enseignant</dt><dd className="font-semibold">{classe.teacher_name || "Non assigné"}</dd></div><div><dt className="text-[var(--school-admin-text-muted)]">Établissement</dt><dd className="font-semibold">{school?.name || "Contexte actif"}</dd></div></dl></SchoolAdminSectionCard>
      <SchoolAdminSectionCard title="Publications de la classe" description="Le canal existant de publications est conservé. Le module historique d’annonces de classe reste fermé.">{posts.length === 0 ? <SchoolAdminEmptyState title="Aucune publication" description="Aucun message n’est actuellement rattaché à cette classe." icon={<Bell size={24} />} /> : <div className="space-y-3">{posts.map((post) => <article key={post.id} className="rounded-xl border border-[var(--school-admin-border)] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><SchoolAdminStatusBadge tone="neutral" label={POST_TYPES.find((item) => item.value === post.type)?.label || post.type || "Publication"} /><time className="text-xs text-[var(--school-admin-text-muted)]">{new Date(post.created_at).toLocaleDateString("fr-FR")}</time></div><h3 className="font-bold">{post.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--school-admin-text-muted)]">{post.content}</p></div><button type="button" onClick={() => setDeleteTarget(post)} aria-label={`Supprimer la publication ${post.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"><Trash2 size={16} aria-hidden="true" /></button></div></article>)}</div>}</SchoolAdminSectionCard>
    </div>
    <SchoolAdminDialog open={showForm} onClose={() => setShowForm(false)} title="Nouvelle publication" description="Publiez via le canal existant de l’établissement."><form onSubmit={createPost} className="space-y-5"><SchoolAdminFormField id="post-type" label="Type"><SchoolAdminSelect value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{POST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SchoolAdminSelect></SchoolAdminFormField><SchoolAdminFormField id="post-title" label="Titre" required><SchoolAdminInput value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></SchoolAdminFormField><SchoolAdminFormField id="post-content" label="Message" required><SchoolAdminTextarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></SchoolAdminFormField><div className="flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setShowForm(false)}>Annuler</SchoolAdminButton><SchoolAdminButton type="submit" loading={saving}>Publier</SchoolAdminButton></div></form></SchoolAdminDialog>
    <SchoolAdminDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Supprimer cette publication ?" description="Cette action utilise la suppression existante."><p className="text-sm">{deleteTarget?.title}</p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setDeleteTarget(null)}>Annuler</SchoolAdminButton><SchoolAdminButton variant="danger" loading={deleting} onClick={deletePost} leadingIcon={<Trash2 size={15} aria-hidden="true" />}>Supprimer</SchoolAdminButton></div></SchoolAdminDialog>
  </div>;
}
