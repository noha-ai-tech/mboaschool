import { redirect } from "next/navigation";
import { Globe, BookOpen, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { FormulaireMessage } from "@/components/pro/FormulaireMessage";

export default async function MessageriePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const etablissement = await getActiveEstablishment(supabase, user.id);
  if (!etablissement) redirect("/dashboard/ecole");

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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Messagerie interne</h1>
        <p className="text-sm text-gray-500 mt-1">
          Envoyez des messages à tout l&apos;établissement ou à un département disciplinaire.
        </p>
      </div>

      {/* Confirmation d'envoi */}
      {params.sent === "1" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
          <span className="font-medium">Message envoyé avec succès.</span>
        </div>
      )}

      {/* Formulaire d'envoi */}
      <FormulaireMessage departements={departementsUniques} />

      {/* Liste des messages envoyés */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-4">
          Messages envoyés
        </h2>

        {!messages?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            Aucun message envoyé pour l&apos;instant.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <article
                key={m.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  {/* Badge canal */}
                  {m.canal === "global" ? (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold shrink-0">
                      <Globe size={10} />
                      Global
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold shrink-0 max-w-[200px] truncate">
                      <BookOpen size={10} className="shrink-0" />
                      {m.departement_disciplinaire}
                    </span>
                  )}

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
