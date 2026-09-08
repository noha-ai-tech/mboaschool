import { Clock, CreditCard } from "lucide-react";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

export default function PaiementsPage() { return <div className="mx-auto max-w-5xl"><SchoolAdminPageHeader eyebrow="Paie et frais" title="Paiements" description="Suivez ici la disponibilité des moyens de paiement de l’établissement." /><SchoolAdminSectionCard title="Paiements Mobile Money" description="Aucun service de paiement n’est actif." action={<SchoolAdminStatusBadge tone="warning" label="Prochainement" icon={<Clock size={14} />} />}><SchoolAdminEmptyState title="Fonctionnalité indisponible" description="Orange Money, MTN MoMo et CinetPay ne sont pas activés. Aucune transaction ou activité de paiement n’est créée." icon={<CreditCard size={24} />} /></SchoolAdminSectionCard></div>; }
