import { redirect } from "next/navigation";

// Les tarifs publiés suivent désormais le cycle Brouillon → Aperçu →
// Publication de l'éditeur d'établissement. Cette ancienne page écrivait
// directement dans public.fees et est donc volontairement fermée.
export default function LegacyFeesPage() {
  redirect("/dashboard/ecole/etablissement");
}
