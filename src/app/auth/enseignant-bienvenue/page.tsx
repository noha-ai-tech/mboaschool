// Page de liaison compte enseignant.
// L'enseignant arrive ici après avoir accepté son invitation et que le callback
// a établi sa session. On lie enseignants.user_id = auth.uid() via le client
// admin (service role) pour contourner le RLS sur la ligne non encore liée.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Logo } from "@/components/branding/Logo";

export default async function EnseignantBienvenueePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/connexion");
  }

  // Liaison user_id sur TOUTES les lignes enseignants correspondant à cet email
  // (un enseignant peut enseigner dans plusieurs établissements — toutes les
  // lignes avec user_id null et cet email sont liées en une seule passe).
  const admin = createAdminClient();
  const { data: enseignants } = await admin
    .from("enseignants")
    .select("id, nom, prenom, user_id")
    .eq("email", user.email!)
    .is("user_id", null);

  let nom = "";
  let prenom = "";
  let deja_lie = false;

  if (enseignants && enseignants.length > 0) {
    // Première connexion : liaison de toutes les lignes en une requête
    const ids = enseignants.map((e) => e.id);
    await admin
      .from("enseignants")
      .update({ user_id: user.id })
      .in("id", ids);

    // Synchronise staff_members.user_id (Mission 04 — fondation RH) pour les
    // fiches liées à ces enseignants, si elles existent déjà (migration
    // 0009_pro_hr_foundation.sql, non exécutée). N'affecte en rien le flux
    // enseignant existant ci-dessus si la table n'existe pas encore.
    await admin.from("staff_members").update({ user_id: user.id }).in("enseignant_id", ids);

    nom = enseignants[0].nom;
    prenom = enseignants[0].prenom;
  } else {
    // Peut-être déjà lié (rechargement de page)
    const { data: enseignantLie } = await admin
      .from("enseignants")
      .select("id, nom, prenom")
      .eq("user_id", user.id)
      .maybeSingle();

    if (enseignantLie) {
      nom = enseignantLie.nom;
      prenom = enseignantLie.prenom;
      deja_lie = true;
    } else {
      // Compte non reconnu comme enseignant — redirection connexion standard
      redirect("/dashboard/ecole");
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f3ef] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {deja_lie ? `Bienvenue, ${prenom} !` : `Compte activé, ${prenom} !`}
        </h1>
        <p className="text-gray-500 text-sm mb-2">
          {prenom} {nom}
        </p>
        <p className="text-gray-500 text-sm mb-8">
          {deja_lie
            ? "Votre espace personnel est prêt."
            : "Votre compte enseignant a bien été lié. Vous pouvez maintenant accéder à votre espace personnel."}
        </p>

        <Link
          href="/enseignant/mon-espace"
          className="block w-full py-3 px-6 rounded-xl bg-[#007A3D] text-white font-semibold text-sm hover:bg-[#006030] transition-colors"
        >
          Accéder à mon espace →
        </Link>
      </div>
    </div>
  );
}
