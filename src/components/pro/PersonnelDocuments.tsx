"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Upload, FileText, Download, Loader2 } from "lucide-react";
import { SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

const CATEGORIES = [
  { value: "contrat", label: "Contrat" },
  { value: "cv", label: "CV" },
  { value: "diplome", label: "Diplôme" },
  { value: "decision", label: "Décision" },
  { value: "attestation", label: "Attestation" },
  { value: "piece_administrative", label: "Pièce administrative" },
];

type Doc = { id: string; category: string; file_name: string; storage_path: string; url: string | null };

export function PersonnelDocuments({ staffMemberId, initialDocs }: { staffMemberId: string; initialDocs: Doc[] }) {
  const router = useRouter();
  const [docs] = useState(initialDocs);
  const [category, setCategory] = useState("contrat");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");

    const path = `${staffMemberId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("staff-documents").upload(path, file, { upsert: false });
    if (uploadError) { setError(uploadError.message); setUploading(false); return; }

    const { error: dbError } = await supabase.from("staff_documents").insert({
      staff_member_id: staffMemberId,
      category,
      file_name: file.name,
      storage_path: path,
    });
    setUploading(false);
    if (dbError) { setError(dbError.message); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SchoolAdminSelect
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Catégorie du document"
          className="sm:w-56"
        >
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </SchoolAdminSelect>
        <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[var(--school-admin-radius-control)] border border-dashed border-[var(--school-admin-border-strong)] px-4 text-sm font-semibold text-[var(--school-admin-text-muted)] transition hover:bg-[var(--school-admin-surface-muted)] focus-within:ring-2 focus-within:ring-[var(--school-admin-focus)]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Envoi…" : "Ajouter un fichier"}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}

      {docs.length === 0 ? (
        <SchoolAdminEmptyState title="Aucun document" description="Ajoutez une pièce uniquement lorsqu’elle est disponible." icon={<FileText size={22} />} />
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex min-h-12 items-center justify-between rounded-lg border border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] px-3 py-2 text-sm">
              <span className="flex items-center gap-2 truncate">
                <FileText size={14} className="text-slate-400 shrink-0" />
                {d.file_name}
                <span className="text-xs text-slate-400">
                  ({CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category})
                </span>
              </span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="ml-2 flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-[var(--school-admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
                  <Download size={13} aria-hidden="true" /> Voir
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
