import { Download } from "lucide-react";
import { getPublishedDocumentCtas, type SchoolDocument } from "@/lib/schoolPage/documents";

export function DocumentDownloadCtas({ documents, compact = false }: { documents: SchoolDocument[]; compact?: boolean }) {
  const ctas = getPublishedDocumentCtas(documents);
  if (ctas.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "rounded-card border border-border bg-white p-4"}`}>
      {ctas.map((cta) => (
        <a key={cta.id} href={cta.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-card bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-dark">
          <Download size={14} />{cta.label}
        </a>
      ))}
    </div>
  );
}
