import { redirect } from "next/navigation";
import { Globe, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireMessage } from "@/components/pro/FormulaireMessage";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminAlert, SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

export default async function MessageriePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; school?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await requireActiveEstablishment(supabase, user.id, params.school, "/pro/messagerie");

  // Départements disponibles dans l'établissement
  const { data: departements } = await supabase
    .from("matieres")
    .select("departement_disciplinaire")
    .eq("etablissement_id", etablissement.id)
    .not("departement_disciplinaire", "is", null)
    .order("departement_disciplinaire");

  const departementsUniques: string[] = Array.from(
    new Set(
      (departements ?? [])
        .map((d) => d.departement_disciplinaire as string)
        .filter(Boolean)
    )
  ).sort();

  // Messages déjà envoyés, les plus récents en premier
  const { data: messages } = await supabase
    .from("messages")
    .select("id, canal, departement_disciplinaire, titre, contenu, created_at")
    .eq("etablissement_id", etablissement.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-5xl">
      <SchoolAdminPageHeader eyebrow="Communications" title="Messagerie interne" description="Envoyez un message à l’établissement ou à un département disciplinaire existant." />

      {/* Confirmation d'envoi */}
      {params.sent === "1" && (
        <div className="mb-6"><SchoolAdminAlert tone="success">Message envoyé avec succès.</SchoolAdminAlert></div>
      )}

      {/* Formulaire d'envoi */}
      <SchoolAdminSectionCard title="Nouveau message" description="Aucun email, SMS, réponse ou pièce jointe n’est envoyé."><FormulaireMessage departements={departementsUniques} establishmentId={etablissement.id} /></SchoolAdminSectionCard>

      {/* Liste des messages envoyés */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-4">
          Messages envoyés
        </h2>

        {!messages?.length ? (
          <SchoolAdminEmptyState title="Aucun message envoyé" description="L’historique des messages internes apparaîtra ici." />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <article
                key={m.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  {/* Badge canal */}
                  <SchoolAdminStatusBadge tone={m.canal === "global" ? "info" : "neutral"} label={m.canal === "global" ? "Établissement" : (m.departement_disciplinaire || "Département indisponible")} icon={m.canal === "global" ? <Globe size={10} /> : <BookOpen size={10} />} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-sm truncate">{m.titre}</p>
                      <time className="text-xs text-gray-400 shrink-0">
                        {new Date(m.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {m.contenu}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
