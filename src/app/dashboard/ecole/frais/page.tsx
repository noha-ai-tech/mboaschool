import { redirect } from "next/navigation";

// Les tarifs publiés suivent désormais le cycle Brouillon → Aperçu →
// Publication de l'éditeur d'établissement. Cette ancienne page écrivait
// directement dans public.fees et est donc volontairement fermée.
//
// RELEASE-CONSOLIDATION-02 §5A — acc7175 (feat(school-admin): unify
// management interface) restyled this route with the new SchoolAdmin UI
// shell, unaware it had been closed: that version still wrote straight to
// public.fees, bypassing the Draft/Preview/Publish authorization model.
// Guyskull's closure wins; do not resurrect the legacy form here.
export default function LegacyFeesPage() {
  redirect("/dashboard/ecole/etablissement");
}
