import { Baby, Building2, GraduationCap, School, Wrench } from "lucide-react";

export const CAT_META: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  subcategories: string[];
}> = {
  garderie: {
    label: "Garderie & Maternelle",
    description: "Crèches, prématernelles et maternelles pour les tout-petits.",
    icon: Baby,
    color: "text-pink-400",
    subcategories: ["Crèche", "Prématernelle", "Maternelle"],
  },
  primaire: {
    label: "École Primaire",
    description: "Établissements d'enseignement primaire publics, privés et confessionnels.",
    icon: School,
    color: "text-emerald-400",
    subcategories: ["Public", "Privé laïc", "Confessionnel", "Bilingue"],
  },
  secondaire: {
    label: "Enseignement Secondaire",
    description: "Collèges, lycées généraux, techniques et bilingues.",
    icon: Building2,
    color: "text-blue-400",
    subcategories: ["Collège", "Lycée général", "Lycée technique", "Lycée bilingue"],
  },
  superieur: {
    label: "Enseignement Supérieur",
    description: "Universités, grandes écoles, instituts et formations BTS/IUT.",
    icon: GraduationCap,
    color: "text-yellow-400",
    subcategories: ["Université", "Grande école", "Institut supérieur", "BTS / IUT"],
  },
  autres: {
    label: "Formations & Métiers",
    description: "Centres de formation professionnelle, langues, arts et métiers.",
    icon: Wrench,
    color: "text-orange-400",
    subcategories: ["Santé", "Informatique", "Langues", "Auto-école", "Couture", "Hôtellerie"],
  },
};
