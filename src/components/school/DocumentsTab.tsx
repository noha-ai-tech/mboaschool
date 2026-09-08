import { FileText, Download } from "lucide-react";
import { SCHOOL_DOCUMENT_TYPE_LABELS, type SchoolDocument } from "@/lib/schoolPage/documents";

export function DocumentsTab({ docs }: { docs: SchoolDocument[] }) {
  return (
    <div className="space-y-3">
      {docs.map((doc) => {
        const typeLabel = SCHOOL_DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type;
        return (
          <div key={doc.id} className="bg-white border border-border rounded-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <FileText size={16} className="text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-text-primary truncate">{doc.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">{typeLabel}{doc.academic_year ? ` · ${doc.academic_year}` : ""}</p>
              {doc.description && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{doc.description}</p>}
            </div>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 bg-primary-light px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors duration-base"
            >
              <Download size={12} />
              Télécharger
            </a>
          </div>
        );
      })}
    </div>
  );
}
