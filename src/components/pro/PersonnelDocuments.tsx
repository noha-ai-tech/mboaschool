"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Upload, FileText, Download, Loader2 } from "lucide-react";

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
      <div className="flex items-center gap-2 mb-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-[#ddd] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0a0a0a]"
        >
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-500 cursor-pointer hover:border-slate-400 transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Envoi…" : "Ajouter un fichier"}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun document.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <span className="flex items-center gap-2 truncate">
                <FileText size={14} className="text-slate-400 shrink-0" />
                {d.file_name}
                <span className="text-xs text-slate-400">
                  ({CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category})
                </span>
              </span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold flex items-center gap-1 shrink-0 ml-2">
                  <Download size={13} /> Voir
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
