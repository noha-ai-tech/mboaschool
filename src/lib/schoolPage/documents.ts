export const SCHOOL_DOCUMENT_TYPES = [
  "fiche", "inscription", "pieces", "fournitures", "tarifs", "reglement", "brochure", "calendrier", "autre",
] as const;

export type SchoolDocumentType = (typeof SCHOOL_DOCUMENT_TYPES)[number];

export type SchoolDocument = {
  id: string;
  name: string;
  type: string;
  url: string;
  academic_year?: string | null;
  mime_type?: string | null;
  description?: string | null;
  is_public?: boolean;
  status?: string;
};

export const SCHOOL_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  fiche: "Fiche de renseignements",
  inscription: "Fiche d'inscription",
  pieces: "Liste des pièces à fournir",
  fournitures: "Liste des fournitures",
  tarifs: "Tarifs et modalités de paiement",
  reglement: "Règlement intérieur",
  brochure: "Brochure de l'établissement",
  calendrier: "Calendrier scolaire",
  autre: "Document",
};

const CTA_LABELS: Partial<Record<SchoolDocumentType, string>> = {
  inscription: "Télécharger la fiche d'inscription",
  tarifs: "Télécharger les tarifs",
  reglement: "Télécharger le règlement intérieur",
  brochure: "Télécharger la brochure",
};

export function getPublishedDocumentCtas(documents: SchoolDocument[]) {
  return documents.flatMap((document) => {
    const label = CTA_LABELS[document.type as SchoolDocumentType];
    const published = document.status === undefined || document.status === "live";
    const visible = document.is_public === undefined || document.is_public;
    const validUrl = /^https:\/\//i.test(document.url);
    return label && published && visible && validUrl ? [{ id: document.id, label, url: document.url }] : [];
  });
}
