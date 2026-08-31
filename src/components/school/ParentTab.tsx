import Link from "next/link";
import { ClipboardList, GraduationCap, Bell, FileText, CalendarDays, ListChecks, Info, XCircle } from "lucide-react";

// CMS-D.1 — configuration Admissions PUBLIQUE (admissions_config, migration
// 0025, préparée mais NON exécutée). Strictement distinct de
// `public.applications` (dossiers individuels privés) : ce type ne
// contient et ne doit jamais contenir de donnée candidat/parent/paiement.
export type AdmissionsConfig = {
  is_open: boolean;
  levels: string[];
  conditions: string | null;
  required_documents: string[];
  period_start: string | null;
  period_end: string | null;
  additional_info: string | null;
};

function formatPeriodDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Absence de configuration (aucune ligne admissions_config pour cette
// école — cas normal, lazy configuration §5/§6) : comportement identique
// à avant CMS-D.1, CTA toujours actif.
export function ParentTab({ schoolId, admissionsConfig, showLevels = true, showRequiredDocuments = true }: {
  schoolId: string;
  admissionsConfig?: AdmissionsConfig | null;
  showLevels?: boolean;
  showRequiredDocuments?: boolean;
}) {
  const cards = [
    { icon: ClipboardList, title: "Dossier de l'enfant",  text: "Statut d'admission, pièces manquantes, décision de l'école." },
    { icon: GraduationCap,  title: "Classe assignée",     text: "Classe, enseignant, annonces et documents de classe." },
    { icon: Bell,           title: "Messages école",      text: "Communiqués, rappels, réunions et urgences." },
    { icon: FileText,       title: "Documents & frais",   text: "Reçus, frais à payer, calendrier et documents scolaires." },
  ];

  const isOpen = admissionsConfig?.is_open ?? true;
  const hasPeriod = !!(admissionsConfig?.period_start || admissionsConfig?.period_end);

  return (
    <div id="admissions" className="bg-accent text-white rounded-card p-6 scroll-mt-20">
      <h2 className="font-black text-2xl mb-2">Admissions</h2>
      <p className="text-white/60 text-sm mb-6 leading-relaxed">
        Préinscrivez votre enfant en ligne. Une fois le dossier accepté, cet
        espace devient le lien entre le parent, l&apos;élève et l&apos;école.
      </p>

      {admissionsConfig && !isOpen && (
        <div className="flex items-start gap-2.5 bg-white/8 border border-white/15 rounded-xl p-4 mb-6">
          <XCircle size={16} className="text-white/70 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-white">Admissions actuellement fermées.</p>
        </div>
      )}

      {admissionsConfig && (admissionsConfig.levels.length > 0 || admissionsConfig.conditions || admissionsConfig.required_documents.length > 0 || hasPeriod || admissionsConfig.additional_info) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {showLevels && admissionsConfig.levels.length > 0 && (
            <AdmissionsInfoCard icon={GraduationCap} title="Niveaux proposés">
              <p className="text-xs text-white/70 leading-relaxed">{admissionsConfig.levels.join(", ")}</p>
            </AdmissionsInfoCard>
          )}
          {hasPeriod && (
            <AdmissionsInfoCard icon={CalendarDays} title="Période d'inscription">
              <p className="text-xs text-white/70 leading-relaxed">
                {admissionsConfig.period_start ? formatPeriodDate(admissionsConfig.period_start) : "—"}
                {" → "}
                {admissionsConfig.period_end ? formatPeriodDate(admissionsConfig.period_end) : "—"}
              </p>
            </AdmissionsInfoCard>
          )}
          {showRequiredDocuments && admissionsConfig.required_documents.length > 0 && (
            <AdmissionsInfoCard icon={ListChecks} title="Documents requis">
              <ul className="text-xs text-white/70 leading-relaxed list-disc list-inside">
                {admissionsConfig.required_documents.map((doc) => <li key={doc}>{doc}</li>)}
              </ul>
            </AdmissionsInfoCard>
          )}
          {admissionsConfig.conditions && (
            <AdmissionsInfoCard icon={Info} title="Conditions d'admission">
              <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{admissionsConfig.conditions}</p>
            </AdmissionsInfoCard>
          )}
          {admissionsConfig.additional_info && (
            <AdmissionsInfoCard icon={Info} title="Informations complémentaires">
              <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{admissionsConfig.additional_info}</p>
            </AdmissionsInfoCard>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/8">
            <Icon size={15} className="text-primary-light mb-3" />
            <h3 className="font-bold text-sm text-white mb-1">{title}</h3>
            <p className="text-xs text-white/60 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {isOpen ? (
        <Link
          href={`/preinscription?ecole=${schoolId}`}
          className="inline-block bg-[#FCD116] text-[#0A0A0A] px-5 py-2.5 rounded-card text-sm font-bold hover:bg-[#FCD116]/90 transition-colors duration-base"
        >
          Préinscrire mon enfant
        </Link>
      ) : (
        <p className="text-xs text-white/50">Le formulaire de préinscription rouvrira à la prochaine période d&apos;admission.</p>
      )}
    </div>
  );
}

function AdmissionsInfoCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/8">
      <h3 className="flex items-center gap-1.5 font-bold text-xs text-white mb-2">
        <Icon size={13} className="text-primary-light" /> {title}
      </h3>
      {children}
    </div>
  );
}
