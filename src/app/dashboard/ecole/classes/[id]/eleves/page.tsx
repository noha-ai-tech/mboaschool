"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Archive, RotateCcw, Pencil, Plus, Search, Upload, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminFilterBar } from "@/components/school-admin/ui/FilterBar";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect, SchoolAdminTextarea } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

// MOBILE-01.1 — surface de gestion du roster réel d'une classe. Nichée
// sous la route canonique déjà existante (/dashboard/ecole/classes/[id]),
// pas une route parallèle. Collecte le strict minimum (prénom/nom/classe)
// — aucune donnée médicale, parentale, académique ou de paiement (Phase 6
// du brief). Le retrait utilise l'archivage (status), jamais un DELETE :
// student_attendance référence students en cascade, une suppression
// physique effacerait silencieusement l'historique de présence déjà
// enregistré.

type Student = { id: string; first_name: string; last_name: string; classe_id: string; status: "active" | "archived" };
type ClassOption = { id: string; name: string };

const MAX_IMPORT_ROWS = 200;

export default function ElevesPage() {
  const classId = useParams().id as string;
  const { school } = useSchool();
  const [classe, setClasse] = useState<any>(null);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", classe_id: "" });

  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<{ first_name: string; last_name: string }[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: classData } = await supabase.from("classes").select("id, name, establishment_id").eq("id", classId).single();
    setClasse(classData ?? null);

    if (classData) {
      const { data: allClasses } = await supabase.from("classes").select("id, name").eq("establishment_id", classData.establishment_id).order("name");
      setClassOptions(allClasses ?? []);
    }

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name, classe_id, status")
      .eq("classe_id", classId)
      .order("last_name", { ascending: true });
    setStudents((studentsData as Student[]) ?? []);
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeStudents = useMemo(() => students.filter((s) => s.status === "active"), [students]);
  const archivedStudents = useMemo(() => students.filter((s) => s.status === "archived"), [students]);
  const visibleStudents = showArchived ? archivedStudents : activeStudents;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleStudents;
    return visibleStudents.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));
  }, [visibleStudents, search]);

  async function addStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classe || saving || !addForm.first_name.trim() || !addForm.last_name.trim()) return;
    setSaving(true);
    setError("");
    const { error: insertError } = await supabase.from("students").insert({
      establishment_id: classe.establishment_id,
      classe_id: classId,
      first_name: addForm.first_name.trim(),
      last_name: addForm.last_name.trim(),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAddForm({ first_name: "", last_name: "" });
    setShowAddForm(false);
    load();
  }

  function openEdit(student: Student) {
    setEditTarget(student);
    setEditForm({ first_name: student.first_name, last_name: student.last_name, classe_id: student.classe_id });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || saving || !editForm.first_name.trim() || !editForm.last_name.trim()) return;
    setSaving(true);
    setError("");
    // establishment_id n'est jamais modifiable ici — seule la classe (au
    // sein du même établissement, la liste déroulante ne propose que les
    // classes déjà chargées pour CET établissement) peut changer.
    const { error: updateError } = await supabase
      .from("students")
      .update({ first_name: editForm.first_name.trim(), last_name: editForm.last_name.trim(), classe_id: editForm.classe_id })
      .eq("id", editTarget.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditTarget(null);
    load();
  }

  async function toggleArchive() {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    setError("");
    const nextStatus = archiveTarget.status === "active" ? "archived" : "active";
    const { error: archiveError } = await supabase.from("students").update({ status: nextStatus }).eq("id", archiveTarget.id);
    setArchiving(false);
    if (archiveError) {
      setError(archiveError.message);
      return;
    }
    setArchiveTarget(null);
    load();
  }

  function parseImportText(text: string) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const errors: string[] = [];
    const rows: { first_name: string; last_name: string }[] = [];

    if (lines.length > MAX_IMPORT_ROWS) {
      errors.push(`Limite de ${MAX_IMPORT_ROWS} lignes dépassée (${lines.length} fournies) — divisez l'import en plusieurs lots.`);
    }

    lines.slice(0, MAX_IMPORT_ROWS).forEach((line, index) => {
      // Format attendu : nom,prenom (une ligne d'en-tête "nom,prenom" est
      // ignorée si présente). Jamais de colonne establishment_id/classe_id
      // dans le fichier — la classe vient exclusivement du contexte
      // autorisé de cette page.
      if (index === 0 && line.toLowerCase().replace(/\s/g, "") === "nom,prenom") return;
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        errors.push(`Ligne ${index + 1} ignorée (attendu "nom,prenom") : "${line}"`);
        return;
      }
      rows.push({ last_name: parts[0], first_name: parts[1] });
    });

    setImportPreview(rows);
    setImportErrors(errors);
  }

  async function confirmImport() {
    if (!classe || !importPreview?.length || importing) return;
    setImporting(true);
    setError("");
    const { error: importError } = await supabase.from("students").insert(
      importPreview.map((row) => ({
        establishment_id: classe.establishment_id,
        classe_id: classId,
        first_name: row.first_name,
        last_name: row.last_name,
      }))
    );
    setImporting(false);
    if (importError) {
      setError(importError.message);
      return;
    }
    setShowImport(false);
    setImportText("");
    setImportPreview(null);
    setImportErrors([]);
    load();
  }

  const backHref = withEstablishmentQuery(`/dashboard/ecole/classes/${classId}`, school?.id);

  if (loading) return <SchoolAdminLoadingState label="Chargement des élèves" />;
  if (!classe) {
    return (
      <SchoolAdminEmptyState
        title="Classe introuvable"
        description="Cette classe n'est pas disponible dans le contexte actuel."
        action={
          <Link href={withEstablishmentQuery("/dashboard/ecole/classes", school?.id)} className="font-semibold text-[var(--school-admin-primary)]">
            Retour aux classes
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={backHref} className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--school-admin-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
        <ArrowLeft size={16} aria-hidden="true" />
        Retour à la classe
      </Link>
      <SchoolAdminPageHeader
        eyebrow="Gestion scolaire"
        title={`Élèves — ${classe.name}`}
        description="Constituez et maintenez la liste réelle des élèves de cette classe. Aucune information au-delà du nom n'est collectée ici."
        actions={
          <div className="flex flex-wrap gap-2">
            <SchoolAdminButton variant="ghost" onClick={() => setShowImport(true)} leadingIcon={<Upload size={16} aria-hidden="true" />}>
              Importer une liste
            </SchoolAdminButton>
            <SchoolAdminButton onClick={() => setShowAddForm(true)} leadingIcon={<Plus size={16} aria-hidden="true" />}>
              Ajouter un élève
            </SchoolAdminButton>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SchoolAdminStatCard label="Élèves actifs" value={activeStudents.length} icon={<Users size={19} />} />
        <SchoolAdminStatCard label="Archivés" value={archivedStudents.length} icon={<Archive size={19} />} tone="neutral" />
      </div>

      {error && (
        <div className="mb-5">
          <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>
        </div>
      )}

      <SchoolAdminFilterBar className="mb-5">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--school-admin-text-soft)]" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un élève…"
            aria-label="Rechercher un élève par nom"
            className="h-10 w-full rounded-lg border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--school-admin-primary)]"
          />
        </div>
        <SchoolAdminSelect value={showArchived ? "archived" : "active"} onChange={(event) => setShowArchived(event.target.value === "archived")} aria-label="Filtrer par statut" className="sm:w-52">
          <option value="active">Élèves actifs</option>
          <option value="archived">Élèves archivés</option>
        </SchoolAdminSelect>
      </SchoolAdminFilterBar>

      {filtered.length === 0 ? (
        <SchoolAdminEmptyState
          title={visibleStudents.length ? "Aucun élève pour cette recherche" : showArchived ? "Aucun élève archivé" : "Aucun élève enregistré"}
          description={visibleStudents.length ? "Essayez un autre terme de recherche." : "Ajoutez un premier élève ou importez une liste pour commencer."}
          icon={<Users size={24} />}
        />
      ) : (
        <>
          <SchoolAdminResponsiveTable label="Liste des élèves" className="hidden md:block">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]">
                <tr>
                  <th scope="col" className="px-5 py-3">Nom</th>
                  <th scope="col" className="px-5 py-3">Prénom</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--school-admin-border)]">
                {filtered.map((student) => (
                  <tr key={student.id} className="hover:bg-[var(--school-admin-surface-muted)]">
                    <th scope="row" className="px-5 py-4 font-semibold text-[var(--school-admin-text)]">{student.last_name}</th>
                    <td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{student.first_name}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {student.status === "active" && (
                          <button
                            type="button"
                            onClick={() => openEdit(student)}
                            aria-label={`Modifier ${student.first_name} ${student.last_name}`}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:bg-[var(--school-admin-primary-soft)] hover:text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(student)}
                          aria-label={student.status === "active" ? `Archiver ${student.first_name} ${student.last_name}` : `Réactiver ${student.first_name} ${student.last_name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:bg-[var(--school-admin-danger-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
                        >
                          {student.status === "active" ? <Archive size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SchoolAdminResponsiveTable>

          <div className="space-y-3 md:hidden" aria-label="Liste des élèves">
            {filtered.map((student) => (
              <article key={student.id} className="rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4 shadow-[var(--school-admin-shadow-sm)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-[var(--school-admin-text)]">{student.first_name} {student.last_name}</p>
                  <div className="flex shrink-0 gap-1">
                    {student.status === "active" && (
                      <button type="button" onClick={() => openEdit(student)} aria-label={`Modifier ${student.first_name} ${student.last_name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" onClick={() => setArchiveTarget(student)} aria-label={student.status === "active" ? `Archiver ${student.first_name} ${student.last_name}` : `Réactiver ${student.first_name} ${student.last_name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-soft)] hover:text-[var(--school-admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
                      {student.status === "active" ? <Archive size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <SchoolAdminDialog open={showAddForm} onClose={() => setShowAddForm(false)} title="Ajouter un élève" description="Uniquement le nom et le prénom — aucune autre information n'est requise.">
        <form onSubmit={addStudent} className="space-y-5">
          <SchoolAdminFormField id="student-last-name" label="Nom" required>
            <SchoolAdminInput value={addForm.last_name} onChange={(event) => setAddForm({ ...addForm, last_name: event.target.value })} placeholder="ex. Mbarga" />
          </SchoolAdminFormField>
          <SchoolAdminFormField id="student-first-name" label="Prénom" required>
            <SchoolAdminInput value={addForm.first_name} onChange={(event) => setAddForm({ ...addForm, first_name: event.target.value })} placeholder="ex. Jean" />
          </SchoolAdminFormField>
          <div className="flex justify-end gap-2">
            <SchoolAdminButton variant="ghost" onClick={() => setShowAddForm(false)}>Annuler</SchoolAdminButton>
            <SchoolAdminButton type="submit" loading={saving} leadingIcon={<Plus size={15} aria-hidden="true" />}>Ajouter</SchoolAdminButton>
          </div>
        </form>
      </SchoolAdminDialog>

      <SchoolAdminDialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Modifier l'élève" description="Corrigez le nom ou déplacez l'élève vers une autre classe de cet établissement.">
        <form onSubmit={saveEdit} className="space-y-5">
          <SchoolAdminFormField id="edit-last-name" label="Nom" required>
            <SchoolAdminInput value={editForm.last_name} onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })} />
          </SchoolAdminFormField>
          <SchoolAdminFormField id="edit-first-name" label="Prénom" required>
            <SchoolAdminInput value={editForm.first_name} onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })} />
          </SchoolAdminFormField>
          <SchoolAdminFormField id="edit-classe" label="Classe">
            <SchoolAdminSelect value={editForm.classe_id} onChange={(event) => setEditForm({ ...editForm, classe_id: event.target.value })}>
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </SchoolAdminSelect>
          </SchoolAdminFormField>
          <div className="flex justify-end gap-2">
            <SchoolAdminButton variant="ghost" onClick={() => setEditTarget(null)}>Annuler</SchoolAdminButton>
            <SchoolAdminButton type="submit" loading={saving}>Enregistrer</SchoolAdminButton>
          </div>
        </form>
      </SchoolAdminDialog>

      <SchoolAdminDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title={archiveTarget?.status === "active" ? "Archiver cet élève ?" : "Réactiver cet élève ?"}
        description={
          archiveTarget?.status === "active"
            ? "L'élève archivé disparaît du roster actif et de l'appel, mais son historique de présence est conservé et il peut être réactivé à tout moment."
            : "L'élève réapparaîtra dans le roster actif et pourra de nouveau être marqué présent/absent/en retard."
        }
      >
        <p className="text-sm text-[var(--school-admin-text-muted)]">
          Élève concerné : <strong className="text-[var(--school-admin-text)]">{archiveTarget?.first_name} {archiveTarget?.last_name}</strong>
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <SchoolAdminButton variant="ghost" onClick={() => setArchiveTarget(null)}>Annuler</SchoolAdminButton>
          <SchoolAdminButton variant={archiveTarget?.status === "active" ? "danger" : "primary"} loading={archiving} onClick={toggleArchive} leadingIcon={archiveTarget?.status === "active" ? <Archive size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}>
            {archiveTarget?.status === "active" ? "Archiver" : "Réactiver"}
          </SchoolAdminButton>
        </div>
      </SchoolAdminDialog>

      <SchoolAdminDialog
        open={showImport}
        onClose={() => {
          setShowImport(false);
          setImportText("");
          setImportPreview(null);
          setImportErrors([]);
        }}
        title="Importer une liste d'élèves"
        description={`Collez une ligne par élève au format "nom,prenom" (maximum ${MAX_IMPORT_ROWS} lignes). La classe et l'établissement sont toujours ceux de cette page — jamais indiqués dans le texte collé.`}
      >
        <div className="space-y-4">
          <SchoolAdminFormField id="import-text" label="Liste (nom,prenom — une ligne par élève)">
            <SchoolAdminTextarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
                setImportErrors([]);
              }}
              rows={6}
              placeholder={"Mbarga,Jean\nNgo,Marie\nNana,Paul"}
            />
          </SchoolAdminFormField>

          {!importPreview && (
            <SchoolAdminButton variant="ghost" onClick={() => parseImportText(importText)} disabled={!importText.trim()}>
              Vérifier
            </SchoolAdminButton>
          )}

          {importErrors.length > 0 && (
            <SchoolAdminAlert tone="danger">
              <ul className="list-disc space-y-1 pl-4">
                {importErrors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </SchoolAdminAlert>
          )}

          {importPreview && importPreview.length > 0 && (
            <div className="rounded-xl border border-[var(--school-admin-border)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--school-admin-text-muted)]">
                {importPreview.length} élève{importPreview.length !== 1 ? "s" : ""} prêt{importPreview.length !== 1 ? "s" : ""} à importer
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {importPreview.map((row, index) => (
                  <li key={index}>{row.last_name} {row.first_name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <SchoolAdminButton variant="ghost" onClick={() => { setShowImport(false); setImportText(""); setImportPreview(null); setImportErrors([]); }}>
              Annuler
            </SchoolAdminButton>
            {importPreview && importPreview.length > 0 && (
              <SchoolAdminButton onClick={confirmImport} loading={importing} leadingIcon={<Upload size={15} aria-hidden="true" />}>
                Importer {importPreview.length} élève{importPreview.length !== 1 ? "s" : ""}
              </SchoolAdminButton>
            )}
          </div>
        </div>
      </SchoolAdminDialog>
    </div>
  );
}
