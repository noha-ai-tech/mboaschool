import { StructuredPricing } from "@/components/school/StructuredPricing";
import { DocumentDownloadCtas } from "@/components/school/DocumentDownloadCtas";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { ParentTab } from "@/components/school/ParentTab";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ViewShell, ViewContextMenu, EmptyViewNote } from "@/components/school/views/ViewShell";

// GUYSKULL-05 §6 — dedicated "Formations & Admissions" view. Structured
// pricing (0037) lives here exclusively; the legacy unqualified flat fee
// never renders as public structured pricing (StructuredPricing's own
// hasDisplayablePricing gate, unchanged). Demo disclaimers ride on the
// existing schedule.notes / additional_fee.notes fields — no hardcoding.
export function FormationsAdmissionsView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, fees, docsList, admissionsConfig } = data;
  const flags = computeMiniSiteFlags(data);

  return (
    <ViewShell>
      <ViewContextMenu
        items={[
          flags.showAdmissions ? { id: "formations", label: "Formations" } : null,
          flags.showAdmissions ? { id: "admissions", label: "Admissions" } : null,
          flags.showPricing ? { id: "tarifs", label: "Tarifs" } : null,
          flags.showAdmissions ? { id: "pieces-requises", label: "Pièces à fournir" } : null,
          flags.showDocuments ? { id: "documents-admissions", label: "Documents" } : null,
        ]}
      />
      <div className="flex-1 w-full space-y-5 min-w-0">
        <h1 className="sr-only">{school.name} — Formations &amp; Admissions</h1>
        {flags.showAdmissions && (
          <div id="formations" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-3">Formations</h2>
            {admissionsConfig?.levels.length ? <p className="text-sm text-text-secondary">{admissionsConfig.levels.join(", ")}</p> : <p className="text-sm text-text-secondary">Formations non renseignées par l&apos;établissement.</p>}
          </div>
        )}
        {flags.showAdmissions && <ParentTab schoolId={school.id} admissionsConfig={admissionsConfig} showLevels={false} showRequiredDocuments={false} />}
        {flags.showPricing && fees && <StructuredPricing pricing={fees} />}
        {flags.showAdmissions && (
          <div id="pieces-requises" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-3">Pièces à fournir</h2>
            {admissionsConfig?.required_documents.length ? <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">{admissionsConfig.required_documents.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-text-secondary">Liste non renseignée par l&apos;établissement.</p>}
          </div>
        )}
        {flags.showDocuments && (
          <div id="documents-admissions" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
            <DocumentDownloadCtas documents={docsList} compact />
            <DocumentsTab docs={docsList} />
          </div>
        )}
        {!flags.showAdmissions && !flags.showPricing && !flags.showDocuments && <EmptyViewNote />}
      </div>
    </ViewShell>
  );
}
