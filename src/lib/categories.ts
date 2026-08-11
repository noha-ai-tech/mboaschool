import { Baby, School, Building2, GraduationCap, Wrench, type LucideIcon } from "lucide-react";

// Grandes familles d'établissements — partagées entre la Landing et les
// pages publiques (Header, Footer, pages d'authentification…) pour éviter
// toute duplication/désynchronisation de cette liste.
export type Category = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  subcategories: string[];
};

export const categories: Category[] = [
  {
    key: "garderie",
    label: "Garderie",
    icon: Baby,
    description: "De 0 à 5 ans",
    subcategories: ["Crèche", "Prématernelle", "Maternelle"],
  },
  {
    key: "primaire",
    label: "Primaire",
    icon: School,
    description: "Du CP au CM2",
    subcategories: ["Public", "Privé", "Confessionnel", "Bilingue"],
  },
  {
    key: "secondaire",
    label: "Secondaire",
    icon: Building2,
    description: "De la 6e à la Terminale",
    subcategories: ["Lycée public", "Collège privé", "Technique", "Bilingue"],
  },
  {
    key: "superieur",
    label: "Supérieur",
    icon: GraduationCap,
    description: "Universités & grandes écoles",
    subcategories: ["Université", "Grande école", "Institut supérieur"],
  },
  {
    key: "autres",
    label: "Formations",
    icon: Wrench,
    description: "Professionnelles & techniques",
    subcategories: ["Santé", "Auto-école", "Couture", "Coiffure", "Hôtellerie", "Informatique", "Langues"],
  },
];
