import { BookOpen, FolderCheck, Wallet, PhoneCall } from "lucide-react";
import { StructuredPricing } from "@/components/school/StructuredPricing";
import { DocumentDownloadCtas } from "@/components/school/DocumentDownloadCtas";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { ParentTab } from "@/components/school/ParentTab";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ViewBanner } from "@/components/school/views/ViewBanner";
import { ViewShell, ViewContextMenu, EmptyViewNote } from "@/components/school/views/ViewShell";

// GUYSKULL-06 §10 — one of the strongest pages: a banner, then a 4-step
// admissions journey (generic — no online-enrollment claim, since the CTA
// below only ever points at the real /preinscription form), Formations,
// the existing Admissions panel, structured pricing (0037, untouched
// gating logic), pièces à fournir, documents.
const JOURNEY_STEPS = [
  { icon: BookOpen, title: "Choisir la formation", text: "Consultez les niveaux et programmes proposés." },
  { icon: FolderCheck, title: "Préparer le dossier", text: "Réunissez les pièces demandées ci-dessous." },
  { icon: Wallet, title: "Consulter les frais", text: "Vérifiez les tarifs et modalités de paiement." },
  { icon: PhoneCall, title: "Contacter l'établissement", text: "Prenez contact pour finaliser votre préinscription." },
];

export function FormationsAdmissionsView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, fees, docsList, admissionsConfig, images } = data;
  const flags = computeMiniSiteFlags(data);

  return (
    <>
      <ViewBanner
        eyebrow={school.name}
        title="Formations & Admissions"
        subtitle="Niveaux proposés, démarche d'admission, tarifs et pièces à fournir."
        images={images}
        preferredGroups={["classroom", "computer", "pedagogy"]}
      />
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
          {flags.showAdmissions && (
            <div id="formations" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
              <h2 className="font-bold text-sm mb-3">Formations</h2>
              {admissionsConfig?.levels.length ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {admissionsConfig.levels.map((level) => (
                    <div key={level} className="rounded-xl px-3.5 py-3 text-sm font-semibold text-text-primary" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
                      {level}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">Formations non renseignées par l&apos;établissement.</p>
              )}
            </div>
          )}

          {flags.showAdmissions && (
            <div className="bg-white border border-border rounded-card p-6">
              <h2 className="font-bold text-sm mb-4">Démarche d&apos;admission</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {JOURNEY_STEPS.map((step, i) => (
                  <div key={step.title} className="rounded-xl p-3.5" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0" style={{ backgroundColor: "var(--school-primary, #0F2A4A)" }}>
                        {i + 1}
                      </span>
                      <step.icon size={14} style={{ color: "var(--school-accent-gold, #C9A24B)" }} />
                    </div>
                    <p className="font-bold text-xs text-text-primary">{step.title}</p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-1">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flags.showAdmissions && <ParentTab schoolId={school.id} admissionsConfig={admissionsConfig} showLevels={false} showRequiredDocuments={false} />}
          {flags.showPricing && fees && <StructuredPricing pricing={fees} documents={docsList} />}
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
    </>
  );
}
